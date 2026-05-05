// Multi-signal matching engine for KBIG
// Computes confidence scores between records across departments

export interface SignalBreakdown {
  pan_match: number;
  gstin_match: number;
  name_similarity: number;
  pin_match: number;
  address_overlap: number;
  phone_match: number;
  owner_similarity: number;
  total: number;
}

export interface MatchResult {
  pair_id: string;
  record_a: { record_id: string; department: string; business_name: string };
  record_b: { record_id: string; department: string; business_name: string };
  confidence: number;
  signals: SignalBreakdown;
  outcome: 'Auto-Link' | 'Review Needed' | 'Keep Separate';
  ubid: string | null;
  reviewer_decision: 'pending' | 'approved' | 'rejected' | 'deferred' | 'split' | null;
}

// Jaro-Winkler similarity implementation
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (!matches) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler modification
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function addressTokenOverlap(addr1: string, addr2: string): number {
  const tokens1 = new Set(normalizeString(addr1).split(/\s+/).filter(Boolean));
  const tokens2 = new Set(normalizeString(addr2).split(/\s+/).filter(Boolean));
  if (!tokens1.size || !tokens2.size) return 0;
  let overlap = 0;
  tokens1.forEach(t => { if (tokens2.has(t)) overlap++; });
  return overlap / Math.max(tokens1.size, tokens2.size);
}

function computeSignals(
  recA: { business_name: string; owner_name: string; address: string; pin_code: string; phone: string; pan?: string; gstin?: string },
  recB: { business_name: string; owner_name: string; address: string; pin_code: string; phone: string; pan?: string; gstin?: string }
): SignalBreakdown {
  // PAN exact match
  const panA = recA.pan ? recA.pan.trim().toUpperCase() : '';
  const panB = recB.pan ? recB.pan.trim().toUpperCase() : '';
  const pan_match = (panA && panB && panA === panB) ? 0.90 : 0;

  // GSTIN exact match
  const gstinA = recA.gstin ? recA.gstin.trim().toUpperCase() : '';
  const gstinB = recB.gstin ? recB.gstin.trim().toUpperCase() : '';
  const gstin_match = (gstinA && gstinB && gstinA === gstinB) ? 0.90 : 0;

  // Business name similarity (Jaro-Winkler)
  const nameSim = jaroWinkler(normalizeString(recA.business_name), normalizeString(recB.business_name));
  const name_similarity = nameSim * 0.65;

  // PIN code exact match
  const pin_match = (recA.pin_code && recB.pin_code && recA.pin_code === recB.pin_code) ? 0.20 : 0;

  // Address token overlap
  const addrOverlap = addressTokenOverlap(recA.address, recB.address);
  const address_overlap = addrOverlap * 0.40;

  // Phone number match
  const phoneA = recA.phone.replace(/\D/g, '').slice(-10);
  const phoneB = recB.phone.replace(/\D/g, '').slice(-10);
  const phone_match = (phoneA && phoneB && phoneA === phoneB) ? 0.55 : 0;

  // Owner name similarity
  const ownerSim = jaroWinkler(normalizeString(recA.owner_name), normalizeString(recB.owner_name));
  const owner_similarity = ownerSim * 0.45;

  // Combined score — weighted average of all signals
  // Each signal contributes proportionally to its max possible weight
  const maxWeights = { pan: 0.90, gstin: 0.90, name: 0.65, pin: 0.20, address: 0.40, phone: 0.55, owner: 0.45 };
  const totalMaxWeight = maxWeights.pan + maxWeights.gstin + maxWeights.name + maxWeights.pin + maxWeights.address + maxWeights.phone + maxWeights.owner;

  // Normalize each signal to 0-1 range (signal value / max weight for that signal)
  const panNorm = pan_match / maxWeights.pan;
  const gstinNorm = gstin_match / maxWeights.gstin;
  const nameNorm = name_similarity / maxWeights.name;
  const pinNorm = pin_match / maxWeights.pin;
  const addrNorm = address_overlap / maxWeights.address;
  const phoneNorm = phone_match / maxWeights.phone;
  const ownerNorm = owner_similarity / maxWeights.owner;

  // Weighted average: each signal's normalized value * its weight / total weight
  let total = (
    panNorm * maxWeights.pan +
    gstinNorm * maxWeights.gstin +
    nameNorm * maxWeights.name +
    pinNorm * maxWeights.pin +
    addrNorm * maxWeights.address +
    phoneNorm * maxWeights.phone +
    ownerNorm * maxWeights.owner
  ) / totalMaxWeight;

  // Boost: if PAN or GSTIN match exactly, boost the score significantly
  if (pan_match > 0 || gstin_match > 0) {
    const keyBoost = Math.max(pan_match, gstin_match);
    total = total * 0.25 + keyBoost * 0.75;
  }

  total = Math.min(total, 1.0);

  return {
    pan_match,
    gstin_match,
    name_similarity: Math.round(name_similarity * 1000) / 1000,
    pin_match,
    address_overlap: Math.round(address_overlap * 1000) / 1000,
    phone_match,
    owner_similarity: Math.round(owner_similarity * 1000) / 1000,
    total: Math.round(total * 1000) / 1000,
  };
}

function classifyOutcome(score: number): 'Auto-Link' | 'Review Needed' | 'Keep Separate' {
  if (score >= 0.85) return 'Auto-Link';
  if (score >= 0.50) return 'Review Needed';
  return 'Keep Separate';
}

function generateUBID(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `UBID-KA-${num}`;
}

export interface UBIDRecord {
  ubid: string;
  linked_records: Array<{ record_id: string; department: string; business_name: string }>;
  status: 'Active' | 'Dormant' | 'Closed';
  last_event_date: string | null;
  last_event_type: string | null;
  source_departments: string[];
  evidence_count: number;
  sector: string | null;
  pin_code: string;
  primary_name: string;
  confidence: number;
}

export interface DataStore {
  shopRecords: any[];
  kspcbRecords: any[];
  factoryRecords: any[];
  matchResults: MatchResult[];
  ubids: Map<string, UBIDRecord>;
  events: any[];
  auditLog: any[];
  reviewQueue: MatchResult[];
}

export function runMatchingEngine(store: DataStore): void {
  const allRecords: Array<any & { department: string }> = [
    ...store.shopRecords.map(r => ({ ...r, department: 'Shop & Establishment' })),
    ...store.kspcbRecords.map(r => ({ ...r, department: 'KSPCB' })),
    ...store.factoryRecords.map(r => ({ ...r, department: 'Factories' })),
  ];

  store.matchResults = [];
  store.ubids = new Map();
  store.reviewQueue = [];

  // Compare records across different departments only
  for (let i = 0; i < allRecords.length; i++) {
    for (let j = i + 1; j < allRecords.length; j++) {
      const recA = allRecords[i];
      const recB = allRecords[j];

      // Only compare across departments
      if (recA.department === recB.department) continue;

      const signals = computeSignals(recA, recB);
      if (signals.total < 0.30) continue; // Skip very low scores

      const outcome = classifyOutcome(signals.total);
      const pairId = `${recA.record_id}::${recB.record_id}`;

      const result: MatchResult = {
        pair_id: pairId,
        record_a: { record_id: recA.record_id, department: recA.department, business_name: recA.business_name },
        record_b: { record_id: recB.record_id, department: recB.department, business_name: recB.business_name },
        confidence: signals.total,
        signals,
        outcome,
        ubid: null,
        reviewer_decision: outcome === 'Auto-Link' ? null : (outcome === 'Keep Separate' ? null : 'pending'),
      };

      store.matchResults.push(result);
    }
  }

  // Build UBIDs from Auto-Link pairs using union-find
  const recordToUBID = new Map<string, string>();
  const ubidRecords = new Map<string, Set<string>>();

  // First, assign UBIDs to auto-linked pairs
  const autoLinked = store.matchResults.filter(r => r.outcome === 'Auto-Link');

  // Union-Find
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  autoLinked.forEach(result => {
    union(result.record_a.record_id, result.record_b.record_id);
  });

  // Create UBIDs for each group
  const groups = new Map<string, string[]>();
  allRecords.forEach(r => {
    const root = find(r.record_id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r.record_id);
  });

  groups.forEach((recordIds, root) => {
    const ubid = generateUBID();
    const linkedRecords = recordIds.map(rid => {
      const rec = allRecords.find(r => r.record_id === rid)!;
      return { record_id: rid, department: rec.department, business_name: rec.business_name };
    });

    // Get the primary record (first one)
    const primaryRec = allRecords.find(r => r.record_id === root)!;
    const departments = [...new Set(linkedRecords.map(r => r.department))];
    const pinCode = primaryRec.pin_code || '';
    const sector = primaryRec.sector || null;

    // Find max confidence for this group
    const maxConf = store.matchResults
      .filter(r => recordIds.includes(r.record_a.record_id) && recordIds.includes(r.record_b.record_id))
      .reduce((max, r) => Math.max(max, r.confidence), 0);

    const ubidRecord: UBIDRecord = {
      ubid,
      linked_records: linkedRecords,
      status: 'Active',
      last_event_date: null,
      last_event_type: null,
      source_departments: departments,
      evidence_count: 0,
      sector,
      pin_code: pinCode,
      primary_name: primaryRec.business_name,
      confidence: Math.round(maxConf * 1000) / 1000,
    };

    store.ubids.set(ubid, ubidRecord);
    recordIds.forEach(rid => recordToUBID.set(rid, ubid));

    // Update match results with UBID
    store.matchResults.forEach(r => {
      if (recordIds.includes(r.record_a.record_id) && recordIds.includes(r.record_b.record_id)) {
        r.ubid = ubid;
      }
    });
  });

  // Add review queue items
  store.reviewQueue = store.matchResults.filter(r => r.outcome === 'Review Needed');

  // Map events to UBIDs
  store.events.forEach((event: any) => {
    const ubid = recordToUBID.get(event.record_id);
    if (ubid) {
      event.ubid = ubid;
    }
  });
}

export function runActivityClassification(store: DataStore): void {
  const now = new Date('2026-05-05');
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  store.ubids.forEach((ubidRecord, ubid) => {
    const ubidEvents = store.events.filter((e: any) => e.ubid === ubid);

    // Check for closure events
    const hasClosure = ubidEvents.some((e: any) =>
      e.event_type === 'Closure Notice' || e.event_type.toLowerCase().includes('closure')
    );

    if (hasClosure) {
      ubidRecord.status = 'Closed';
    } else if (ubidEvents.length === 0) {
      // No events mapped — check if any linked record has a status field
      const allRecords = [
        ...store.shopRecords,
        ...store.kspcbRecords,
        ...store.factoryRecords,
      ];
      const linkedRaw = ubidRecord.linked_records.map(lr =>
        allRecords.find((r: any) => r.record_id === lr.record_id)
      ).filter(Boolean);

      const hasClosedStatus = linkedRaw.some((r: any) => r.status === 'Closed');
      const hasDormantStatus = linkedRaw.some((r: any) => r.status === 'Dormant');

      if (hasClosedStatus) {
        ubidRecord.status = 'Closed';
      } else if (hasDormantStatus) {
        ubidRecord.status = 'Dormant';
      } else {
        ubidRecord.status = 'Active';
      }
    } else {
      // Find most recent event
      const sortedEvents = [...ubidEvents].sort((a: any, b: any) => b.event_date.localeCompare(a.event_date));
      const lastEvent = sortedEvents[0];
      const lastDate = new Date(lastEvent.event_date);

      ubidRecord.last_event_date = lastEvent.event_date;
      ubidRecord.last_event_type = lastEvent.event_type;
      ubidRecord.evidence_count = ubidEvents.length;

      // Check if any linked record has a Closed status
      const allRecords = [
        ...store.shopRecords,
        ...store.kspcbRecords,
        ...store.factoryRecords,
      ];
      const linkedRaw = ubidRecord.linked_records.map(lr =>
        allRecords.find((r: any) => r.record_id === lr.record_id)
      ).filter(Boolean);
      const hasClosedStatus = linkedRaw.some((r: any) => r.status === 'Closed');

      if (hasClosedStatus) {
        ubidRecord.status = 'Closed';
      } else if (lastDate >= sixMonthsAgo) {
        ubidRecord.status = 'Active';
      } else if (lastDate >= twelveMonthsAgo) {
        ubidRecord.status = 'Dormant';
      } else {
        ubidRecord.status = 'Dormant';
      }
    }

    // Update source departments from events
    const eventDepts = [...new Set(ubidEvents.map((e: any) => e.department))];
    if (eventDepts.length > 0) {
      ubidRecord.source_departments = [...new Set([...ubidRecord.source_departments, ...eventDepts])];
    }
  });
}
