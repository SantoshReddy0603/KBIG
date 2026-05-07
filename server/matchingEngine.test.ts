import assert from 'node:assert/strict';
import {
  canonicalPairKey,
  DataStore,
  DepartmentName,
  DEFAULT_THRESHOLDS,
  MatchResult,
  runActivityClassification,
  runMatchingEngine,
} from './matchingEngine.js';

function emptyStore(records: Partial<Record<DepartmentName, any[]>>): DataStore {
  return {
    shopRecords: records['Shop & Establishment'] || [],
    kspcbRecords: records.KSPCB || [],
    factoryRecords: records.Factories || [],
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
      'Shop & Establishment': new Date().toISOString(),
      KSPCB: new Date().toISOString(),
      Factories: new Date().toISOString(),
    },
    lastSyncedRecords: {
      'Shop & Establishment': [],
      KSPCB: [],
      Factories: [],
    },
  };
}

function record(record_id: string, department: DepartmentName, overrides: Record<string, unknown>) {
  return {
    record_id,
    department,
    business_name: 'Acme Engineering Works',
    owner_name: null,
    address: '12, Peenya Industrial Area Phase 2',
    pin_code: '560058',
    phone: null,
    pan: null,
    gstin: null,
    source: 'TEST',
    synced_at: null,
    ...overrides,
  };
}

function run(store: DataStore) {
  runMatchingEngine(store);
  runActivityClassification(store);
  return store;
}

function resultFor(store: DataStore, a: string, b: string): MatchResult | undefined {
  const key = canonicalPairKey(a, b);
  return store.matchResults.find(result => result.pair_key === key);
}

function assertSameUbid(store: DataStore, a: string, b: string) {
  assert.equal(store.recordToUBID.get(a), store.recordToUBID.get(b));
}

function assertDifferentUbid(store: DataStore, a: string, b: string) {
  assert.notEqual(store.recordToUBID.get(a), store.recordToUBID.get(b));
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-GSTIN-1', 'Shop & Establishment', {
        business_name: 'Unrelated Retail Mart',
        gstin: '29ABCDE1234F1Z5',
        pin_code: '560001',
      }),
    ],
    KSPCB: [
      record('KSPCB-GSTIN-1', 'KSPCB', {
        business_name: 'Different Legal Name Industries',
        gstin: '29ABCDE1234F1Z5',
        pin_code: '575011',
      }),
    ],
  }));

  const match = resultFor(store, 'SE-GSTIN-1', 'KSPCB-GSTIN-1');
  assert.equal(match?.outcome, 'Auto-Link');
  assert.ok((match?.confidence || 0) >= 0.85);
  assert.ok((match?.confidence || 1) < 0.95);
  assertSameUbid(store, 'SE-GSTIN-1', 'KSPCB-GSTIN-1');
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-GRADED-1', 'Shop & Establishment', {
        business_name: 'Basava Precision Tools',
        owner_name: 'Mahesh Gowda',
        address: '18, Peenya Industrial Area Phase 1',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
    Factories: [
      record('FAC-GRADED-1', 'Factories', {
        business_name: 'Basava Precision Tools Pvt Ltd',
        owner_name: 'Mahesh Gowda',
        address: '18 Peenya Ind Area Phase I',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
  }));

  const strong = resultFor(store, 'SE-GRADED-1', 'FAC-GRADED-1')?.confidence || 0;
  assert.ok(strong > 0.9);
  assert.ok(strong < 1);
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-DUP-1', 'Shop & Establishment', {
        business_name: 'Cauvery Packaging Works',
        gstin: '29KBGAA1003P1Z5',
        phone: '9833366677',
      }),
      record('SE-DUP-2', 'Shop & Establishment', {
        business_name: 'Cauvery Packaging Works',
        gstin: '29KBGAA1003P1Z5',
        phone: '9833366677',
      }),
    ],
  }));

  const match = resultFor(store, 'SE-DUP-1', 'SE-DUP-2');
  assert.equal(match?.outcome, 'Auto-Link');
  assertSameUbid(store, 'SE-DUP-1', 'SE-DUP-2');
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-CONFLICT-1', 'Shop & Establishment', {
        pan: 'ABCDE1234F',
        gstin: '29ABCDE1234F1Z5',
      }),
    ],
    Factories: [
      record('FAC-CONFLICT-1', 'Factories', {
        pan: 'ABCDE1234F',
        gstin: '29ABCDE1234F1Z9',
      }),
    ],
  }));

  const match = resultFor(store, 'SE-CONFLICT-1', 'FAC-CONFLICT-1');
  assert.equal(match?.outcome, 'Review Needed');
  assert.ok((match?.confidence || 1) < 0.85);
  assertDifferentUbid(store, 'SE-CONFLICT-1', 'FAC-CONFLICT-1');
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-PHONE-1', 'Shop & Establishment', {
        business_name: 'North Tools',
        address: '1, Market Road',
        phone: '9876543210',
      }),
    ],
    KSPCB: [
      record('KSPCB-PHONE-1', 'KSPCB', {
        business_name: 'South Chemicals',
        address: '99, Lake View',
        phone: '9876543210',
      }),
    ],
  }));

  const match = resultFor(store, 'SE-PHONE-1', 'KSPCB-PHONE-1');
  assert.notEqual(match?.outcome, 'Auto-Link');
  assertDifferentUbid(store, 'SE-PHONE-1', 'KSPCB-PHONE-1');
}

{
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-MISSING-1', 'Shop & Establishment', {
        business_name: 'Lakshmi Engineering Works',
        address: '12, Peenya Ind Area Phase II',
        phone: '9612345678',
      }),
    ],
    Factories: [
      record('FAC-MISSING-1', 'Factories', {
        business_name: 'Lakshmi Engg Works',
        address: '12 Peenya Industrial Area Phase 2',
        phone: '9612345678',
      }),
    ],
  }));

  const match = resultFor(store, 'SE-MISSING-1', 'FAC-MISSING-1');
  assert.equal(match?.outcome, 'Review Needed');
  assertDifferentUbid(store, 'SE-MISSING-1', 'FAC-MISSING-1');
}

{
  const store = emptyStore({
    'Shop & Establishment': [
      record('SE-APPROVED-1', 'Shop & Establishment', {
        business_name: 'Lakshmi Engineering Works',
        address: '12, Peenya Ind Area Phase II',
        phone: '9612345678',
      }),
    ],
    Factories: [
      record('FAC-APPROVED-1', 'Factories', {
        business_name: 'Lakshmi Engg Works',
        address: '12 Peenya Industrial Area Phase 2',
        phone: '9612345678',
      }),
    ],
  });

  store.approvedPairs.add(canonicalPairKey('SE-APPROVED-1', 'FAC-APPROVED-1'));
  run(store);
  assert.equal(resultFor(store, 'SE-APPROVED-1', 'FAC-APPROVED-1')?.reviewer_decision, 'approved');
  assertSameUbid(store, 'SE-APPROVED-1', 'FAC-APPROVED-1');
  run(store);
  assertSameUbid(store, 'SE-APPROVED-1', 'FAC-APPROVED-1');
}

{
  const store = emptyStore({
    'Shop & Establishment': [
      record('SE-REJECTED-1', 'Shop & Establishment', {
        business_name: 'Basava Precision Tools',
        owner_name: 'Mahesh Gowda',
        address: '18, Peenya Industrial Area Phase 1',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
    Factories: [
      record('FAC-REJECTED-1', 'Factories', {
        business_name: 'Basava Precision Tools Pvt Ltd',
        owner_name: 'Mahesh Gowda',
        address: '18 Peenya Ind Area Phase I',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
  });

  const pairKey = canonicalPairKey('SE-REJECTED-1', 'FAC-REJECTED-1');
  store.rejectedPairs.add(pairKey);
  run(store);
  assert.equal(resultFor(store, 'SE-REJECTED-1', 'FAC-REJECTED-1')?.outcome, 'Keep Separate');
  assert.equal(resultFor(store, 'SE-REJECTED-1', 'FAC-REJECTED-1')?.reviewer_decision, 'rejected');
  assert.ok(!store.reviewQueue.some(item => item.pair_key === pairKey));
  assertDifferentUbid(store, 'SE-REJECTED-1', 'FAC-REJECTED-1');
  run(store);
  assertDifferentUbid(store, 'SE-REJECTED-1', 'FAC-REJECTED-1');
}

{
  const store = emptyStore({
    'Shop & Establishment': [
      record('SE-SPLIT-1', 'Shop & Establishment', {
        business_name: 'Basava Precision Tools',
        owner_name: 'Mahesh Gowda',
        address: '18, Peenya Industrial Area Phase 1',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
    Factories: [
      record('FAC-SPLIT-1', 'Factories', {
        business_name: 'Basava Precision Tools Pvt Ltd',
        owner_name: 'Mahesh Gowda',
        address: '18 Peenya Ind Area Phase I',
        phone: '9811122233',
        pan: 'KBGAA1001P',
        gstin: '29KBGAA1001P1Z3',
      }),
    ],
  });

  const pairKey = canonicalPairKey('SE-SPLIT-1', 'FAC-SPLIT-1');
  store.splitPairs.add(pairKey);
  run(store);
  assert.equal(resultFor(store, 'SE-SPLIT-1', 'FAC-SPLIT-1')?.reviewer_decision, 'split');
  assert.ok(!store.reviewQueue.some(item => item.pair_key === pairKey));
  assertDifferentUbid(store, 'SE-SPLIT-1', 'FAC-SPLIT-1');
  run(store);
  assertDifferentUbid(store, 'SE-SPLIT-1', 'FAC-SPLIT-1');
}

{
  const kspcbMatches = Array.from({ length: 5 }, (_, index) => record(`KSPCB-TOP-${index}`, 'KSPCB', {
    business_name: `Cauvery Packaging Work ${index}`,
    address: `22, Bommasandra Industrial Area Phase 2, Shed ${index}`,
    phone: `990000000${index}`,
  }));
  const store = run(emptyStore({
    'Shop & Establishment': [
      record('SE-TOP-1', 'Shop & Establishment', {
        business_name: 'Cauvery Packaging Works',
        address: '22 Bommasandra Ind Area Phase II',
      }),
    ],
    KSPCB: kspcbMatches,
  }));

  const pairKeys = store.reviewQueue.map(item => item.pair_key);
  assert.equal(pairKeys.length, new Set(pairKeys).size);
  assert.ok(store.reviewQueue.filter(item =>
    item.record_a.record_id === 'SE-TOP-1' || item.record_b.record_id === 'SE-TOP-1'
  ).length <= 3);
}

console.log('matchingEngine edge cases passed');
