import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { generateMockData, generateEventStream } from './mockData.js';
import { runMatchingEngine, runActivityClassification, DataStore, MatchResult } from './matchingEngine.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory data store
const store: DataStore = {
  shopRecords: [],
  kspcbRecords: [],
  factoryRecords: [],
  matchResults: [],
  ubids: new Map(),
  events: [],
  auditLog: [],
  reviewQueue: [],
};

// Initialize data on server start
function initialize() {
  const { shopRecords, kspcbRecords, factoryRecords } = generateMockData();
  store.shopRecords = shopRecords;
  store.kspcbRecords = kspcbRecords;
  store.factoryRecords = factoryRecords;
  store.events = generateEventStream();
  store.auditLog = [];
  runMatchingEngine(store);
  runActivityClassification(store);
  console.log(`Initialized: ${store.ubids.size} UBIDs, ${store.reviewQueue.length} pending reviews, ${store.events.length} events`);
}

initialize();

// API Endpoints

// GET /api/ubids — return all UBIDs with status and linked records
app.get('/api/ubids', (_req, res) => {
  const ubids = Array.from(store.ubids.values());
  res.json(ubids);
});

// GET /api/ubids/:id — return full detail for one UBID
app.get('/api/ubids/:id', (req, res) => {
  const ubid = store.ubids.get(req.params.id);
  if (!ubid) {
    res.status(404).json({ error: 'UBID not found' });
    return;
  }

  // Get all raw records for this UBID
  const allRecords = [
    ...store.shopRecords,
    ...store.kspcbRecords,
    ...store.factoryRecords,
  ];
  const linkedRecords = ubid.linked_records.map(lr => {
    const raw = allRecords.find(r => r.record_id === lr.record_id);
    return { ...lr, raw };
  });

  // Get match results for this UBID
  const matchResults = store.matchResults.filter(r => r.ubid === req.params.id);

  // Get events for this UBID
  const events = store.events.filter(e => e.ubid === req.params.id);

  res.json({ ...ubid, linked_records: linkedRecords, match_results: matchResults, events });
});

// POST /api/match — run the matching engine on all department data
app.post('/api/match', (_req, res) => {
  runMatchingEngine(store);
  runActivityClassification(store);
  res.json({
    total_ubids: store.ubids.size,
    auto_linked: store.matchResults.filter(r => r.outcome === 'Auto-Link').length,
    review_needed: store.reviewQueue.length,
    keep_separate: store.matchResults.filter(r => r.outcome === 'Keep Separate').length,
  });
});

// POST /api/classify — run activity classification
app.post('/api/classify', (_req, res) => {
  runActivityClassification(store);
  const statusCounts = { Active: 0, Dormant: 0, Closed: 0 };
  store.ubids.forEach(u => { statusCounts[u.status]++; });
  res.json(statusCounts);
});

// GET /api/review-queue — return all Review Needed pairs
app.get('/api/review-queue', (_req, res) => {
  const allRecords = [
    ...store.shopRecords,
    ...store.kspcbRecords,
    ...store.factoryRecords,
  ];

  const queue = store.reviewQueue.map(item => {
    const recA = allRecords.find(r => r.record_id === item.record_a.record_id);
    const recB = allRecords.find(r => r.record_id === item.record_b.record_id);
    return { ...item, record_a_full: recA, record_b_full: recB };
  });

  res.json(queue);
});

// POST /api/review/:pairId — submit reviewer decision
app.post('/api/review/:pairId', (req, res) => {
  const { pairId } = req.params;
  const { decision, reviewer_id } = req.body;

  const item = store.reviewQueue.find(r => r.pair_id === pairId);
  if (!item) {
    res.status(404).json({ error: 'Pair not found in review queue' });
    return;
  }

  item.reviewer_decision = decision;

  // Log the action
  store.auditLog.push({
    timestamp: new Date().toISOString(),
    reviewer_id: reviewer_id || 'reviewer_001',
    pair_id: pairId,
    decision,
    record_a: item.record_a,
    record_b: item.record_b,
    confidence: item.confidence,
  });

  if (decision === 'approved') {
    // Merge the two records under a UBID
    const existingUBIDForA = Array.from(store.ubids.values()).find(u =>
      u.linked_records.some(lr => lr.record_id === item.record_a.record_id)
    );
    const existingUBIDForB = Array.from(store.ubids.values()).find(u =>
      u.linked_records.some(lr => lr.record_id === item.record_b.record_id)
    );

    if (existingUBIDForA && existingUBIDForB && existingUBIDForA.ubid !== existingUBIDForB.ubid) {
      // Merge B into A
      existingUBIDForA.linked_records = [...existingUBIDForA.linked_records, ...existingUBIDForB.linked_records];
      existingUBIDForA.source_departments = [...new Set([...existingUBIDForA.source_departments, ...existingUBIDForB.source_departments])];
      store.ubids.delete(existingUBIDForB.ubid);
      // Update events
      store.events.forEach(e => { if (e.ubid === existingUBIDForB.ubid) e.ubid = existingUBIDForA.ubid; });
      item.ubid = existingUBIDForA.ubid;
    } else if (existingUBIDForA) {
      existingUBIDForA.linked_records.push({ record_id: item.record_b.record_id, department: item.record_b.department, business_name: item.record_b.business_name });
      if (!existingUBIDForA.source_departments.includes(item.record_b.department)) {
        existingUBIDForA.source_departments.push(item.record_b.department);
      }
      item.ubid = existingUBIDForA.ubid;
    } else if (existingUBIDForB) {
      existingUBIDForB.linked_records.push({ record_id: item.record_a.record_id, department: item.record_a.department, business_name: item.record_a.business_name });
      if (!existingUBIDForB.source_departments.includes(item.record_a.department)) {
        existingUBIDForB.source_departments.push(item.record_a.department);
      }
      item.ubid = existingUBIDForB.ubid;
    } else {
      // Create new UBID
      const newUBID = `UBID-KA-${Math.floor(100000 + Math.random() * 900000)}`;
      const ubidRecord = {
        ubid: newUBID,
        linked_records: [item.record_a, item.record_b],
        status: 'Active' as const,
        last_event_date: null,
        last_event_type: null,
        source_departments: [item.record_a.department, item.record_b.department],
        evidence_count: 0,
        sector: null,
        pin_code: '',
        primary_name: item.record_a.business_name,
        confidence: item.confidence,
      };
      store.ubids.set(newUBID, ubidRecord);
      item.ubid = newUBID;
    }

    item.outcome = 'Auto-Link';
  } else if (decision === 'rejected') {
    item.outcome = 'Keep Separate';
  }
  // 'defer' and 'split' keep the item in review queue or handle accordingly

  if (decision === 'approved' || decision === 'rejected') {
    store.reviewQueue = store.reviewQueue.filter(r => r.pair_id !== pairId);
  }

  res.json({ success: true, decision });
});

// GET /api/departments — return department summary stats
app.get('/api/departments', (_req, res) => {
  const departments = [
    {
      name: 'Shop & Establishment',
      total_records: store.shopRecords.length,
      last_synced: '2026-05-05T10:30:00Z',
      match_rate: 0,
      auto_linked: 0,
      in_review: 0,
    },
    {
      name: 'KSPCB',
      total_records: store.kspcbRecords.length,
      last_synced: '2026-05-05T10:30:00Z',
      match_rate: 0,
      auto_linked: 0,
      in_review: 0,
    },
    {
      name: 'Factories',
      total_records: store.factoryRecords.length,
      last_synced: '2026-05-05T10:30:00Z',
      match_rate: 0,
      auto_linked: 0,
      in_review: 0,
    },
  ];

  // Calculate stats
  departments.forEach(dept => {
    const deptRecords = store.matchResults.filter(r =>
      r.record_a.department === dept.name || r.record_b.department === dept.name
    );
    const total = deptRecords.length;
    dept.auto_linked = deptRecords.filter(r => r.outcome === 'Auto-Link').length;
    dept.in_review = deptRecords.filter(r => r.outcome === 'Review Needed').length;
    dept.match_rate = total > 0 ? Math.round((dept.auto_linked / total) * 100) : 0;
  });

  res.json(departments);
});

// GET /api/events — return full event stream
app.get('/api/events', (_req, res) => {
  res.json(store.events);
});

// GET /api/audit-log — return all reviewer actions
app.get('/api/audit-log', (_req, res) => {
  res.json(store.auditLog);
});

// GET /api/query/factories-no-inspection — return factories with no inspection in 18 months
app.get('/api/query/factories-no-inspection', (_req, res) => {
  const eighteenMonthsAgo = new Date('2026-05-05');
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
  const cutoffDate = eighteenMonthsAgo.toISOString().split('T')[0];

  const results: any[] = [];
  store.ubids.forEach(ubid => {
    if (ubid.sector !== 'Manufacturing' && ubid.sector !== 'Food Processing' && ubid.sector !== 'Construction' && ubid.sector !== 'Mining') return;
    if (ubid.status === 'Closed') return;

    const ubidEvents = store.events.filter(e => e.ubid === ubid.ubid);
    const inspectionEvents = ubidEvents.filter(e =>
      e.event_type.toLowerCase().includes('inspection')
    );

    const lastInspection = inspectionEvents.sort((a: any, b: any) =>
      b.event_date.localeCompare(a.event_date)
    )[0];

    if (!lastInspection || lastInspection.event_date < cutoffDate) {
      results.push({
        ubid: ubid.ubid,
        business_name: ubid.primary_name,
        sector: ubid.sector,
        pin_code: ubid.pin_code,
        status: ubid.status,
        last_inspection: lastInspection ? lastInspection.event_date : 'Never',
        departments: ubid.source_departments,
        confidence: ubid.confidence,
      });
    }
  });

  res.json(results);
});

const PORT = 3001;

// Serve static files from the Vite build output
const distPath = path.join(process.cwd(), 'dist');

// Auto-build if dist/ doesn't exist
if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('dist/ not found, running vite build...');
  try {
    execSync('npx vite build', { stdio: 'inherit', cwd: process.cwd() });
    console.log('Build complete.');
  } catch (e) {
    console.error('Build failed. Frontend will not be available.');
  }
}

if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));

  // SPA fallback — serve index.html for all non-API routes
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // No frontend available — return helpful message for non-API routes
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(500).send('Frontend not built. Run: npm run build');
  });
}

app.listen(PORT, () => {
  console.log(`KBIG server running on port ${PORT}`);
  console.log(`Serving frontend from: ${distPath}`);
});
