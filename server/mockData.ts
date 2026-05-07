// Legacy record shapes retained for imports/tests. Runtime startup must not seed records.

export interface ShopRecord {
  record_id: string;
  business_name: string;
  owner_name: string;
  address: string;
  pin_code: string;
  phone: string;
  pan: string;
  gstin: string;
  licence_number: string;
  last_renewed: string;
  status: string;
  department: string;
}

export interface KSPCBRecord {
  record_id: string;
  business_name: string;
  owner_name: string;
  address: string;
  pin_code: string;
  phone: string;
  pan: string;
  consent_number: string;
  last_filing_date: string;
  inspection_date: string;
  department: string;
}

export interface FactoryRecord {
  record_id: string;
  business_name: string;
  owner_name: string;
  address: string;
  pin_code: string;
  phone: string;
  gstin: string;
  factory_licence: string;
  last_inspection: string;
  sector: string;
  department: string;
}

export interface ActivityEvent {
  event_id: string;
  ubid: string | null;
  record_id: string;
  department: string;
  event_type: string;
  event_date: string;
  details: string;
}

export function generateMockData() {
  const shopRecords: ShopRecord[] = [];
  const kspcbRecords: KSPCBRecord[] = [];
  const factoryRecords: FactoryRecord[] = [];

  return { shopRecords, kspcbRecords, factoryRecords };
}

export function generateEventStream(): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  return events;
}
