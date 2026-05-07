import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  canonicalPairKey,
  DataStore,
  DepartmentName,
  DEFAULT_THRESHOLDS,
  getAllRecords,
  LastSyncedRecord,
  MatchThresholds,
  runActivityClassification,
  runMatchingEngine,
  SyncSource,
} from './matchingEngine.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const DEPARTMENTS: DepartmentName[] = ['Shop & Establishment', 'Factories', 'KSPCB'];
const ADMIN_PASSWORD = 'kbig-admin';
const ADMIN_TOKEN = 'KBIG_DEMO_ADMIN_TOKEN';

type ViewRole = 'Admin (KBIG)' | DepartmentName;
type RecordSource = 'MANUAL' | 'CSV_UPLOAD' | SyncSource;

const store: DataStore = {
  shopRecords: [],
  kspcbRecords: [],
  factoryRecords: [],
  matchResults: [],
  ubids: new Map(),
  events: [],
  auditLog: [],
  reviewQueue: [],
  approvedPairs: new Set(),
  rejectedPairs: new Set(),
  deferredPairs: new Set(),
  splitPairs: new Set(),
  recordToUBID: new Map(),
  preferredUbidByRecord: new Map(),
  departmentThresholds: { ...DEFAULT_THRESHOLDS },
  unmatchedEvents: [],
  notifications: [],
  auditKeys: new Set(),
  lastSynced: {
    'Shop & Establishment': null,
    KSPCB: null,
    Factories: null,
  },
  lastSyncedRecords: {
    'Shop & Establishment': [],
    KSPCB: [],
    Factories: [],
  },
};

function refreshGraph(reason: string) {
  runMatchingEngine(store);
  runActivityClassification(store);
  refreshLastSyncedUbidMappings();
  return {
    reason,
    total_ubids: store.ubids.size,
    auto_linked: store.matchResults.filter(result => result.outcome === 'Auto-Link').length,
    review_needed: store.reviewQueue.length,
    keep_separate: store.matchResults.filter(result => result.outcome === 'Keep Separate').length,
  };
}

function refreshActivity(reason: string) {
  runActivityClassification(store);
  return {
    reason,
    total_ubids: store.ubids.size,
    active: Array.from(store.ubids.values()).filter(ubid => ubid.status === 'Active').length,
    dormant: Array.from(store.ubids.values()).filter(ubid => ubid.status === 'Dormant').length,
    closed: Array.from(store.ubids.values()).filter(ubid => ubid.status === 'Closed').length,
  };
}

function refreshLastSyncedUbidMappings() {
  DEPARTMENTS.forEach(department => {
    store.lastSyncedRecords[department] = newestSyncedFirst(
      store.lastSyncedRecords[department].map(record => ({
        ...record,
        ubid: store.recordToUBID.get(record.record_id) || record.ubid || null,
      }))
    ).slice(0, 5);
  });
}

function prepareStoredRecord(record: any, source: RecordSource, syncedAt: string | null = null) {
  return {
    ...record,
    owner_name: nullableString(record.owner_name),
    pin_code: nullableString(record.pin_code),
    phone: cleanPhone(record.phone) || null,
    pan: nullableUpper(record.pan),
    gstin: nullableUpper(record.gstin),
    source,
    synced_at: syncedAt,
  };
}

function initialize() {
  // START COMPLETELY EMPTY
  store.shopRecords = [];
  store.kspcbRecords = [];
  store.factoryRecords = [];

  // NO EVENTS
  store.events = [];

  // CLEAR ALL REVIEW/MATCH STATE
  store.matchResults = [];
  store.reviewQueue = [];

  // CLEAR UBID STATE
  store.ubids = new Map();
  store.recordToUBID = new Map();
  store.preferredUbidByRecord = new Map();

  // CLEAR REVIEWER DECISION MEMORY
  store.approvedPairs = new Set();
  store.rejectedPairs = new Set();
  store.deferredPairs = new Set();
  store.splitPairs = new Set();

  // CLEAR AUDIT + NOTIFICATIONS
  store.auditLog = [];
  store.auditKeys = new Set();
  store.notifications = [];
  store.unmatchedEvents = [];

  // RESET THRESHOLDS
  store.departmentThresholds = { ...DEFAULT_THRESHOLDS };

  // RESET LAST SYNC INFO
  store.lastSynced = {
    'Shop & Establishment': null,
    KSPCB: null,
    Factories: null,
  };

  // RESET LAST SYNCED RECORDS
  store.lastSyncedRecords = {
    'Shop & Establishment': [],
    KSPCB: [],
    Factories: [],
  };

  // BUILD EMPTY GRAPH
  const summary = refreshGraph('server_start');

  console.log(
    `Initialized clean KBIG instance: ${summary.total_ubids} UBIDs, ${summary.review_needed} pending reviews, ${store.events.length} events`
  );
}

function sendError(res: express.Response, status: number, message: string, details?: unknown) {
  res.status(status).json({ error: message, details });
}

function createEmptyLastSyncedRecords(): Record<DepartmentName, LastSyncedRecord[]> {
  return {
    'Shop & Establishment': [],
    KSPCB: [],
    Factories: [],
  };
}

function syncSourceFromValue(value: unknown): SyncSource {
  return String(value || '').trim().toUpperCase() === 'AUTO_SYNC' ? 'AUTO_SYNC' : 'MANUAL_SYNC';
}

function syncDecision(source: SyncSource): 'auto_sync' | 'manual_sync' {
  return source === 'AUTO_SYNC' ? 'auto_sync' : 'manual_sync';
}

function timestampMs(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function newestSyncedFirst(records: LastSyncedRecord[]): LastSyncedRecord[] {
  return records
    .slice()
    .sort((a, b) => timestampMs(b.synced_at) - timestampMs(a.synced_at) || b.record_id.localeCompare(a.record_id));
}

function normalizeDepartment(value: unknown): DepartmentName | null {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (['SE', 'SHOP', 'SHOPS', 'SHOPESTABLISHMENT', 'SHOPANDESTABLISHMENT', 'SHOPSESTABLISHMENT'].includes(normalized)) {
    return 'Shop & Establishment';
  }
  if (normalized === 'KSPCB') return 'KSPCB';
  if (['FAC', 'FACTORY', 'FACTORIES'].includes(normalized)) return 'Factories';
  return null;
}

function hasAdminToken(req: express.Request): boolean {
  return req.header('x-kbig-admin-token') === ADMIN_TOKEN;
}

function roleFromRequest(req: express.Request): ViewRole | null {
  const rawRoleValue = req.query.role || req.header('x-kbig-role');
  if (!rawRoleValue) return hasAdminToken(req) ? 'Admin (KBIG)' : null;
  const rawRole = String(rawRoleValue);
  if (rawRole.trim().toUpperCase().replace(/[^A-Z]/g, '') === 'ADMINKBIG') return 'Admin (KBIG)';
  return normalizeDepartment(rawRole);
}

function departmentForRole(req: express.Request): DepartmentName | null {
  const role = roleFromRequest(req);
  return !role || role === 'Admin (KBIG)' ? null : role;
}

function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (roleFromRequest(req) === 'Admin (KBIG)' && hasAdminToken(req)) return true;
  sendError(res, 403, 'Admin authentication is required for this action.');
  return false;
}

function requireSelectedRole(req: express.Request, res: express.Response): boolean {
  const role = roleFromRequest(req);
  if (!role) {
    sendError(res, 400, 'Select a role before accessing KBIG data.');
    return false;
  }
  if (role === 'Admin (KBIG)' && !hasAdminToken(req)) {
    sendError(res, 403, 'Admin authentication is required for this view.');
    return false;
  }
  return true;
}

function datasetForDepartment(department: DepartmentName): any[] {
  if (department === 'Shop & Establishment') return store.shopRecords;
  if (department === 'KSPCB') return store.kspcbRecords;
  return store.factoryRecords;
}

function prefixForDepartment(department: DepartmentName): string {
  if (department === 'Shop & Establishment') return 'SE';
  if (department === 'KSPCB') return 'KSPCB';
  return 'FAC';
}

function nextRecordId(department: DepartmentName): string {
  const prefix = prefixForDepartment(department);
  const allRecords = getAllRecords(store);
  const max = allRecords.reduce((currentMax, record) => {
    const match = String(record.record_id || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function nextEventId(): string {
  const allEvents = [...store.events, ...store.unmatchedEvents];
  const max = allEvents.reduce((currentMax, event) => {
    const match = String(event.event_id || '').match(/^EVT-(\d+)$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `EVT-${String(max + 1).padStart(5, '0')}`;
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    normalized[normalizedKey] = value;
  });
  return normalized;
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function nullableString(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : null;
}

function cleanPhone(value: unknown): string {
  return cleanString(value).replace(/\D/g, '');
}

function nullableUpper(value: unknown): string | null {
  const cleaned = cleanString(value).replace(/\s+/g, '').toUpperCase();
  return cleaned ? cleaned : null;
}

function isValidPan(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
}

function isValidGstin(value: string): boolean {
  return /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value);
}

function isSyncSource(source: RecordSource): source is SyncSource {
  return source === 'MANUAL_SYNC' || source === 'AUTO_SYNC';
}

function validateRecordInput(input: Record<string, unknown>): string[] {
  const missing = ['business_name', 'address']
    .filter(field => !cleanString(input[field]));
  const errors = missing.map(field => `${field} is required`);

  const pinCode = cleanString(input.pin_code);
  if (pinCode && !/^\d{6}$/.test(pinCode)) {
    errors.push('pin_code must be 6 digits');
  }

  const phone = cleanPhone(input.phone);
  if (phone && phone.length !== 10) {
    errors.push('phone must be exactly 10 digits');
  }

  const pan = nullableUpper(input.pan);
  if (pan && !isValidPan(pan)) {
    errors.push('pan must match valid PAN format, e.g. ABCDE1234F');
  }

  const gstin = nullableUpper(input.gstin);
  if (gstin && !isValidGstin(gstin)) {
    errors.push('gstin must be exactly 15 characters and match valid GSTIN format');
  }

  return errors;
}

function createRecord(
  department: DepartmentName,
  rawInput: Record<string, unknown>,
  source: RecordSource = 'MANUAL',
  syncedAt: string | null = null
) {
  const input = normalizeRowKeys(rawInput);
  const validationErrors = validateRecordInput(input);
  if (validationErrors.length) {
    return { record: null, errors: validationErrors };
  }

  const today = new Date().toISOString().split('T')[0];
  const recordId = nextRecordId(department);
  const baseRecord: Record<string, unknown> = {
    record_id: recordId,
    department,
    source_record_id: cleanString(input.source_record_id) || null,
    business_name: cleanString(input.business_name),
    owner_name: nullableString(input.owner_name),
    address: cleanString(input.address),
    pin_code: nullableString(input.pin_code),
    phone: cleanPhone(input.phone) || null,
    pan: nullableUpper(input.pan),
    gstin: nullableUpper(input.gstin),
    source,
    synced_at: isSyncSource(source) ? (syncedAt || new Date().toISOString()) : null,
  };

  if (department === 'Shop & Establishment') {
    Object.assign(baseRecord, {
      licence_number: cleanString(input.licence_number) || `SE-LIC-${recordId.replace('SE-', '')}`,
      last_renewed: cleanString(input.last_renewed) || today,
      status: cleanString(input.status) || 'Active',
    });
  } else if (department === 'KSPCB') {
    Object.assign(baseRecord, {
      consent_number: cleanString(input.consent_number) || `KSPCB-C-${recordId.replace('KSPCB-', '')}`,
      last_filing_date: cleanString(input.last_filing_date) || today,
      inspection_date: cleanString(input.inspection_date) || today,
    });
  } else {
    Object.assign(baseRecord, {
      factory_licence: cleanString(input.factory_licence) || `FL-${recordId.replace('FAC-', '')}`,
      last_inspection: cleanString(input.last_inspection) || today,
      sector: cleanString(input.sector) || 'Manufacturing',
    });
  }

  return { record: baseRecord, errors: [] };
}

function insertRecord(department: DepartmentName, record: Record<string, unknown>) {
  datasetForDepartment(department).push(record);
}

function normalizeForComparison(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function recordFingerprint(department: DepartmentName, rawInput: Record<string, unknown>): string {
  const input = normalizeRowKeys(rawInput);
  const sourceRecordId = cleanString(input.source_record_id);
  if (sourceRecordId) return `${department}|source-record|${sourceRecordId.toUpperCase()}`;

  const gstin = nullableUpper(input.gstin);
  const pan = nullableUpper(input.pan);
  const name = normalizeForComparison(input.business_name);
  const address = normalizeForComparison(input.address);
  const phone = cleanPhone(input.phone);

  if (gstin) return `${department}|gstin|${gstin}`;
  if (pan && name && address) return `${department}|pan-name-address|${pan}|${name}|${address}`;
  return `${department}|name-address-phone|${name}|${address}|${phone}`;
}

function existingFingerprints(department: DepartmentName): Set<string> {
  return new Set(datasetForDepartment(department).map(record => recordFingerprint(department, record)));
}

function markDepartmentsSynced(departments: DepartmentName[], syncedAt: string) {
  departments.forEach(department => {
    store.lastSynced[department] = syncedAt;
  });
}

function rememberSyncedRecords(records: Record<string, unknown>[], fallbackSource: SyncSource, fallbackSyncedAt: string) {
  const grouped: Record<DepartmentName, LastSyncedRecord[]> = createEmptyLastSyncedRecords();

  records.forEach(record => {
    const department = normalizeDepartment(record.department);
    if (!department) return;
    const source = isSyncSource(record.source as RecordSource)
      ? record.source as SyncSource
      : fallbackSource;
    const syncedAt = cleanString(record.synced_at) || fallbackSyncedAt;
    grouped[department].push({
      record_id: String(record.record_id),
      business_name: String(record.business_name || 'Not Available'),
      ubid: store.recordToUBID.get(String(record.record_id)) || null,
      synced_at: syncedAt,
      source,
    });
    store.lastSynced[department] = syncedAt;
  });

  DEPARTMENTS.forEach(department => {
    if (!grouped[department].length) return;
    store.lastSyncedRecords[department] = newestSyncedFirst([
      ...grouped[department],
      ...store.lastSyncedRecords[department],
    ]).slice(0, 5);
  });
}

function resetGraphDecisions() {
  store.ubids = new Map();
  store.matchResults = [];
  store.reviewQueue = [];
  store.recordToUBID = new Map();
}

function clampScore(value: unknown, fallback: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.round(Math.max(0, Math.min(score, 1)) * 100) / 100;
}

function findRawRecord(recordId: string) {
  return getAllRecords(store).find(record => record.record_id === recordId);
}

function findUbidForRecord(recordId: string) {
  const ubid = store.recordToUBID.get(recordId);
  return ubid ? store.ubids.get(ubid) || null : null;
}

function mappingForRecord(recordId: string) {
  const ubid = findUbidForRecord(recordId);
  return ubid
    ? { record_id: recordId, ubid: ubid.ubid, ubid_record: ubid }
    : { record_id: recordId, ubid: null, ubid_record: null };
}

function recordWithUbid(record: any) {
  return {
    ...record,
    ubid: store.recordToUBID.get(record.record_id) || null,
  };
}

function summarizeRecord(record: any) {
  if (!record) return null;
  return {
    record_id: String(record.record_id),
    department: normalizeDepartment(record.department) || record.department,
    business_name: String(record.business_name || 'Not Available'),
    ubid: store.recordToUBID.get(String(record.record_id)) || null,
  };
}

function pushAudit(entry: Record<string, unknown>) {
  store.auditLog.push({
    timestamp: new Date().toISOString(),
    reviewer_id: 'system',
    pair_id: `AUDIT-${Date.now()}-${store.auditLog.length}`,
    pair_key: null,
    action_type: 'system',
    decision: 'logged',
    record_a: null,
    record_b: null,
    confidence: 0,
    assigned_ubid: null,
    details: {},
    ...entry,
  });
}

function logGraphAudit(reason: string, actor = 'matching_engine') {
  const queuedPairKeys = new Set(store.reviewQueue.map(result => result.pair_key));

  store.matchResults.forEach(result => {
    if (!['Auto-Link', 'Review Needed'].includes(result.outcome)) return;
    if (result.outcome === 'Review Needed' && !queuedPairKeys.has(result.pair_key)) return;
    const auditKey = `${result.outcome}:${result.pair_key}`;
    if (store.auditKeys.has(auditKey)) return;
    store.auditKeys.add(auditKey);

    pushAudit({
      reviewer_id: actor,
      pair_id: result.pair_id,
      pair_key: result.pair_key,
      action_type: result.outcome === 'Auto-Link' ? 'auto_link' : 'review_queue',
      decision: result.outcome === 'Auto-Link' ? 'auto_link_created' : 'review_queue_created',
      record_a: result.record_a,
      record_b: result.record_b,
      confidence: result.confidence,
      signals: result.signals,
      assigned_ubid: result.ubid,
      details: {
        reason,
        record_a: result.record_a,
        record_b: result.record_b,
        record_a_id: result.record_a.record_id,
        record_b_id: result.record_b.record_id,
        record_a_name: result.record_a.business_name,
        record_b_name: result.record_b.business_name,
        departments: [result.record_a.department, result.record_b.department],
        signals: result.signals,
        final_confidence: result.confidence,
        assigned_ubid: result.ubid,
        explanation: result.explanation,
      },
    });
  });
}

function logRecordAudit(
  decision: string,
  source: 'manual_record' | 'csv_upload',
  records: Record<string, unknown>[],
  skipped: Array<{ row?: number; errors: string[]; record?: Record<string, unknown> }>,
  summary: unknown,
) {
  pushAudit({
    reviewer_id: source,
    action_type: source,
    decision,
    details: {
      records_added: records.map(record => ({
        ...summarizeRecord(record),
        source: record.source,
      })),
      skipped_records: skipped,
      summary,
    },
  });
}

function visibleUbidForDepartment(ubid: NonNullable<ReturnType<typeof findUbidForRecord>>, department: DepartmentName | null) {
  if (!department) return ubid;
  const linkedRecords = ubid.linked_records.filter(record => record.department === department);
  if (!linkedRecords.length) return null;

  const rawRecords = getAllRecords(store);
  const primary = linkedRecords
    .map(linked => rawRecords.find(record => record.record_id === linked.record_id))
    .find(Boolean);

  return {
    ...ubid,
    linked_records: linkedRecords,
    source_departments: [department],
    primary_name: primary?.business_name || linkedRecords[0].business_name,
    pin_code: primary?.pin_code || '',
    sector: primary?.sector || null,
  };
}

function visibleEvents(events: any[], department: DepartmentName | null) {
  return department ? events.filter(event => event.department === department) : events;
}

function visibleUnmatchedEvents(department: DepartmentName | null) {
  return store.unmatchedEvents
    .filter(event => event.status !== 'Linked')
    .filter(event => !department || event.department === department);
}

function eventNotificationMessage(event: any) {
  const eventType = String(event.event_type || '').toLowerCase();
  if (eventType.includes('inspection')) return 'Inspection update recorded';
  if (eventType.includes('renewal')) return 'Renewal update recorded';
  if (eventType.includes('notice')) return 'Department notice issued';
  if (eventType.includes('violation')) return 'Compliance violation recorded';
  if (eventType.includes('closure')) return 'Closure or cancellation update recorded';
  return 'Lifecycle event recorded';
}

function createBusinessNotification(event: any) {
  if (!event.ubid) return null;
  const ubid = store.ubids.get(event.ubid);
  const notification = {
    notification_id: `NOTIF-${String(store.notifications.length + 1).padStart(5, '0')}`,
    ubid: event.ubid,
    business_name: ubid?.primary_name || 'Unknown Business',
    event_id: event.event_id,
    department: event.department,
    event_type: event.event_type,
    message: eventNotificationMessage(event),
    details: event.details,
    created_at: new Date().toISOString(),
    read: false,
  };
  store.notifications.unshift(notification);
  return notification;
}

function factoriesNoInspectionQuery(pinCode = '560058', sector = 'Manufacturing', months = 18) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const results: any[] = [];
  store.ubids.forEach(ubid => {
    if (ubid.status !== 'Active') return;
    if (sector !== 'all' && String(ubid.sector || '') !== sector) return;
    if (pinCode && String(ubid.pin_code || '') !== pinCode) return;

    const ubidEvents = store.events.filter(event => event.ubid === ubid.ubid);
    const inspectionEvents = ubidEvents.filter(event =>
      String(event.event_type || '').toLowerCase().includes('inspection')
    );
    const lastInspection = inspectionEvents.sort((a, b) =>
      String(b.event_date).localeCompare(String(a.event_date))
    )[0];

    if (!lastInspection || lastInspection.event_date < cutoffDate) {
      results.push({
        ubid: ubid.ubid,
        business_name: ubid.primary_name,
        sector: ubid.sector,
        pin_code: ubid.pin_code,
        status: ubid.status,
        last_inspection: lastInspection ? lastInspection.event_date : 'Never',
        last_activity: ubid.last_event_date,
        departments: ubid.source_departments,
        confidence: ubid.confidence,
        evidence_count: ubid.evidence_count,
      });
    }
  });

  return results.sort((a, b) => String(a.last_inspection).localeCompare(String(b.last_inspection)));
}

function departmentCoverageStats(department: DepartmentName) {
  const departmentRecords = datasetForDepartment(department);
  const linkedRecords = new Set<string>();
  const autoLinkedRecords = new Set<string>();
  const manuallyLinkedRecords = new Set<string>();
  const reviewRecords = new Set<string>();

  departmentRecords.forEach(record => {
    const ubid = findUbidForRecord(String(record.record_id));
    if (ubid && ubid.linked_records.length > 1) {
      linkedRecords.add(String(record.record_id));
    }
  });

  store.matchResults.forEach(result => {
    const ubidA = store.recordToUBID.get(result.record_a.record_id);
    const ubidB = store.recordToUBID.get(result.record_b.record_id);
    if (!ubidA || ubidA !== ubidB || result.outcome !== 'Auto-Link') return;

    const departmentIds = [result.record_a, result.record_b]
      .filter(record => record.department === department)
      .map(record => record.record_id);

    if (result.reviewer_decision === 'approved') {
      departmentIds.forEach(id => manuallyLinkedRecords.add(id));
    } else {
      departmentIds.forEach(id => autoLinkedRecords.add(id));
    }
  });

  store.reviewQueue.forEach(result => {
    [result.record_a, result.record_b]
      .filter(record => record.department === department)
      .forEach(record => reviewRecords.add(record.record_id));
  });

  const matchRate = departmentRecords.length > 0
    ? Math.min(100, Math.round((linkedRecords.size / departmentRecords.length) * 100))
    : 0;

  return {
    total_records: departmentRecords.length,
    linked_records: linkedRecords.size,
    match_rate: matchRate,
    auto_linked: autoLinkedRecords.size,
    manually_linked: manuallyLinkedRecords.size,
    in_review: reviewRecords.size,
  };
}

function analyticsSummary() {
  const ubids = Array.from(store.ubids.values());
  const records = getAllRecords(store);
  const status_counts = { Active: 0, Dormant: 0, Closed: 0 };
  ubids.forEach(ubid => { status_counts[ubid.status]++; });

  const department_counts = DEPARTMENTS.map(department => {
    const coverage = departmentCoverageStats(department);
    return {
      department,
      total_records: coverage.total_records,
      linked_records: coverage.linked_records,
      last_synced: store.lastSynced[department],
      thresholds: store.departmentThresholds[department],
    };
  });

  const match_outcomes = { 'Auto-Link': 0, 'Review Needed': 0, 'Keep Separate': 0 };
  store.matchResults.forEach(result => { match_outcomes[result.outcome]++; });

  const confidence_bands = {
    high: store.matchResults.filter(result => result.confidence >= 0.85).length,
    review: store.matchResults.filter(result => result.confidence >= 0.55 && result.confidence < 0.85).length,
    low: store.matchResults.filter(result => result.confidence < 0.55).length,
  };

  const sector_counts = ubids.reduce<Record<string, number>>((acc, ubid) => {
    const sector = ubid.sector || 'Not Available';
    acc[sector] = (acc[sector] || 0) + 1;
    return acc;
  }, {});

  const event_type_counts = store.events.reduce<Record<string, number>>((acc, event) => {
    const type = String(event.event_type || 'Unknown');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const review_decisions = store.auditLog
    .filter(entry => entry.action_type === 'review')
    .reduce<Record<string, number>>((acc, entry) => {
      acc[entry.decision] = (acc[entry.decision] || 0) + 1;
      return acc;
    }, {});

  return {
    generated_at: new Date().toISOString(),
    totals: {
      ubids: ubids.length,
      records: records.length,
      events: store.events.length,
      unmatched_events: visibleUnmatchedEvents(null).length,
      pending_reviews: store.reviewQueue.length,
      linked_records: records.filter(record => {
        const ubid = findUbidForRecord(record.record_id);
        return Boolean(ubid && ubid.linked_records.length > 1);
      }).length,
    },
    status_counts,
    department_counts,
    match_outcomes,
    confidence_bands,
    sector_counts,
    event_type_counts,
    review_decisions,
    factories_without_inspection_560058: factoriesNoInspectionQuery('560058', 'Manufacturing', 18),
    unmatched_events: visibleUnmatchedEvents(null).slice(0, 25),
  };
}

function matchForPair(recordA: string, recordB: string) {
  const key = canonicalPairKey(recordA, recordB);
  return store.matchResults.find(result => result.pair_key === key);
}

function logReviewAction(
  decision: string,
  reviewerId: string,
  recordA: { record_id: string; department: DepartmentName; business_name: string },
  recordB: { record_id: string; department: DepartmentName; business_name: string },
  confidence = 0,
  pairId = `${recordA.record_id}::${recordB.record_id}`,
) {
  const pairKey = canonicalPairKey(recordA.record_id, recordB.record_id);
  const match = store.matchResults.find(result => result.pair_key === pairKey);
  const assignedUbid = store.recordToUBID.get(recordA.record_id) === store.recordToUBID.get(recordB.record_id)
    ? store.recordToUBID.get(recordA.record_id) || null
    : null;

  pushAudit({
    reviewer_id: reviewerId || 'reviewer_001',
    pair_id: pairId,
    pair_key: pairKey,
    action_type: 'review',
    decision,
    record_a: recordA,
    record_b: recordB,
    confidence: match?.confidence ?? confidence,
    signals: match?.signals || null,
    assigned_ubid: assignedUbid,
    details: {
      record_a_id: recordA.record_id,
      record_b_id: recordB.record_id,
      record_a_name: recordA.business_name,
      record_b_name: recordB.business_name,
      record_a_label: `${recordA.record_id} - ${recordA.business_name}`,
      record_b_label: `${recordB.record_id} - ${recordB.business_name}`,
      departments: [recordA.department, recordB.department],
      signals: match?.signals || null,
      final_confidence: match?.confidence ?? confidence,
      assigned_ubid: assignedUbid,
    },
  });
}

function logSyncAction(
  source: SyncSource,
  records: Record<string, unknown>[],
  skippedRecords: Array<{ department: DepartmentName; source_record_id: string; business_name: string; reason: string }>,
  summary: { auto_linked?: number; review_needed?: number; [key: string]: unknown }
) {
  const syncedRecords = records.map(record => ({
    record_id: String(record.record_id),
    department: normalizeDepartment(record.department),
    business_name: String(record.business_name || 'Not Available'),
    ubid: store.recordToUBID.get(String(record.record_id)) || null,
    source,
    synced_at: cleanString(record.synced_at) || new Date().toISOString(),
  }));

  pushAudit({
    reviewer_id: syncDecision(source),
    pair_id: `${source}-${Date.now()}`,
    pair_key: null,
    action_type: 'sync',
    decision: syncDecision(source),
    record_a: null,
    record_b: null,
    confidence: 0,
    assigned_ubid: null,
    details: {
      source,
      records_added: syncedRecords,
      records_added_count: syncedRecords.length,
      skipped_records: skippedRecords,
      skipped_count: skippedRecords.length,
      auto_linked_created: summary.auto_linked || 0,
      review_queue_created: summary.review_needed || 0,
      ubids_updated: [...new Set(syncedRecords.map(record => record.ubid).filter(Boolean))],
      summary,
    },
  });
}

function realisticSyncInputs(
  count: number,
  forcedDepartment?: DepartmentName | null,
  source: SyncSource = 'MANUAL_SYNC'
): Array<{ department: DepartmentName; input: Record<string, unknown> }> {
  void count;
  void forcedDepartment;
  void source;
  return [];
}

function syncInputsFromPayload(
  rawRecords: unknown,
  forcedDepartment: DepartmentName | null,
  source: SyncSource
): Array<{ department: DepartmentName; input: Record<string, unknown> }> {
  if (!Array.isArray(rawRecords)) return [];

  return rawRecords.flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const input = normalizeRowKeys(row as Record<string, unknown>);
    const department = forcedDepartment || normalizeDepartment(input.department);
    if (!department) return [];
    return [{ department, input: { ...input, source } }];
  });
}

function syncStatusForDepartments(departments: DepartmentName[]) {
  refreshLastSyncedUbidMappings();
  return Object.fromEntries(departments.map(department => [department, {
    status: 'healthy',
    last_synced: store.lastSynced[department],
    latest_records: store.lastSyncedRecords[department],
  }]));
}

function runSyncImport(source: SyncSource, requestedDepartment: DepartmentName | null, rawRecords: unknown = []) {
  const targetDepartments = requestedDepartment ? [requestedDepartment] : DEPARTMENTS;
  const payloadInputs = syncInputsFromPayload(rawRecords, requestedDepartment, source);
  const addedRecords: Record<string, unknown>[] = [];
  const skippedRecords: Array<{ department: DepartmentName; source_record_id: string; business_name: string; reason: string }> = [];
  const fingerprintsByDepartment = new Map<DepartmentName, Set<string>>();
  const syncedAt = new Date().toISOString();

  markDepartmentsSynced(targetDepartments, syncedAt);

  targetDepartments.forEach(targetDepartment => {
    const generated = [
      ...realisticSyncInputs(3, targetDepartment, source),
      ...payloadInputs.filter(item => item.department === targetDepartment),
    ];

    generated.forEach(({ department, input }) => {
      if (!fingerprintsByDepartment.has(department)) {
        fingerprintsByDepartment.set(department, existingFingerprints(department));
      }
      const fingerprints = fingerprintsByDepartment.get(department)!;
      const fingerprint = recordFingerprint(department, input);
      if (fingerprints.has(fingerprint)) {
        skippedRecords.push({
          department,
          source_record_id: String(input.source_record_id || fingerprint),
          business_name: String(input.business_name || 'Not Available'),
          reason: 'previously imported source record',
        });
        return;
      }

      const { record } = createRecord(department, input, source, syncedAt);
      if (record) {
        insertRecord(department, record);
        addedRecords.push(record);
        fingerprints.add(fingerprint);
      } else {
        skippedRecords.push({
          department,
          source_record_id: String(input.source_record_id || fingerprint),
          business_name: String(input.business_name || 'Not Available'),
          reason: 'validation failed',
        });
      }
    });
  });

  const decision = syncDecision(source);
  const summary = refreshGraph(decision);
  logGraphAudit(decision);
  rememberSyncedRecords(addedRecords, source, syncedAt);
  logSyncAction(source, addedRecords, skippedRecords, summary);

  return {
    success: true,
    source,
    added: addedRecords.length,
    skipped: skippedRecords.length,
    records: addedRecords,
    skipped_records: skippedRecords,
    mappings: addedRecords.map(record => mappingForRecord(String(record.record_id))),
    sync_status: syncStatusForDepartments(targetDepartments),
    summary,
  };
}

initialize();

app.post('/api/auth/admin', (req, res) => {
  const password = cleanString(req.body?.password);
  if (password !== ADMIN_PASSWORD) {
    sendError(res, 401, 'Invalid admin password.');
    return;
  }

  res.json({
    success: true,
    role: 'Admin (KBIG)',
    token: ADMIN_TOKEN,
  });
});

app.get('/api/ubids', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const department = departmentForRole(req);
  const ubids = Array.from(store.ubids.values())
    .map(ubid => visibleUbidForDepartment(ubid, department))
    .filter(Boolean);
  res.json(ubids);
});

app.get('/api/ubids/:id', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const department = departmentForRole(req);
  const ubid = store.ubids.get(req.params.id);
  if (!ubid) {
    sendError(res, 404, 'UBID not found');
    return;
  }
  const visibleUbid = visibleUbidForDepartment(ubid, department);
  if (!visibleUbid) {
    sendError(res, 404, 'UBID not available in the selected department view.');
    return;
  }

  const allRecords = getAllRecords(store);
  const linkedRecords = visibleUbid.linked_records.map(linked => {
    const raw = allRecords.find(record => record.record_id === linked.record_id);
    return { ...linked, ubid: visibleUbid.ubid, raw: raw ? recordWithUbid(raw) : null };
  });
  const linkedIds = new Set(visibleUbid.linked_records.map(linked => linked.record_id));
  const matchResults = department
    ? []
    : store.matchResults.filter(result =>
        result.ubid === req.params.id ||
        (linkedIds.has(result.record_a.record_id) && linkedIds.has(result.record_b.record_id))
      );
  const events = visibleEvents(store.events.filter(event => event.ubid === req.params.id), department);
  const notifications = store.notifications.filter(notification => notification.ubid === req.params.id);

  res.json({ ...visibleUbid, linked_records: linkedRecords, match_results: matchResults, events, notifications });
});

app.post('/api/match', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const summary = refreshGraph('manual_match');
  logGraphAudit('manual_match');
  res.json({
    ...summary,
    reviewer_decisions_preserved: {
      approved: store.approvedPairs.size,
      rejected: store.rejectedPairs.size,
      force_separated: store.splitPairs.size,
    },
  });
});

app.post('/api/classify', (req, res) => {
  if (!requireAdmin(req, res)) return;
  runActivityClassification(store);
  const statusCounts = { Active: 0, Dormant: 0, Closed: 0 };
  store.ubids.forEach(ubid => {
    statusCounts[ubid.status]++;
  });
  res.json(statusCounts);
});

app.post('/api/records', (req, res) => {
  try {
    if (!requireSelectedRole(req, res)) return;
    const roleDepartment = departmentForRole(req);
    const department = roleDepartment || normalizeDepartment(req.body.department);
    if (!department) {
      sendError(res, 400, 'Valid department is required. Use SE, KSPCB, or FACTORY.');
      return;
    }

    if (roleDepartment && normalizeDepartment(req.body.department) && normalizeDepartment(req.body.department) !== roleDepartment) {
      sendError(res, 403, `This view can only add records for ${roleDepartment}.`);
      return;
    }

    const fingerprint = recordFingerprint(department, req.body);
    if (existingFingerprints(department).has(fingerprint)) {
      pushAudit({
        reviewer_id: 'manual_record',
        action_type: 'manual_record',
        decision: 'duplicate_record_skipped',
        details: {
          skipped_records: [{
            department,
            source_record_id: cleanString(req.body?.source_record_id) || fingerprint,
            business_name: cleanString(req.body?.business_name) || 'Not Available',
            reason: 'duplicate record ignored',
          }],
        },
      });
      sendError(res, 409, 'This record already exists in the selected department.');
      return;
    }

    const { record, errors } = createRecord(department, req.body, 'MANUAL');
    if (!record) {
      sendError(res, 400, 'Record validation failed.', errors);
      return;
    }

    insertRecord(department, record);
    const summary = refreshGraph('record_added');
    logGraphAudit('record_added');
    logRecordAudit('record_added', 'manual_record', [record], [], summary);
    res.status(201).json({
      success: true,
      message: 'Record added and matching engine re-run.',
      record_id: record.record_id,
      record,
      mapping: mappingForRecord(String(record.record_id)),
      summary,
    });
  } catch (error) {
    console.error('Failed to add record', error);
    sendError(res, 500, 'Failed to add record.');
  }
});

app.post('/api/records/bulk', (req, res) => {
  try {
    if (!requireSelectedRole(req, res)) return;
    const roleDepartment = departmentForRole(req);
    const department = roleDepartment || normalizeDepartment(req.body.department);
    const rows: Record<string, unknown>[] = Array.isArray(req.body.records) ? req.body.records : [];
    if (!department) {
      sendError(res, 400, 'Valid department is required before upload.');
      return;
    }
    if (roleDepartment && normalizeDepartment(req.body.department) && normalizeDepartment(req.body.department) !== roleDepartment) {
      sendError(res, 403, `This view can only upload records for ${roleDepartment}.`);
      return;
    }
    if (!rows.length) {
      sendError(res, 400, 'CSV upload did not contain any rows.');
      return;
    }

    const addedRecords: Record<string, unknown>[] = [];
    const rejectedRows: Array<{ row: number; errors: string[] }> = [];
    const seenFingerprints = existingFingerprints(department);

    rows.forEach((row, index) => {
      const fingerprint = recordFingerprint(department, row);
      if (seenFingerprints.has(fingerprint)) {
        rejectedRows.push({ row: index + 1, errors: ['duplicate record ignored'] });
        return;
      }

      const { record, errors } = createRecord(department, row, 'CSV_UPLOAD');
      if (record) {
        insertRecord(department, record);
        addedRecords.push(record);
        seenFingerprints.add(fingerprint);
      } else {
        rejectedRows.push({ row: index + 1, errors });
      }
    });

    const summary = addedRecords.length ? refreshGraph('csv_upload') : refreshGraph('csv_upload_no_valid_rows');
    logGraphAudit('csv_upload');
    logRecordAudit('csv_upload_completed', 'csv_upload', addedRecords, rejectedRows, summary);
    res.json({
      success: true,
      total_rows: rows.length,
      inserted_rows: addedRecords.length,
      skipped_rows: rejectedRows.length,
      added: addedRecords.length,
      ignored: rejectedRows.length,
      records: addedRecords,
      mappings: addedRecords.map(record => mappingForRecord(String(record.record_id))),
      rejected_rows: rejectedRows.slice(0, 25),
      summary,
    });
  } catch (error) {
    console.error('Failed to process CSV upload', error);
    sendError(res, 500, 'Failed to process CSV upload.');
  }
});

app.get('/api/review-queue', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const allRecords = getAllRecords(store);
  const queue = store.reviewQueue.map(item => {
    const recA = allRecords.find(record => record.record_id === item.record_a.record_id);
    const recB = allRecords.find(record => record.record_id === item.record_b.record_id);
    return {
      ...item,
      record_a_full: recA ? recordWithUbid(recA) : null,
      record_b_full: recB ? recordWithUbid(recB) : null,
    };
  });

  res.json(queue);
});

app.post('/api/review/:pairId', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { pairId } = req.params;
    const { decision, reviewer_id } = req.body;
    const item = store.reviewQueue.find(result => result.pair_id === pairId)
      || store.matchResults.find(result => result.pair_id === pairId);

    if (!item) {
      sendError(res, 404, 'Pair not found in review queue.');
      return;
    }

    if (!['approved', 'rejected', 'deferred', 'split'].includes(decision)) {
      sendError(res, 400, 'Decision must be approved, rejected, deferred, or split.');
      return;
    }

    if (decision === 'approved') {
      store.approvedPairs.add(item.pair_key);
      store.rejectedPairs.delete(item.pair_key);
      store.splitPairs.delete(item.pair_key);
      store.deferredPairs.delete(item.pair_key);
    } else if (decision === 'rejected') {
      store.rejectedPairs.add(item.pair_key);
      store.approvedPairs.delete(item.pair_key);
      store.splitPairs.delete(item.pair_key);
      store.deferredPairs.delete(item.pair_key);
    } else if (decision === 'split') {
      const ubidA = findUbidForRecord(item.record_a.record_id);
      const ubidB = findUbidForRecord(item.record_b.record_id);
      if (ubidA && ubidB && ubidA.ubid === ubidB.ubid) {
        store.preferredUbidByRecord.set(item.record_a.record_id, ubidA.ubid);
        store.preferredUbidByRecord.delete(item.record_b.record_id);
      }
      store.splitPairs.add(item.pair_key);
      store.approvedPairs.delete(item.pair_key);
      store.rejectedPairs.delete(item.pair_key);
      store.deferredPairs.delete(item.pair_key);
    } else {
      store.deferredPairs.add(item.pair_key);
    }

    const summary = refreshGraph(`review_${decision}`);
    logGraphAudit(`review_${decision}`, reviewer_id || 'reviewer_001');
    logReviewAction(decision, reviewer_id, item.record_a, item.record_b, item.confidence, item.pair_id);
    res.json({ success: true, decision, summary });
  } catch (error) {
    console.error('Review action failed', error);
    sendError(res, 500, 'Review action failed.');
  }
});

app.post('/api/ubids/:id/split', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const ubid = store.ubids.get(req.params.id);
    const recordId = cleanString(req.body.record_id);
    const reviewerId = cleanString(req.body.reviewer_id) || 'reviewer_001';

    if (!ubid) {
      sendError(res, 404, 'UBID not found.');
      return;
    }
    if (!recordId) {
      sendError(res, 400, 'record_id is required to split a UBID.');
      return;
    }
    if (!ubid.linked_records.some(record => record.record_id === recordId)) {
      sendError(res, 400, 'Selected record is not linked to this UBID.');
      return;
    }
    if (ubid.linked_records.length < 2) {
      sendError(res, 400, 'A UBID with one record cannot be split.');
      return;
    }

    const selected = ubid.linked_records.find(record => record.record_id === recordId)!;
    const others = ubid.linked_records.filter(record => record.record_id !== recordId);
    store.preferredUbidByRecord.delete(recordId);

    others.forEach(other => {
      const pairKey = canonicalPairKey(recordId, other.record_id);
      const existingMatch = matchForPair(recordId, other.record_id);
      store.preferredUbidByRecord.set(other.record_id, req.params.id);
      store.splitPairs.add(pairKey);
      store.approvedPairs.delete(pairKey);
      store.rejectedPairs.delete(pairKey);
      store.deferredPairs.delete(pairKey);
      logReviewAction('split', reviewerId, selected, other, existingMatch?.confidence || 0);
    });

    const summary = refreshGraph('ubid_split');
    logGraphAudit('ubid_split', reviewerId);
    const newUbid = store.recordToUBID.get(recordId) || null;
    res.json({
      success: true,
      old_ubid: req.params.id,
      new_ubid: newUbid,
      old_ubid_record: store.ubids.get(req.params.id) || null,
      new_ubid_record: newUbid ? store.ubids.get(newUbid) : null,
      summary,
    });
  } catch (error) {
    console.error('Split failed', error);
    sendError(res, 500, 'Split failed.');
  }
});

app.get('/api/departments', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const roleDepartment = departmentForRole(req);
  const visibleDepartments = roleDepartment ? [roleDepartment] : DEPARTMENTS;
  const departments = visibleDepartments.map(name => ({
    name,
    ...departmentCoverageStats(name),
    last_synced: store.lastSynced[name],
    last_synced_records: store.lastSyncedRecords[name],
  }));

  res.json(departments);
});

app.get('/api/analytics', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const department = departmentForRole(req);
  const summary = analyticsSummary();
  if (!department) {
    res.json(summary);
    return;
  }

  const visibleUbids = Array.from(store.ubids.values())
    .map(ubid => visibleUbidForDepartment(ubid, department))
    .filter(Boolean) as Array<{ status: 'Active' | 'Dormant' | 'Closed' }>;
  const status_counts = { Active: 0, Dormant: 0, Closed: 0 };
  visibleUbids.forEach(ubid => { status_counts[ubid.status]++; });

  res.json({
    ...summary,
    totals: {
      ...summary.totals,
      ubids: visibleUbids.length,
      records: datasetForDepartment(department).length,
      events: visibleEvents(store.events, department).length,
      unmatched_events: visibleUnmatchedEvents(department).length,
      pending_reviews: 0,
    },
    status_counts,
    department_counts: summary.department_counts.filter(item => item.department === department),
    unmatched_events: visibleUnmatchedEvents(department).slice(0, 25),
  });
});

app.get('/api/thresholds', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const department = departmentForRole(req);
  if (department) {
    res.json({ [department]: store.departmentThresholds[department] });
    return;
  }
  res.json(store.departmentThresholds);
});

app.put('/api/thresholds/:department', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const department = normalizeDepartment(req.params.department);
    if (!department) {
      sendError(res, 400, 'Valid department is required.');
      return;
    }

    const current = store.departmentThresholds[department];
    const next: MatchThresholds = {
      review: clampScore(req.body?.review, current.review),
      auto_link: clampScore(req.body?.auto_link, current.auto_link),
    };

    if (next.review < 0.3 || next.review > 0.84) {
      sendError(res, 400, 'Review threshold must be between 0.30 and 0.84.');
      return;
    }
    if (next.auto_link < 0.6 || next.auto_link > 0.99 || next.auto_link <= next.review) {
      sendError(res, 400, 'Auto-link threshold must be between 0.60 and 0.99 and above the review threshold.');
      return;
    }

    store.departmentThresholds[department] = next;
    const summary = refreshGraph('thresholds_updated');
    logGraphAudit('thresholds_updated', 'threshold_admin');
    pushAudit({
      reviewer_id: 'threshold_admin',
      pair_id: `THRESHOLD-${department}-${Date.now()}`,
      pair_key: null,
      action_type: 'threshold',
      decision: 'threshold_updated',
      record_a: null,
      record_b: null,
      confidence: 0,
      assigned_ubid: null,
      details: { department, previous: current, next, summary },
    });

    res.json({ success: true, department, thresholds: next, summary });
  } catch (error) {
    console.error('Threshold update failed', error);
    sendError(res, 500, 'Threshold update failed.');
  }
});

app.get('/api/sync/last', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const roleDepartment = departmentForRole(req);
  const departments = roleDepartment ? [roleDepartment] : DEPARTMENTS;
  refreshLastSyncedUbidMappings();
  res.json(Object.fromEntries(departments.map(department => [department, store.lastSyncedRecords[department]])));
});

app.get('/api/sync/status', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const roleDepartment = departmentForRole(req);
  const departments = roleDepartment ? [roleDepartment] : DEPARTMENTS;
  res.json(syncStatusForDepartments(departments));
});

app.post('/api/sync', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const requestedDepartment = normalizeDepartment(req.body?.department);
    res.json(runSyncImport(syncSourceFromValue(req.body?.source), requestedDepartment, req.body?.records));
  } catch (error) {
    console.error('Sync failed', error);
    sendError(res, 500, 'Sync failed.');
  }
});

app.post('/api/sync/auto', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const requestedDepartment = normalizeDepartment(req.body?.department);
    res.json(runSyncImport('AUTO_SYNC', requestedDepartment, req.body?.records));
  } catch (error) {
    console.error('Auto sync failed', error);
    sendError(res, 500, 'Auto sync failed.');
  }
});

app.get('/api/events', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  res.json(visibleEvents(store.events, departmentForRole(req)));
});

app.get('/api/events/unmatched', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  res.json(visibleUnmatchedEvents(departmentForRole(req)));
});

app.get('/api/notifications', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const department = departmentForRole(req);
  const ubid = cleanString(req.query.ubid);
  const notifications = store.notifications
    .filter(notification => !ubid || notification.ubid === ubid)
    .filter(notification => !department || notification.department === department);
  res.json(notifications);
});

app.post('/api/events', (req, res) => {
  try {
    if (!requireSelectedRole(req, res)) return;
    const roleDepartment = departmentForRole(req);
    const eventType = cleanString(req.body.event_type);
    const eventDate = cleanString(req.body.event_date) || new Date().toISOString().split('T')[0];
    let recordId = cleanString(req.body.record_id);
    let department = normalizeDepartment(req.body.department);
    const requestedUbid = cleanString(req.body.ubid);

    if (!eventType) {
      sendError(res, 400, 'event_type is required.');
      return;
    }

    if (!recordId && requestedUbid) {
      const ubid = store.ubids.get(requestedUbid);
      recordId = ubid?.linked_records[0]?.record_id || '';
    }

    const rawRecord = recordId ? findRawRecord(recordId) : null;
    if (!rawRecord) {
      department = department || (roleDepartment ? roleDepartment : null);
      if (!department) {
        sendError(res, 400, 'A valid record_id, UBID, or department is required.');
        return;
      }
      const unmatchedEvent = {
        event_id: nextEventId(),
        ubid: null,
        record_id: recordId || null,
        department,
        event_type: eventType,
        event_date: eventDate,
        details: cleanString(req.body.details) || `${eventType} could not be linked to a UBID`,
        business_name: cleanString(req.body.business_name) || null,
        pan: nullableUpper(req.body.pan),
        gstin: nullableUpper(req.body.gstin),
        phone: nullableString(req.body.phone),
        pin_code: nullableString(req.body.pin_code),
        status: 'Review Needed',
        reason: 'No confident record or UBID match was available for this event.',
        received_at: new Date().toISOString(),
      };
      store.unmatchedEvents.unshift(unmatchedEvent);
      pushAudit({
        reviewer_id: 'event_ingestion',
        pair_id: unmatchedEvent.event_id,
        pair_key: null,
        action_type: 'event_review',
        decision: 'unmatched_event_queued',
        record_a: null,
        record_b: null,
        confidence: 0,
        assigned_ubid: null,
        details: unmatchedEvent,
      });
      res.status(202).json({ success: true, event: unmatchedEvent, review_required: true });
      return;
    }
    if (roleDepartment && rawRecord.department !== roleDepartment) {
      sendError(res, 403, `This view can only add events for ${roleDepartment} records.`);
      return;
    }

    department = department || rawRecord.department;
    const event = {
      event_id: nextEventId(),
      ubid: store.recordToUBID.get(rawRecord.record_id) || null,
      record_id: rawRecord.record_id,
      department,
      event_type: eventType,
      event_date: eventDate,
      details: cleanString(req.body.details) || `${eventType} for ${rawRecord.business_name}`,
    };

    store.events.push(event);
    store.events.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
    const notification = createBusinessNotification(event);
    const summary = refreshActivity('event_added');
    const ubid = event.ubid ? store.ubids.get(event.ubid) || null : null;
    pushAudit({
      reviewer_id: 'event_ingestion',
      pair_id: event.event_id,
      action_type: 'event',
      decision: 'event_added',
      record_a: summarizeRecord(rawRecord),
      record_b: null,
      assigned_ubid: event.ubid,
      details: {
        event,
        notification,
        record: summarizeRecord(rawRecord),
        business_name: rawRecord.business_name,
        department,
        summary,
      },
    });

    res.status(201).json({ success: true, event, ubid, notification, summary });
  } catch (error) {
    console.error('Failed to add event', error);
    sendError(res, 500, 'Failed to add event.');
  }
});

app.post('/api/events/unmatched/:eventId/attach', (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const unmatched = store.unmatchedEvents.find(event => event.event_id === req.params.eventId);
    if (!unmatched || unmatched.status === 'Linked') {
      sendError(res, 404, 'Unmatched event not found.');
      return;
    }

    let recordId = cleanString(req.body.record_id);
    const requestedUbid = cleanString(req.body.ubid);
    if (!recordId && requestedUbid) {
      const ubid = store.ubids.get(requestedUbid);
      recordId = ubid?.linked_records[0]?.record_id || '';
    }

    const rawRecord = recordId ? findRawRecord(recordId) : null;
    if (!rawRecord) {
      sendError(res, 400, 'A valid record_id or UBID with linked records is required.');
      return;
    }

    const event = {
      event_id: unmatched.event_id,
      ubid: store.recordToUBID.get(rawRecord.record_id) || null,
      record_id: rawRecord.record_id,
      department: rawRecord.department,
      event_type: unmatched.event_type,
      event_date: unmatched.event_date,
      details: unmatched.details,
    };
    store.events.push(event);
    store.events.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
    const notification = createBusinessNotification(event);
    unmatched.status = 'Linked';
    unmatched.linked_record_id = rawRecord.record_id;
    unmatched.linked_ubid = event.ubid;
    unmatched.linked_at = new Date().toISOString();

    const summary = refreshActivity('unmatched_event_attached');
    pushAudit({
      reviewer_id: cleanString(req.body.reviewer_id) || 'reviewer_001',
      pair_id: unmatched.event_id,
      pair_key: null,
      action_type: 'event_review',
      decision: 'unmatched_event_attached',
      record_a: { record_id: rawRecord.record_id, department: rawRecord.department, business_name: rawRecord.business_name },
      record_b: null,
      confidence: 0,
      assigned_ubid: event.ubid,
      details: { event, notification, summary },
    });

    res.json({ success: true, event, summary });
  } catch (error) {
    console.error('Failed to attach unmatched event', error);
    sendError(res, 500, 'Failed to attach unmatched event.');
  }
});

app.get('/api/audit-log', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(store.auditLog.slice().sort((a, b) => timestampMs(b.timestamp) - timestampMs(a.timestamp)));
});

app.get('/api/query/factories-no-inspection', (req, res) => {
  if (!requireSelectedRole(req, res)) return;
  const roleDepartment = departmentForRole(req);
  if (roleDepartment && roleDepartment !== 'Factories') {
    res.json([]);
    return;
  }
  const pin = cleanString(req.query.pin) || '560058';
  const sector = cleanString(req.query.sector) || 'Manufacturing';
  const months = Number(req.query.months) || 18;
  res.json(factoriesNoInspectionQuery(pin, sector, months));
});

const PORT = Number(process.env.PORT || 3001);
const distPath = path.join(process.cwd(), 'dist');

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('dist/ not found, running vite build...');
  try {
    execSync('npx vite build', { stdio: 'inherit', cwd: process.cwd() });
    console.log('Build complete.');
  } catch {
    console.error('Build failed. Frontend will not be available.');
  }
}

if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api')) {
      sendError(res, 404, 'Not found');
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api')) {
      sendError(res, 404, 'Not found');
      return;
    }
    res.status(500).send('Frontend not built. Run: npm run build');
  });
}

app.listen(PORT, () => {
  console.log(`KBIG server running on port ${PORT}`);
  console.log(`Serving frontend from: ${distPath}`);
});
