// Decision-aware multi-signal matching engine for KBIG.
// All mutations feed this recompute path so UBIDs, reviews, and status stay consistent.

export type DepartmentName = 'Shop & Establishment' | 'KSPCB' | 'Factories';

export interface MatchThresholds {
  review: number;
  auto_link: number;
}

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
  pair_key: string;
  record_a: { record_id: string; department: DepartmentName; business_name: string };
  record_b: { record_id: string; department: DepartmentName; business_name: string };
  confidence: number;
  signals: SignalBreakdown;
  explanation: string;
  outcome: 'Auto-Link' | 'Review Needed' | 'Keep Separate';
  ubid: string | null;
  reviewer_decision: 'pending' | 'approved' | 'rejected' | 'deferred' | 'split' | null;
}

export interface UBIDRecord {
  ubid: string;
  linked_records: Array<{ record_id: string; department: DepartmentName; business_name: string }>;
  status: 'Active' | 'Dormant' | 'Closed';
  last_event_date: string | null;
  last_event_type: string | null;
  source_departments: DepartmentName[];
  evidence_count: number;
  sector: string | null;
  pin_code: string;
  primary_name: string;
  confidence: number;
}

export type SyncSource = 'AUTO_SYNC' | 'MANUAL_SYNC';

export interface LastSyncedRecord {
  record_id: string;
  business_name: string;
  ubid: string | null;
  synced_at: string;
  source: SyncSource;
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
  approvedPairs: Set<string>;
  rejectedPairs: Set<string>;
  deferredPairs: Set<string>;
  splitPairs: Set<string>; // reviewer force-separated pairs
  recordToUBID: Map<string, string>;
  preferredUbidByRecord: Map<string, string>;
  departmentThresholds: Record<DepartmentName, MatchThresholds>;
  unmatchedEvents: any[];
  notifications: any[];
  auditKeys: Set<string>;
  lastSynced: Record<DepartmentName, string | null>;
  lastSyncedRecords: Record<DepartmentName, LastSyncedRecord[]>;
}

const SIGNAL_WEIGHTS = {
  gstin_match: 0.24,
  pan_match: 0.20,
  phone_match: 0.16,
  pin_match: 0.10,
  address_overlap: 0.14,
  owner_similarity: 0.07,
  name_similarity: 0.09,
};

export const DEFAULT_THRESHOLDS: Record<DepartmentName, MatchThresholds> = {
  'Shop & Establishment': { review: 0.55, auto_link: 0.85 },
  KSPCB: { review: 0.55, auto_link: 0.85 },
  Factories: { review: 0.55, auto_link: 0.85 },
};

const REVIEW_THRESHOLD = 0.55;
const AUTO_LINK_THRESHOLD = 0.85;

export function canonicalPairKey(recordA: string, recordB: string): string {
  return [recordA, recordB].sort().join('::');
}

export function getAllRecords(store: Pick<DataStore, 'shopRecords' | 'kspcbRecords' | 'factoryRecords'>): Array<any & { department: DepartmentName }> {
  return [
    ...store.shopRecords.map(r => ({ ...r, department: 'Shop & Establishment' as const })),
    ...store.kspcbRecords.map(r => ({ ...r, department: 'KSPCB' as const })),
    ...store.factoryRecords.map(r => ({ ...r, department: 'Factories' as const })),
  ];
}

function normalizeIdentifier(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

const NAME_REPLACEMENTS: Record<string, string> = {
  engg: 'engineering',
  eng: 'engineering',
  engr: 'engineering',
  engineers: 'engineering',
  mfg: 'manufacturing',
  manuf: 'manufacturing',
  inds: 'industries',
  indus: 'industries',
  pvt: 'private',
  ltd: 'limited',
  co: 'company',
  corp: 'corporation',
  wrks: 'works',
  wk: 'works',
};

const ADDRESS_REPLACEMENTS: Record<string, string> = {
  ind: 'industrial',
  inds: 'industrial',
  indl: 'industrial',
  rd: 'road',
  st: 'street',
  ii: '2',
  iii: '3',
  iv: '4',
};

function normalizeTokens(value: unknown, replacements: Record<string, string>): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map(token => replacements[token] || token)
    .filter(token => token.length > 1);
}

function normalizeString(value: unknown, replacements: Record<string, string> = {}): string {
  return normalizeTokens(value, replacements).join('');
}

function normalizePhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(value, 1)) * 1000) / 1000;
}

// Jaro-Winkler similarity implementation for noisy government registry names.
function jaroWinkler(rawA: string, rawB: string, replacements: Record<string, string> = NAME_REPLACEMENTS): number {
  const s1 = normalizeString(rawA, replacements);
  const s2 = normalizeString(rawB, replacements);
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
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

  if (!matches) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function levenshteinSimilarity(rawA: string, rawB: string): number {
  if (rawA === rawB) return 1;
  if (!rawA.length || !rawB.length) return 0;

  const previous = Array.from({ length: rawB.length + 1 }, (_, index) => index);
  const current = new Array(rawB.length + 1).fill(0);

  for (let i = 1; i <= rawA.length; i++) {
    current[0] = i;
    for (let j = 1; j <= rawB.length; j++) {
      const cost = rawA[i - 1] === rawB[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= rawB.length; j++) previous[j] = current[j];
  }

  return 1 - previous[rawB.length] / Math.max(rawA.length, rawB.length);
}

function tokenSimilarity(rawA: unknown, rawB: unknown, replacements: Record<string, string>): number {
  const tokensA = [...new Set(normalizeTokens(rawA, replacements))];
  const tokensB = [...new Set(normalizeTokens(rawB, replacements))];
  if (!tokensA.length || !tokensB.length) return 0;

  let matched = 0;
  const consumedB = new Set<number>();
  tokensA.forEach(tokenA => {
    let bestIndex = -1;
    let bestScore = 0;
    tokensB.forEach((tokenB, index) => {
      if (consumedB.has(index)) return;
      const score = tokenA === tokenB ? 1 : jaroWinkler(tokenA, tokenB, {});
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.82) {
      consumedB.add(bestIndex);
      matched += bestScore;
    }
  });

  return matched / Math.max(tokensA.length, tokensB.length);
}

function fuzzySimilarity(rawA: unknown, rawB: unknown, replacements: Record<string, string>): number {
  const compactA = normalizeString(rawA, replacements);
  const compactB = normalizeString(rawB, replacements);
  if (!compactA.length || !compactB.length) return 0;

  const jw = jaroWinkler(String(rawA || ''), String(rawB || ''), replacements);
  const edit = levenshteinSimilarity(compactA, compactB);
  const tokens = tokenSimilarity(rawA, rawB, replacements);
  return roundScore(Math.max(jw, edit * 0.45 + tokens * 0.4 + jw * 0.15));
}

function addressTokenOverlap(addrA: unknown, addrB: unknown): number {
  const tokensA = [...new Set(normalizeTokens(addrA, ADDRESS_REPLACEMENTS))];
  const tokensB = [...new Set(normalizeTokens(addrB, ADDRESS_REPLACEMENTS))];
  if (!tokensA.length || !tokensB.length) return 0;

  let overlap = 0;
  const consumedB = new Set<number>();
  tokensA.forEach(tokenA => {
    let bestIndex = -1;
    let bestScore = 0;
    tokensB.forEach((tokenB, index) => {
      if (consumedB.has(index)) return;
      const score = tokenA === tokenB ? 1 : jaroWinkler(tokenA, tokenB, {});
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.9) {
      consumedB.add(bestIndex);
      overlap += bestScore;
    }
  });

  return roundScore(overlap / Math.max(tokensA.length, tokensB.length));
}

function hasIdentifier(record: any): boolean {
  return Boolean(normalizeIdentifier(record.pan) || normalizeIdentifier(record.gstin));
}

function hasGstinConflict(recA: any, recB: any): boolean {
  const gstinA = normalizeIdentifier(recA.gstin);
  const gstinB = normalizeIdentifier(recB.gstin);
  return Boolean(gstinA && gstinB && gstinA !== gstinB);
}

function hasPanConflict(recA: any, recB: any): boolean {
  const panA = normalizeIdentifier(recA.pan);
  const panB = normalizeIdentifier(recB.pan);
  return Boolean(panA && panB && panA !== panB);
}

function supportingEvidenceScore(signals: SignalBreakdown): number {
  return roundScore(
    signals.phone_match * 0.24 +
    signals.pin_match * 0.14 +
    signals.address_overlap * 0.22 +
    signals.owner_similarity * 0.14 +
    signals.name_similarity * 0.26
  );
}

function computeSignals(recA: any, recB: any): SignalBreakdown {
  const panA = normalizeIdentifier(recA.pan);
  const panB = normalizeIdentifier(recB.pan);
  const pan_match = panA && panB && panA === panB ? 1 : 0;

  const gstinA = normalizeIdentifier(recA.gstin);
  const gstinB = normalizeIdentifier(recB.gstin);
  const gstin_match = gstinA && gstinB && gstinA === gstinB ? 1 : 0;

  const name_similarity = fuzzySimilarity(recA.business_name, recB.business_name, NAME_REPLACEMENTS);
  const pin_match = recA.pin_code && recB.pin_code && String(recA.pin_code) === String(recB.pin_code) ? 1 : 0;
  const address_overlap = addressTokenOverlap(recA.address, recB.address);

  const phoneA = normalizePhone(recA.phone);
  const phoneB = normalizePhone(recB.phone);
  const phone_match = phoneA && phoneB && phoneA === phoneB ? 1 : 0;

  const owner_similarity = fuzzySimilarity(recA.owner_name, recB.owner_name, NAME_REPLACEMENTS);

  const weightedTotal =
    gstin_match * SIGNAL_WEIGHTS.gstin_match +
    pan_match * SIGNAL_WEIGHTS.pan_match +
    name_similarity * SIGNAL_WEIGHTS.name_similarity +
    address_overlap * SIGNAL_WEIGHTS.address_overlap +
    phone_match * SIGNAL_WEIGHTS.phone_match +
    owner_similarity * SIGNAL_WEIGHTS.owner_similarity +
    pin_match * SIGNAL_WEIGHTS.pin_match;

  const support = supportingEvidenceScore({
    pan_match,
    gstin_match,
    name_similarity,
    pin_match,
    address_overlap,
    phone_match,
    owner_similarity,
    total: 0,
  });

  let total = weightedTotal;
  if (gstin_match) {
    const hasConflict = hasPanConflict(recA, recB) || (name_similarity < 0.45 && address_overlap < 0.35 && !phone_match);
    total = Math.max(total, (hasConflict ? 0.72 : 0.84) + support * (hasConflict ? 0.10 : 0.14));
  } else if (pan_match) {
    total = Math.max(total, 0.52 + support * 0.30);
  }

  return {
    pan_match,
    gstin_match,
    name_similarity,
    pin_match,
    address_overlap,
    phone_match,
    owner_similarity,
    total: roundScore(total),
  };
}

function missingIdentifiersSimilarity(signals: SignalBreakdown): number {
  return roundScore(
    signals.phone_match * 0.22 +
    signals.pin_match * 0.10 +
    signals.address_overlap * 0.24 +
    signals.owner_similarity * 0.14 +
    signals.name_similarity * 0.30
  );
}

function classifyOutcome(
  recA: any,
  recB: any,
  signals: SignalBreakdown,
  thresholds: MatchThresholds = { review: REVIEW_THRESHOLD, auto_link: AUTO_LINK_THRESHOLD },
): {
  outcome: 'Auto-Link' | 'Review Needed' | 'Keep Separate';
  confidence: number;
  explanationOverride?: string;
} {
  if (signals.gstin_match === 1) {
    if (signals.total < thresholds.auto_link) {
      return {
        outcome: 'Review Needed',
        confidence: signals.total,
        explanationOverride: 'GSTIN matches, but supporting name, address, phone, or owner signals are not strong enough for automatic linking.',
      };
    }
    return {
      outcome: 'Auto-Link',
      confidence: signals.total,
      explanationOverride: 'Exact GSTIN match plus supporting signals crosses the auto-link threshold.',
    };
  }

  if (signals.pan_match === 1 && hasGstinConflict(recA, recB)) {
    return {
      outcome: 'Review Needed',
      confidence: Math.min(Math.max(signals.total * 0.86, 0.58), 0.78),
      explanationOverride: 'PAN matches, but GSTIN values conflict. Auto-link blocked for reviewer verification.',
    };
  }

  if (hasPanConflict(recA, recB) || hasGstinConflict(recA, recB)) {
    const support = supportingEvidenceScore(signals);
    return {
      outcome: support >= thresholds.review ? 'Review Needed' : 'Keep Separate',
      confidence: Math.min(support, 0.62),
      explanationOverride: support >= thresholds.review
        ? 'Identifier values conflict; strong supporting signals require human review.'
        : 'Identifier values conflict and supporting signals are not strong enough to link.',
    };
  }

  const bothRecordsMissingIdentifiers = !hasIdentifier(recA) && !hasIdentifier(recB);
  if (bothRecordsMissingIdentifiers) {
    const fallbackScore = missingIdentifiersSimilarity(signals);
    return {
      outcome: fallbackScore >= thresholds.review ? 'Review Needed' : 'Keep Separate',
      confidence: Math.min(fallbackScore, 0.74),
      explanationOverride: fallbackScore >= thresholds.review
        ? 'PAN and GSTIN are missing on both records; name, address, and phone signals require review.'
        : 'PAN and GSTIN are missing on both records, and fallback signals are too weak to link.',
    };
  }

  const missingGstin = !normalizeIdentifier(recA.gstin) || !normalizeIdentifier(recB.gstin);
  const missingPan = !normalizeIdentifier(recA.pan) || !normalizeIdentifier(recB.pan);
  if (missingGstin || missingPan) {
    const confidence = Math.min(signals.total, thresholds.auto_link - 0.01);
    if (confidence >= thresholds.review) {
      return {
        outcome: 'Review Needed',
        confidence,
        explanationOverride: 'GSTIN or PAN is missing; supporting fields are strong enough for review but not automatic linking.',
      };
    }
    return { outcome: 'Keep Separate', confidence };
  }

  if (signals.total >= thresholds.auto_link) return { outcome: 'Auto-Link', confidence: signals.total };
  if (signals.total >= thresholds.review) return { outcome: 'Review Needed', confidence: signals.total };
  return { outcome: 'Keep Separate', confidence: signals.total };
}

function explainSignals(signals: SignalBreakdown): string {
  const strongSignals: string[] = [];
  if (signals.pan_match === 1) strongSignals.push('PAN');
  if (signals.gstin_match === 1) strongSignals.push('GSTIN');
  if (signals.phone_match === 1) strongSignals.push('phone');
  if (signals.name_similarity >= 0.8) strongSignals.push('business name');
  if (signals.owner_similarity >= 0.8) strongSignals.push('owner name');
  if (signals.address_overlap >= 0.6) strongSignals.push('address');

  const confidenceLabel = signals.total >= AUTO_LINK_THRESHOLD ? 'High' : signals.total >= REVIEW_THRESHOLD ? 'Moderate' : 'Low';
  if (strongSignals.length) {
    return `${confidenceLabel} confidence due to ${strongSignals.join(' + ')} match signals.`;
  }
  return `${confidenceLabel} confidence because only weak or partial match signals were found.`;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function deterministicUBID(recordIds: string[], used: Set<string>): string {
  const signature = recordIds.slice().sort().join('|');
  let salt = 0;
  while (true) {
    const num = 100000 + (stableHash(`${signature}:${salt}`) % 900000);
    const ubid = `UBID-KA-${num}`;
    if (!used.has(ubid)) return ubid;
    salt++;
  }
}

function pairParts(pairKey: string): [string, string] {
  const [a, b] = pairKey.split('::');
  return [a, b];
}

function findParent(recordId: string, parent: Map<string, string>): string {
  if (!parent.has(recordId)) parent.set(recordId, recordId);
  const current = parent.get(recordId)!;
  if (current !== recordId) {
    const root = findParent(current, parent);
    parent.set(recordId, root);
    return root;
  }
  return current;
}

function groupWouldViolateBlock(
  rootA: string,
  rootB: string,
  allRecordIds: string[],
  parent: Map<string, string>,
  blockedPairs: Set<string>
): boolean {
  if (rootA === rootB) return false;

  const groupA = new Set(allRecordIds.filter(recordId => findParent(recordId, parent) === rootA));
  const groupB = new Set(allRecordIds.filter(recordId => findParent(recordId, parent) === rootB));

  for (const pairKey of blockedPairs) {
    const [a, b] = pairParts(pairKey);
    if ((groupA.has(a) && groupB.has(b)) || (groupA.has(b) && groupB.has(a))) {
      return true;
    }
  }

  return false;
}

function thresholdsForPair(store: DataStore, recA: any, recB: any): MatchThresholds {
  const departmentA = recA.department as DepartmentName;
  const departmentB = recB.department as DepartmentName;
  const first = store.departmentThresholds?.[departmentA] || DEFAULT_THRESHOLDS[departmentA];
  const second = store.departmentThresholds?.[departmentB] || DEFAULT_THRESHOLDS[departmentB];
  return {
    review: Math.max(first.review, second.review),
    auto_link: Math.max(first.auto_link, second.auto_link),
  };
}

function unionRecords(
  recordA: string,
  recordB: string,
  parent: Map<string, string>,
  allRecordIds: string[],
  blockedPairs: Set<string>,
  force = false
): boolean {
  const rootA = findParent(recordA, parent);
  const rootB = findParent(recordB, parent);
  if (rootA === rootB) return true;
  if (!force && groupWouldViolateBlock(rootA, rootB, allRecordIds, parent, blockedPairs)) return false;
  parent.set(rootA, rootB);
  return true;
}

function getPrimaryRecord(groupRecords: any[], previous?: UBIDRecord): any {
  if (previous) {
    const previousPrimary = groupRecords.find(record => record.business_name === previous.primary_name);
    if (previousPrimary) return previousPrimary;
    const previousLinked = previous.linked_records
      .map(linked => groupRecords.find(record => record.record_id === linked.record_id))
      .find(Boolean);
    if (previousLinked) return previousLinked;
  }

  return groupRecords
    .slice()
    .sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)))[0];
}

function singletonIdentityConfidence(record: any): number {
  const hasGstin = Boolean(normalizeIdentifier(record.gstin));
  const hasPan = Boolean(normalizeIdentifier(record.pan));
  const hasName = Boolean(normalizeString(record.business_name, NAME_REPLACEMENTS));
  const hasAddress = Boolean(normalizeString(record.address, ADDRESS_REPLACEMENTS));
  const hasPhone = Boolean(normalizePhone(record.phone));
  const hasOwner = Boolean(normalizeString(record.owner_name, NAME_REPLACEMENTS));
  const hasPin = Boolean(record.pin_code);

  return roundScore(
    (hasGstin ? 0.24 : 0) +
    (hasPan ? 0.18 : 0) +
    (hasName ? 0.20 : 0) +
    (hasAddress ? 0.16 : 0) +
    (hasPhone ? 0.10 : 0) +
    (hasOwner ? 0.07 : 0) +
    (hasPin ? 0.05 : 0)
  );
}

function pickPreviousUBID(
  recordIds: string[],
  previousUbids: UBIDRecord[],
  usedPrevious: Set<string>,
  preferredUbidByRecord: Map<string, string>
): UBIDRecord | undefined {
  const group = new Set(recordIds);
  const reservedForOtherGroups = new Set<string>();
  const preferredCounts = new Map<string, number>();
  preferredUbidByRecord.forEach((ubid, recordId) => {
    if (!group.has(recordId)) reservedForOtherGroups.add(ubid);
  });
  recordIds.forEach(recordId => {
    const preferred = preferredUbidByRecord.get(recordId);
    if (preferred) preferredCounts.set(preferred, (preferredCounts.get(preferred) || 0) + 1);
  });

  const preferred = Array.from(preferredCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ubid]) => previousUbids.find(previous => previous.ubid === ubid))
    .find(previous => previous && !usedPrevious.has(previous.ubid));

  if (preferred) {
    usedPrevious.add(preferred.ubid);
    return preferred;
  }

  let best: { ubid: UBIDRecord; overlap: number } | null = null;

  for (const ubid of previousUbids) {
    if (usedPrevious.has(ubid.ubid)) continue;
    if (reservedForOtherGroups.has(ubid.ubid)) continue;
    const overlap = ubid.linked_records.filter(record => group.has(record.record_id)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) {
      best = { ubid, overlap };
    }
  }

  if (!best) return undefined;
  usedPrevious.add(best.ubid.ubid);
  return best.ubid;
}

export function runMatchingEngine(store: DataStore): void {
  const allRecords = getAllRecords(store);
  const allRecordIds = allRecords.map(record => record.record_id);
  const recordsById = new Map(allRecords.map(record => [record.record_id, record]));
  const previousUbids = Array.from(store.ubids.values());

  store.matchResults = [];
  store.reviewQueue = [];
  store.recordToUBID = new Map();

  const blockedPairs = new Set<string>([...store.rejectedPairs, ...store.splitPairs]);
  store.approvedPairs.forEach(pairKey => blockedPairs.delete(pairKey));

  for (let i = 0; i < allRecords.length; i++) {
    for (let j = i + 1; j < allRecords.length; j++) {
      const recA = allRecords[i];
      const recB = allRecords[j];

      const pairKey = canonicalPairKey(recA.record_id, recB.record_id);
      const isApproved = store.approvedPairs.has(pairKey);
      const isRejected = store.rejectedPairs.has(pairKey) && !isApproved;
      const isSplit = store.splitPairs.has(pairKey) && !isApproved;
      const isDeferred = store.deferredPairs.has(pairKey);
      const signals = computeSignals(recA, recB);
      const classification = classifyOutcome(recA, recB, signals, thresholdsForPair(store, recA, recB));
      signals.total = roundScore(classification.confidence);
      const hasManualDecision = isApproved || isRejected || isSplit || isDeferred;

      if (signals.total < 0.3 && classification.outcome === 'Keep Separate' && !hasManualDecision) continue;

      let outcome = classification.outcome;
      let reviewerDecision: MatchResult['reviewer_decision'] = outcome === 'Review Needed' ? 'pending' : null;

      if (isApproved) {
        outcome = 'Auto-Link';
        reviewerDecision = 'approved';
      } else if (isRejected) {
        outcome = 'Keep Separate';
        reviewerDecision = 'rejected';
      } else if (isSplit) {
        outcome = 'Keep Separate';
        reviewerDecision = 'split';
      } else if (isDeferred && outcome === 'Review Needed') {
        reviewerDecision = 'deferred';
      }

      store.matchResults.push({
        pair_id: `${recA.record_id}::${recB.record_id}`,
        pair_key: pairKey,
        record_a: { record_id: recA.record_id, department: recA.department, business_name: recA.business_name },
        record_b: { record_id: recB.record_id, department: recB.department, business_name: recB.business_name },
        confidence: signals.total,
        signals,
        explanation: classification.explanationOverride || explainSignals(signals),
        outcome,
        ubid: null,
        reviewer_decision: reviewerDecision,
      });
    }
  }

  const parent = new Map<string, string>();
  allRecordIds.forEach(recordId => parent.set(recordId, recordId));

  const approvedResults = store.matchResults.filter(result => store.approvedPairs.has(result.pair_key));
  approvedResults.forEach(result => {
    unionRecords(result.record_a.record_id, result.record_b.record_id, parent, allRecordIds, blockedPairs, true);
  });

  const autoLinkedResults = store.matchResults
    .filter(result => result.outcome === 'Auto-Link' && !store.approvedPairs.has(result.pair_key))
    .sort((a, b) => b.confidence - a.confidence);

  autoLinkedResults.forEach(result => {
    unionRecords(result.record_a.record_id, result.record_b.record_id, parent, allRecordIds, blockedPairs);
  });

  const groups = new Map<string, string[]>();
  allRecordIds.forEach(recordId => {
    const root = findParent(recordId, parent);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(recordId);
  });

  const usedUbids = new Set<string>();
  const usedPrevious = new Set<string>();
  const nextUbids = new Map<string, UBIDRecord>();
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.join('|').localeCompare(b.join('|'));
  });

  sortedGroups.forEach(recordIds => {
    const previous = pickPreviousUBID(recordIds, previousUbids, usedPrevious, store.preferredUbidByRecord);
    const ubid = previous?.ubid || deterministicUBID(recordIds, usedUbids);
    usedUbids.add(ubid);

    const groupRecords = recordIds
      .map(recordId => recordsById.get(recordId))
      .filter(Boolean) as Array<any & { department: DepartmentName }>;
    const primaryRecord = getPrimaryRecord(groupRecords, previous);
    const linkedRecords = groupRecords
      .slice()
      .sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)))
      .map(record => ({
        record_id: record.record_id,
        department: record.department,
        business_name: record.business_name,
      }));

    const internalResults = store.matchResults.filter(result =>
      recordIds.includes(result.record_a.record_id) &&
      recordIds.includes(result.record_b.record_id) &&
      result.outcome !== 'Keep Separate'
    );

    const confidence = internalResults.length
      ? roundScore(internalResults.reduce((sum, result) => sum + result.confidence, 0) / internalResults.length)
      : singletonIdentityConfidence(groupRecords[0]);

    const ubidRecord: UBIDRecord = {
      ubid,
      linked_records: linkedRecords,
      status: previous?.status || 'Active',
      last_event_date: null,
      last_event_type: null,
      source_departments: [...new Set(linkedRecords.map(record => record.department))],
      evidence_count: 0,
      sector: groupRecords.find(record => record.sector)?.sector || previous?.sector || null,
      pin_code: primaryRecord?.pin_code || groupRecords.find(record => record.pin_code)?.pin_code || '',
      primary_name: primaryRecord?.business_name || linkedRecords[0]?.business_name || 'Unknown Business',
      confidence: roundScore(confidence),
    };

    nextUbids.set(ubid, ubidRecord);
    recordIds.forEach(recordId => store.recordToUBID.set(recordId, ubid));
  });

  store.ubids = nextUbids;

  store.matchResults.forEach(result => {
    const ubidA = store.recordToUBID.get(result.record_a.record_id);
    const ubidB = store.recordToUBID.get(result.record_b.record_id);
    if (ubidA && ubidA === ubidB && result.outcome !== 'Keep Separate') {
      result.ubid = ubidA;
    }
  });

  const reviewCounts = new Map<string, number>();
  const reviewPairs = new Set<string>();
  store.reviewQueue = store.matchResults
    .filter(result => result.outcome === 'Review Needed')
    .sort((a, b) => b.confidence - a.confidence)
    .filter(result => {
      if (reviewPairs.has(result.pair_key)) return false;
      const countA = reviewCounts.get(result.record_a.record_id) || 0;
      const countB = reviewCounts.get(result.record_b.record_id) || 0;
      if (countA >= 3 || countB >= 3) return false;
      reviewCounts.set(result.record_a.record_id, countA + 1);
      reviewCounts.set(result.record_b.record_id, countB + 1);
      reviewPairs.add(result.pair_key);
      return true;
    });

  store.events.forEach(event => {
    if (event.record_id && store.recordToUBID.has(event.record_id)) {
      event.ubid = store.recordToUBID.get(event.record_id);
    }
  });
}

export function runActivityClassification(store: DataStore): void {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const allRecords = getAllRecords(store);

  store.ubids.forEach(ubidRecord => {
    const ubidEvents = store.events
      .filter(event => event.ubid === ubidRecord.ubid)
      .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
    const linkedRaw = ubidRecord.linked_records
      .map(linked => allRecords.find(record => record.record_id === linked.record_id))
      .filter(Boolean);

    ubidRecord.evidence_count = ubidEvents.length;
    ubidRecord.last_event_date = ubidEvents[0]?.event_date || null;
    ubidRecord.last_event_type = ubidEvents[0]?.event_type || null;

    const hasClosedStatus = linkedRaw.some(record => String(record.status || '').toLowerCase() === 'closed');
    const hasDormantStatus = linkedRaw.some(record => String(record.status || '').toLowerCase() === 'dormant');
    const hasClosureEvent = ubidEvents.some(event => String(event.event_type || '').toLowerCase().includes('closure'));

    if (hasClosedStatus || hasClosureEvent) {
      ubidRecord.status = 'Closed';
    } else if (!ubidEvents.length) {
      ubidRecord.status = hasDormantStatus ? 'Dormant' : 'Active';
    } else {
      const lastDate = new Date(ubidEvents[0].event_date);
      ubidRecord.status = lastDate >= sixMonthsAgo
        ? 'Active'
        : lastDate >= twelveMonthsAgo
          ? 'Dormant'
          : 'Dormant';
    }

    const eventDepartments = ubidEvents
      .map(event => event.department)
      .filter(Boolean) as DepartmentName[];
    ubidRecord.source_departments = [
      ...new Set([...ubidRecord.source_departments, ...eventDepartments]),
    ];
  });
}
