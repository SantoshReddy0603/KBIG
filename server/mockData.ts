// Mock data for 3 Karnataka government departments
// Deliberately creates overlaps to simulate real-world data quality issues

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

// Shared businesses that appear in multiple departments with slight variations
const sharedBusinesses = [
  {
    se: { business_name: "Sri Venkateshwara Textiles", owner_name: "Ramesh K", address: "14, 2nd Cross, Rajajinagar", pin_code: "560010", phone: "9443218765", pan: "ABCPK1234F", gstin: "29ABCPK1234F1Z5", licence_number: "SE-2021-0456", last_renewed: "2025-08-15", status: "Active" },
    kspcb: { business_name: "Sri Venkateshwara Textile Mills", owner_name: "Ramesh Kumar", address: "14, 2nd Cross, Rajajinagar, Bangalore", pin_code: "560010", phone: "9443218765", pan: "ABCPK1234F", consent_number: "KSPCB-C-2020-1123", last_filing_date: "2025-06-20", inspection_date: "2025-03-10" },
    factory: { business_name: "Sri Venkateshwara Textiles Pvt Ltd", owner_name: "Ramesh K", address: "14, 2nd Cross, Rajajinagar Ind Area", pin_code: "560010", phone: "9443218765", gstin: "29ABCPK1234F1Z5", factory_licence: "FL-2019-0789", last_inspection: "2025-03-10", sector: "Manufacturing" },
  },
  {
    se: { business_name: "Nandini Dairy Products", owner_name: "Suresh B", address: "56, Industrial Layout, Peenya", pin_code: "560058", phone: "9845612340", pan: "DEFPS5678G", gstin: "29DEFPS5678G1Z3", licence_number: "SE-2020-1122", last_renewed: "2025-11-01", status: "Active" },
    kspcb: { business_name: "Nandini Dairy & Products", owner_name: "Suresh Babu", address: "56, Industrial Layout, Peenya Phase 1", pin_code: "560058", phone: "9845612340", pan: "DEFPS5678G", consent_number: "KSPCB-C-2019-0567", last_filing_date: "2025-09-15", inspection_date: "2025-07-22" },
    factory: { business_name: "Nandini Dairy Products India", owner_name: "Suresh B", address: "56, Industrial Layout, Peenya", pin_code: "560058", phone: "9845612340", gstin: "29DEFPS5678G1Z3", factory_licence: "FL-2018-0234", last_inspection: "2025-07-22", sector: "Food Processing" },
  },
  {
    se: { business_name: "Karnataka Steel Works", owner_name: "Mohan Reddy", address: "78, KIADB, Whitefield", pin_code: "560066", phone: "9887765432", pan: "GHJMR9012H", gstin: "29GHJMR9012H1Z7", licence_number: "SE-2019-0890", last_renewed: "2024-12-10", status: "Active" },
    kspcb: { business_name: "Karnataka Steel Works Ltd", owner_name: "Mohan Reddy K", address: "78, KIADB Industrial Area, Whitefield", pin_code: "560066", phone: "9887765432", pan: "GHJMR9012H", consent_number: "KSPCB-C-2018-0345", last_filing_date: "2024-11-30", inspection_date: "2024-09-15" },
    factory: { business_name: "Karnataka Steel Works", owner_name: "Mohan Reddy", address: "78, KIADB, Whitefield", pin_code: "560066", phone: "9887765432", gstin: "29GHJMR9012H1Z7", factory_licence: "FL-2017-0567", last_inspection: "2024-09-15", sector: "Manufacturing" },
  },
  {
    se: { business_name: "Mysore Agro Industries", owner_name: "Venugopal D", address: "23, Hebbal Industrial Estate", pin_code: "560024", phone: "9734567891", pan: "KLMVD3456J", gstin: "29KLMVD3456J1Z9", licence_number: "SE-2022-0334", last_renewed: "2025-05-20", status: "Active" },
    factory: { business_name: "Mysore Agro Industries Pvt Ltd", owner_name: "Venugopal D", address: "23, Hebbal Industrial Estate", pin_code: "560024", phone: "9734567891", gstin: "29KLMVD3456J1Z9", factory_licence: "FL-2020-0890", last_inspection: "2025-01-18", sector: "Agriculture" },
  },
  {
    se: { business_name: "Bangalore Chemical Industries", owner_name: "Anand Sharma", address: "45, Bommasandra Industrial Area", pin_code: "560099", phone: "9876543210", pan: "NOPAS7890K", gstin: "29NOPAS7890K1Z1", licence_number: "SE-2018-0567", last_renewed: "2024-06-30", status: "Active" },
    kspcb: { business_name: "Bangalore Chemical Inds", owner_name: "Anand Sharma", address: "45, Bommasandra Ind Area, Anekal Taluk", pin_code: "560099", phone: "9876543210", pan: "NOPAS7890K", consent_number: "KSPCB-C-2017-0789", last_filing_date: "2024-05-15", inspection_date: "2024-04-20" },
  },
  {
    se: { business_name: "Lakshmi Engineering Works", owner_name: "Krishna Murthy", address: "12, Peenya Industrial Area Phase 2", pin_code: "560058", phone: "9612345678", pan: "QRSKM1234L", gstin: "29QRSKM1234L1Z4", licence_number: "SE-2020-0789", last_renewed: "2025-09-25", status: "Active" },
    factory: { business_name: "Lakshmi Engg Works", owner_name: "Krishna Murthy V", address: "12, Peenya Ind Area Phase II", pin_code: "560058", phone: "9612345678", gstin: "29QRSKM1234L1Z4", factory_licence: "FL-2019-0123", last_inspection: "2025-06-12", sector: "Manufacturing" },
  },
  {
    se: { business_name: "Hubli Food Processing Unit", owner_name: "Prakash Joshi", address: "34, Gokul Road, Hubli", pin_code: "580030", phone: "9445678901", pan: "TUVPP5678M", gstin: "29TUVPP5678M1Z6", licence_number: "SE-2021-0234", last_renewed: "2025-07-15", status: "Active" },
    kspcb: { business_name: "Hubli Food Processing", owner_name: "Prakash Joshi", address: "34, Gokul Road, Hubli", pin_code: "580030", phone: "9445678901", pan: "TUVPP5678M", consent_number: "KSPCB-C-2021-0456", last_filing_date: "2025-08-10", inspection_date: "2025-05-28" },
    factory: { business_name: "Hubli Food Processing Unit", owner_name: "Prakash Joshi", address: "34, Gokul Road, Hubli", pin_code: "580030", phone: "9445678901", gstin: "29TUVPP5678M1Z6", factory_licence: "FL-2021-0456", last_inspection: "2025-05-28", sector: "Food Processing" },
  },
  {
    se: { business_name: "Mangalore Fisheries Pvt Ltd", owner_name: "Ahmed Khan", address: "89, Port Road, Mangalore", pin_code: "575001", phone: "9823456789", pan: "WXYAK9012N", gstin: "29WXYAK9012N1Z8", licence_number: "SE-2019-0567", last_renewed: "2024-10-20", status: "Active" },
    kspcb: { business_name: "Mangalore Fisheries", owner_name: "Ahmed Khan M", address: "89, Port Road, Mangalore", pin_code: "575001", phone: "9823456789", pan: "WXYAK9012N", consent_number: "KSPCB-C-2019-0890", last_filing_date: "2024-09-30", inspection_date: "2024-08-15" },
  },
];

// Unique S&E only businesses
const seOnlyBusinesses: Omit<ShopRecord, 'record_id' | 'department'>[] = [
  { business_name: "Brindavan Stores", owner_name: "Lakshmi Devi", address: "5, MG Road, Bangalore", pin_code: "560001", phone: "9901234567", pan: "AAALD1111A", gstin: "29AAALD1111A1Z1", licence_number: "SE-2022-0111", last_renewed: "2025-10-05", status: "Active" },
  { business_name: "Chamundi Electronics", owner_name: "Narayana Swamy", address: "22, Krishnarajapuram", pin_code: "560036", phone: "9802345678", pan: "BBBNS2222B", gstin: "29BBBNS2222B1Z2", licence_number: "SE-2023-0222", last_renewed: "2025-12-01", status: "Active" },
  { business_name: "Deccan Hardware", owner_name: "Ravikumar P", address: "8, Jayanagar 4th Block", pin_code: "560041", phone: "9703456789", pan: "CCCRP3333C", gstin: "29CCCRP3333C1Z3", licence_number: "SE-2020-0333", last_renewed: "2024-08-15", status: "Active" },
  { business_name: "Malnad Coffee Traders", owner_name: "Siddappa G", address: "15, Basavanagudi", pin_code: "560004", phone: "9604567890", pan: "DDDSG4444D", gstin: "29DDDSG4444D1Z4", licence_number: "SE-2021-0444", last_renewed: "2025-03-20", status: "Active" },
  { business_name: "Royal Furniture Mart", owner_name: "Fayaz Ahmed", address: "33, Shivajinagar", pin_code: "560051", phone: "9505678901", pan: "EEEFA5555E", gstin: "29EEEFA5555E1Z5", licence_number: "SE-2019-0555", last_renewed: "2024-02-28", status: "Dormant" },
  { business_name: "Shakti Printing Press", owner_name: "Gangadhar M", address: "7, Rajajinagar 1st Block", pin_code: "560010", phone: "9406789012", pan: "FFFGM6666F", gstin: "29FFFGM6666F1Z6", licence_number: "SE-2018-0666", last_renewed: "2023-06-15", status: "Dormant" },
  { business_name: "Vijayanagar Textiles", owner_name: "Padma Rani", address: "19, Vijayanagar", pin_code: "560040", phone: "9307890123", pan: "GGGPR7777G", gstin: "29GGGPR7777G1Z7", licence_number: "SE-2017-0777", last_renewed: "2022-11-30", status: "Closed" },
  { business_name: "Cauvery Auto Spares", owner_name: "Thimmaiah B", address: "44, Yeshwanthpur", pin_code: "560022", phone: "9208901234", pan: "HHHTB8888H", gstin: "29HHHTB8888H1Z8", licence_number: "SE-2023-0888", last_renewed: "2025-11-10", status: "Active" },
  { business_name: "Kaveri Medical Stores", owner_name: "Usha Rani", address: "2, Indiranagar", pin_code: "560038", phone: "9109012345", pan: "IIIUR9999I", gstin: "29IIIUR9999I1Z9", licence_number: "SE-2022-0999", last_renewed: "2025-04-18", status: "Active" },
  { business_name: "Mysore Silk Emporium", owner_name: "Chandra Shekar", address: "10, Mysore Road", pin_code: "560026", phone: "9000123456", pan: "JJJCS0000J", gstin: "29JJJCS0000J1Z0", licence_number: "SE-2021-1000", last_renewed: "2025-01-25", status: "Active" },
  { business_name: "Tungabhadra Paper Mills", owner_name: "Hanumanthappa K", address: "55, Peenya", pin_code: "560058", phone: "8901234567", pan: "KKKHK1111K", gstin: "29KKKHK1111K1Z1", licence_number: "SE-2016-1111", last_renewed: "2022-05-10", status: "Closed" },
  { business_name: "Krishna Trading Company", owner_name: "Balakrishna N", address: "27, Koramangala", pin_code: "560034", phone: "8802345678", pan: "LLLBN2222L", gstin: "29LLLBN2222L1Z2", licence_number: "SE-2023-1222", last_renewed: "2025-09-30", status: "Active" },
];

// Unique KSPCB only businesses
const kspcbOnlyBusinesses: Omit<KSPCBRecord, 'record_id' | 'department'>[] = [
  { business_name: "Bharath Dyeing Works", owner_name: "Shankar Naik", address: "67, KIADB, Doddaballapur", pin_code: "561203", phone: "9776543210", pan: "MMMSN3333M", consent_number: "KSPCB-C-2020-0222", last_filing_date: "2025-07-15", inspection_date: "2025-04-10" },
  { business_name: "Coastal Chemicals Mangalore", owner_name: "Dinesh Shetty", address: "12, Baikampady Industrial Area", pin_code: "575011", phone: "9667654321", pan: "NNNDS4444N", consent_number: "KSPCB-C-2019-0333", last_filing_date: "2024-12-20", inspection_date: "2024-10-05" },
  { business_name: "Davangere Cotton Mills", owner_name: "Basavaraj H", address: "45, Harihar Road, Davangere", pin_code: "577001", phone: "9558765432", pan: "OOOBH5555O", consent_number: "KSPCB-C-2018-0444", last_filing_date: "2024-08-30", inspection_date: "2024-06-15" },
  { business_name: "Eco Plastics Bangalore", owner_name: "Meena Kumari", address: "90, Bommasandra Jigani Link Road", pin_code: "560105", phone: "9449876543", pan: "PPPMK6666P", consent_number: "KSPCB-C-2022-0555", last_filing_date: "2025-10-05", inspection_date: "2025-08-20" },
  { business_name: "Green Earth Recycling", owner_name: "Vinay Kumar", address: "23, Mysore Industrial Area", pin_code: "570011", phone: "9330987654", pan: "QQQVK7777Q", consent_number: "KSPCB-C-2021-0666", last_filing_date: "2025-05-25", inspection_date: "2025-02-14" },
  { business_name: "Hassan Agro Processing", owner_name: "Revanasiddappa", address: "8, Belur Road, Hassan", pin_code: "573201", phone: "9221098765", pan: "RRRRS8888R", consent_number: "KSPCB-C-2020-0777", last_filing_date: "2024-11-10", inspection_date: "2024-09-22" },
  { business_name: "Shimoga Paper Products", owner_name: "Kavya R", address: "15, Bhadravathi Road", pin_code: "577201", phone: "9112109876", pan: "SSSKR9999S", consent_number: "KSPCB-C-2019-0888", last_filing_date: "2024-07-05", inspection_date: "2024-05-18" },
];

// Unique Factory only businesses
const factoryOnlyBusinesses: Omit<FactoryRecord, 'record_id' | 'department'>[] = [
  { business_name: "Belgaum Foundry Works", owner_name: "Prabhu Desai", address: "56, Udyambag, Belgaum", pin_code: "590006", phone: "9665432109", gstin: "29QQQPD1111R1Z3", factory_licence: "FL-2018-0678", last_inspection: "2024-03-15", sector: "Manufacturing" },
  { business_name: "Dharwad Engineering Co", owner_name: "Mallikarjun S", address: "34, Industrial Estate, Dharwad", pin_code: "580001", phone: "9554321098", gstin: "29RRRMS2222S1Z4", factory_licence: "FL-2020-0789", last_inspection: "2025-02-20", sector: "Manufacturing" },
  { business_name: "Gulbarga Cement Products", owner_name: "Rajanna G", address: "12, Sedam Road, Kalaburagi", pin_code: "585101", phone: "9443210987", gstin: "29SSSRG3333T1Z5", factory_licence: "FL-2017-0890", last_inspection: "2023-11-10", sector: "Construction" },
  { business_name: "Raichur Mining Equipment", owner_name: "Vijaykumar B", address: "78, Industrial Area, Raichur", pin_code: "584101", phone: "9332109876", gstin: "29TTTVB4444U1Z6", factory_licence: "FL-2019-0901", last_inspection: "2024-08-25", sector: "Mining" },
  { business_name: "Tumkur Leather Industries", owner_name: "Khader Basha", address: "23, Hebbal, Tumkur", pin_code: "572101", phone: "9221098765", gstin: "29UUUKB5555V1Z7", factory_licence: "FL-2021-0123", last_inspection: "2025-04-05", sector: "Manufacturing" },
  { business_name: "Udupi Seafood Processing", owner_name: "Dinesh Shetty", address: "45, Malpe Road, Udupi", pin_code: "576101", phone: "9110987654", gstin: "29VVVDS6666W1Z8", factory_licence: "FL-2022-0234", last_inspection: "2025-09-12", sector: "Food Processing" },
  { business_name: "Chitradurga Steel Rolling", owner_name: "Mohan Reddy", address: "67, Hospet Road, Chitradurga", pin_code: "577501", phone: "9009876543", gstin: "29WWW MR7777X1Z9", factory_licence: "FL-2016-0345", last_inspection: "2023-06-20", sector: "Manufacturing" },
];

export function generateMockData() {
  const shopRecords: ShopRecord[] = [];
  const kspcbRecords: KSPCBRecord[] = [];
  const factoryRecords: FactoryRecord[] = [];

  // Generate shared businesses
  sharedBusinesses.forEach((biz, i) => {
    if (biz.se) {
      shopRecords.push({ record_id: `SE-${String(i + 1).padStart(4, '0')}`, department: 'Shop & Establishment', ...biz.se });
    }
    if (biz.kspcb) {
      kspcbRecords.push({ record_id: `KSPCB-${String(i + 1).padStart(4, '0')}`, department: 'KSPCB', ...biz.kspcb });
    }
    if (biz.factory) {
      factoryRecords.push({ record_id: `FAC-${String(i + 1).padStart(4, '0')}`, department: 'Factories', ...biz.factory });
    }
  });

  // Generate unique S&E businesses
  seOnlyBusinesses.forEach((biz, i) => {
    shopRecords.push({ record_id: `SE-${String(i + 9).padStart(4, '0')}`, department: 'Shop & Establishment', ...biz });
  });

  // Generate unique KSPCB businesses
  kspcbOnlyBusinesses.forEach((biz, i) => {
    kspcbRecords.push({ record_id: `KSPCB-${String(i + 9).padStart(4, '0')}`, department: 'KSPCB', ...biz });
  });

  // Generate unique Factory businesses
  factoryOnlyBusinesses.forEach((biz, i) => {
    factoryRecords.push({ record_id: `FAC-${String(i + 9).padStart(4, '0')}`, department: 'Factories', ...biz });
  });

  return { shopRecords, kspcbRecords, factoryRecords };
}

export function generateEventStream(): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let eventId = 1;

  const eventTemplates = [
    { type: "Licence Renewal", departments: ["Shop & Establishment"] },
    { type: "Consent Filing", departments: ["KSPCB"] },
    { type: "Inspection Completed", departments: ["KSPCB", "Factories"] },
    { type: "Utility Consumption", departments: ["Shop & Establishment", "Factories"] },
    { type: "Compliance Filing", departments: ["KSPCB"] },
    { type: "Factory Inspection", departments: ["Factories"] },
    { type: "Renewal Application", departments: ["Shop & Establishment"] },
  ];

  const { shopRecords, kspcbRecords, factoryRecords } = generateMockData();
  const allRecords = [...shopRecords, ...kspcbRecords, ...factoryRecords];

  // Generate events for each record over the last 24 months
  // Use a seeded approach for consistent, realistic distribution
  allRecords.forEach((record, recordIndex) => {
    const isClosed = 'status' in record && record.status === 'Closed';
    const isDormant = 'status' in record && record.status === 'Dormant';
    const isFactory = record.department === 'Factories';
    const isKSPCB = record.department === 'KSPCB';

    // Determine event profile based on record status and type
    let numEvents: number;
    let monthRange: (j: number) => number;

    if (isClosed) {
      numEvents = Math.floor(Math.random() * 2) + 1;
      monthRange = () => 13 + Math.floor(Math.random() * 12);
    } else if (isDormant) {
      numEvents = Math.floor(Math.random() * 3) + 1;
      monthRange = (j) => j === 0 ? 7 + Math.floor(Math.random() * 5) : Math.floor(Math.random() * 24);
    } else if (isFactory && recordIndex % 3 === 0) {
      // Some factories with no recent inspections (for the demo query)
      numEvents = Math.floor(Math.random() * 2) + 1;
      monthRange = () => 19 + Math.floor(Math.random() * 6); // 19-24 months ago
    } else {
      numEvents = Math.floor(Math.random() * 3) + 2;
      monthRange = (j) => j === 0 ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 18);
    }

    for (let j = 0; j < numEvents; j++) {
      const monthsAgo = monthRange(j);
      const date = new Date(2026, 4 - monthsAgo, Math.floor(Math.random() * 28) + 1);
      const dateStr = date.toISOString().split('T')[0];

      // Pick a relevant event type for the department
      const relevantTemplates = eventTemplates.filter(t => t.departments.includes(record.department));
      const template = relevantTemplates.length > 0
        ? relevantTemplates[Math.floor(Math.random() * relevantTemplates.length)]
        : eventTemplates[Math.floor(Math.random() * eventTemplates.length)];

      events.push({
        event_id: `EVT-${String(eventId++).padStart(5, '0')}`,
        ubid: null,
        record_id: record.record_id,
        department: record.department,
        event_type: template.type,
        event_date: dateStr,
        details: `${template.type} for ${record.business_name}`,
      });
    }
  });

  // Sort by date descending
  events.sort((a, b) => b.event_date.localeCompare(a.event_date));
  return events;
}
