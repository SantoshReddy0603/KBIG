import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Building2, RefreshCw, CheckCircle2, AlertCircle, Clock, PlusCircle, X } from 'lucide-react';

type DeptName = 'Shop & Establishment' | 'KSPCB' | 'Factories';

const DEPT_FIELDS: Record<DeptName, { key: string; label: string; required?: boolean; type?: string; options?: string[] }[]> = {
  'Shop & Establishment': [
    { key: 'business_name', label: 'Business Name', required: true },
    { key: 'owner_name', label: 'Owner / Proprietor Name', required: true },
    { key: 'address', label: 'Address', required: true },
    { key: 'pin_code', label: 'PIN Code', required: true },
    { key: 'phone', label: 'Phone Number' },
    { key: 'pan', label: 'PAN' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'licence_number', label: 'Licence Number' },
    { key: 'last_renewed', label: 'Last Renewed Date', type: 'date' },
    { key: 'status', label: 'Status', options: ['Active', 'Dormant', 'Closed'] },
  ],
  'KSPCB': [
    { key: 'business_name', label: 'Business Name', required: true },
    { key: 'owner_name', label: 'Owner / Proprietor Name', required: true },
    { key: 'address', label: 'Address', required: true },
    { key: 'pin_code', label: 'PIN Code', required: true },
    { key: 'phone', label: 'Phone Number' },
    { key: 'pan', label: 'PAN' },
    { key: 'consent_number', label: 'Consent Number' },
    { key: 'last_filing_date', label: 'Last Filing Date', type: 'date' },
    { key: 'inspection_date', label: 'Last Inspection Date', type: 'date' },
  ],
  'Factories': [
    { key: 'business_name', label: 'Business Name', required: true },
    { key: 'owner_name', label: 'Owner / Proprietor Name', required: true },
    { key: 'address', label: 'Address', required: true },
    { key: 'pin_code', label: 'PIN Code', required: true },
    { key: 'phone', label: 'Phone Number' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'factory_licence', label: 'Factory Licence Number' },
    { key: 'last_inspection', label: 'Last Inspection Date', type: 'date' },
    { key: 'sector', label: 'Sector', options: ['Manufacturing', 'Food Processing', 'Agriculture', 'Construction', 'Mining', 'Textiles', 'Chemicals', 'Electronics'] },
  ],
};

interface Department {
  name: string;
  total_records: number;
  last_synced: string;
  match_rate: number;
  auto_linked: number;
  in_review: number;
}

const DEPT_COLORS: Record<string, string> = {
  'Shop & Establishment': 'bg-blue-600',
  'KSPCB': 'bg-emerald-600',
  'Factories': 'bg-amber-600',
};

const DEPT_ICONS: Record<string, string> = {
  'Shop & Establishment': 'SE',
  'KSPCB': 'KS',
  'Factories': 'FA',
};

export default function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<DeptName | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<Department[]>('/departments');
      setDepartments(data);
    } catch (e) {
      console.error('Failed to load departments', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const syncDepartment = async (name: string) => {
    setSyncing(name);
    try {
      await fetchApi('/match', { method: 'POST' });
      await fetchApi('/classify', { method: 'POST' });
      await loadData();
      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    } catch (e) {
      console.error('Sync failed', e);
    }
    setSyncing(null);
  };

  const openAddModal = (dept: DeptName) => {
    setForm({});
    setSuccessMsg('');
    setErrorMsg('');
    setAddModal(dept);
  };

  const closeModal = () => {
    setAddModal(null);
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleSubmit = async () => {
    if (!addModal) return;
    const fields = DEPT_FIELDS[addModal];
    const required = fields.filter(f => f.required);
    for (const f of required) {
      if (!form[f.key]?.trim()) {
        setErrorMsg(`"${f.label}" is required.`);
        return;
      }
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const result = await fetchApi<{ success: boolean; record_id: string; message: string }>('/records', {
        method: 'POST',
        body: JSON.stringify({ department: addModal, ...form }),
      });
      setSuccessMsg(`✅ Record added! ID: ${result.record_id}. Matching engine re-run automatically.`);
      setForm({});
      await loadData();
      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    } catch (e: any) {
      setErrorMsg('Failed to add record. Please try again.');
    }
    setSubmitting(false);
  };

  const deptColors = DEPT_COLORS;
  const deptIcons = DEPT_ICONS;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Connected Departments</h2>
          <p className="text-sm text-slate-500 mt-1">Data ingestion status and match rates per department</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading departments...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map(dept => (
            <div key={dept.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Card header */}
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${deptColors[dept.name] || 'bg-slate-600'} flex items-center justify-center text-white font-bold text-sm`}>
                      {deptIcons[dept.name] || '??'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{dept.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        Last synced: {new Date(dept.last_synced).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{dept.total_records}</p>
                    <p className="text-xs text-slate-500">Total Records</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{dept.match_rate}%</p>
                    <p className="text-xs text-slate-500">Match Rate</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      Auto-Linked
                    </span>
                    <span className="font-semibold text-slate-900">{dept.auto_linked}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <AlertCircle size={14} className="text-amber-500" />
                      In Review
                    </span>
                    <span className="font-semibold text-slate-900">{dept.in_review}</span>
                  </div>
                </div>

                {/* Match rate bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Auto-Link Progress</span>
                    <span>{dept.match_rate}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${dept.match_rate}%` }} />
                  </div>
                </div>
              </div>

              {/* Sync button */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => syncDepartment(dept.name)}
                  disabled={syncing === dept.name}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={14} className={syncing === dept.name ? 'animate-spin' : ''} />
                  {syncing === dept.name ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ingestion methods info */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Supported Ingestion Methods</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { method: 'REST API Polling', desc: 'Scheduled pulls via Airflow DAGs for systems with APIs', icon: Building2 },
            { method: 'CSV / Excel Upload', desc: 'Drag-and-drop ingestion portal for legacy exports', icon: Building2 },
            { method: 'Batch Exports', desc: 'Nightly sync from SFTP / shared drives, configurable per dept', icon: Building2 },
          ].map(m => (
            <div key={m.method} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h4 className="text-sm font-medium text-slate-900 mb-1">{m.method}</h4>
              <p className="text-xs text-slate-500">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}