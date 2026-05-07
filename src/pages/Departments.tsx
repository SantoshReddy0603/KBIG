import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Building2, RefreshCw, CheckCircle2, AlertCircle, Clock, PlusCircle, X } from 'lucide-react';
import { useRole } from '../context/RoleContext';

type DeptName = 'Shop & Establishment' | 'KSPCB' | 'Factories';

const DEPT_FIELDS: Record<
  DeptName,
  { key: string; label: string; required?: boolean; type?: string; options?: string[] }[]
> = {
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
  KSPCB: [
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
  Factories: [
    { key: 'business_name', label: 'Business Name', required: true },
    { key: 'owner_name', label: 'Owner / Proprietor Name', required: true },
    { key: 'address', label: 'Address', required: true },
    { key: 'pin_code', label: 'PIN Code', required: true },
    { key: 'phone', label: 'Phone Number' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'factory_licence', label: 'Factory Licence Number' },
    { key: 'last_inspection', label: 'Last Inspection Date', type: 'date' },
    {
      key: 'sector',
      label: 'Sector',
      options: [
        'Manufacturing',
        'Food Processing',
        'Agriculture',
        'Construction',
        'Mining',
        'Textiles',
        'Chemicals',
        'Electronics',
      ],
    },
  ],
};

interface Department {
  name: string;
  total_records: number;
  linked_records: number;
  last_synced: string | null;
  match_rate: number;
  auto_linked: number;
  manually_linked: number;
  in_review: number;
}

const DEPT_COLORS: Record<string, string> = {
  'Shop & Establishment': 'bg-blue-600',
  KSPCB: 'bg-emerald-600',
  Factories: 'bg-amber-600',
};

const DEPT_ICONS: Record<string, string> = {
  'Shop & Establishment': 'SE',
  KSPCB: 'KS',
  Factories: 'FA',
};

function clampedPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function Departments() {
  const { role } = useRole();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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
      setErrorMessage('');
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load departments.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();

    window.addEventListener('kbig-data-changed', handler);

    return () => {
      window.removeEventListener('kbig-data-changed', handler);
    };
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
    const required = fields.filter((f) => f.required);

    for (const f of required) {
      if (!form[f.key]?.trim()) {
        setErrorMsg(`"${f.label}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const result = await fetchApi<{
        success: boolean;
        record_id: string;
        message: string;
      }>('/records', {
        method: 'POST',
        body: JSON.stringify({
          department: addModal,
          ...form,
        }),
      });

      setSuccessMsg(
        `✅ Record added! ID: ${result.record_id}. Matching engine re-run automatically.`,
      );

      setForm({});

      await loadData();

      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    } catch (e: any) {
      setErrorMsg('Failed to add record. Please try again.');
    }

    setSubmitting(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Connected Departments
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Live record counts, review load, and sync status.
          </p>
        </div>

        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          Viewing as: {role}
        </span>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          Loading departments...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((department) => (
            <div
              key={department.name}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg ${
                        DEPT_COLORS[department.name] || 'bg-slate-600'
                      } flex items-center justify-center text-white font-bold text-sm`}
                    >
                      {DEPT_ICONS[department.name] || 'DP'}
                    </div>

                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {department.name}
                      </h3>

                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        Last synced:{' '}
                        {department.last_synced
                          ? new Date(
                              department.last_synced,
                            ).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>

                  <Building2 size={18} className="text-slate-300" />
                </div>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {department.total_records}
                    </p>

                    <p className="text-xs text-slate-500">Total Records</p>
                  </div>

                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {clampedPercent(department.match_rate)}%
                    </p>

                    <p className="text-xs text-slate-500">UBID Coverage</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-500"
                      />
                      Auto-Linked
                    </span>

                    <span className="font-semibold text-slate-900">
                      {department.auto_linked}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 size={14} className="text-blue-500" />
                      Review-Linked
                    </span>

                    <span className="font-semibold text-slate-900">
                      {department.manually_linked}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <AlertCircle size={14} className="text-amber-500" />
                      In Review
                    </span>

                    <span className="font-semibold text-slate-900">
                      {department.in_review}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>UBID Coverage</span>

                    <span>
                      {department.linked_records}/
                      {department.total_records}
                    </span>
                  </div>

                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{
                        width: `${clampedPercent(department.match_rate)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => syncDepartment(department.name)}
                    disabled={syncing === department.name}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw
                      size={14}
                      className={
                        syncing === department.name ? 'animate-spin' : ''
                      }
                    />
                    Sync
                  </button>

                  <button
                    onClick={() =>
                      openAddModal(department.name as DeptName)
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <PlusCircle size={14} />
                    Add Record
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Add Record — {addModal}
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  Create a new department business record.
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
              {successMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DEPT_FIELDS[addModal].map((field) => (
                  <div
                    key={field.key}
                    className={field.key === 'address' ? 'md:col-span-2' : ''}
                  >
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>

                    {field.options ? (
                      <select
                        value={form[field.key] || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [field.key]: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="">Select</option>

                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || 'text'}
                        value={form[field.key] || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [field.key]: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {submitting ? 'Submitting...' : 'Add Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}