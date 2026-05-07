import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { fetchApi } from '../hooks/useApi';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

interface AddRecordResponse {
  record_id: string;
  mapping: { ubid: string | null };
}

const INITIAL_FORM = {
  department: 'SE',
  business_name: '',
  owner_name: '',
  address: '',
  pin_code: '',
  phone: '',
  pan: '',
  gstin: '',
};

function departmentValue(department: string | null) {
  if (department === 'Shop & Establishment') return 'SE';
  if (department === 'Factories') return 'FACTORY';
  if (department === 'KSPCB') return 'KSPCB';
  return 'SE';
}

const FIELDS = [
  { key: 'business_name', label: 'Business Name' },
  { key: 'owner_name', label: 'Owner Name' },
  { key: 'address', label: 'Address', wide: true },
  { key: 'pin_code', label: 'PIN Code' },
  { key: 'phone', label: 'Phone' },
  { key: 'pan', label: 'PAN' },
  { key: 'gstin', label: 'GSTIN' },
] as const;

export default function AddRecord() {
  const navigate = useNavigate();
  const { roleDepartment } = useRole();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateField = (key: keyof typeof INITIAL_FORM, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (roleDepartment) {
      setForm(current => ({ ...current, department: departmentValue(roleDepartment) }));
    }
  }, [roleDepartment]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.business_name.trim()) nextErrors.business_name = 'Required';
    if (!form.address.trim()) nextErrors.address = 'Required';

    if (form.pin_code && !/^\d{6}$/.test(form.pin_code)) {
      nextErrors.pin_code = 'Enter a 6 digit PIN';
    }
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) {
      nextErrors.phone = 'Enter at least 10 digits';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await fetchApi<AddRecordResponse>('/records', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notifyDataChanged();
      showToast('success', `Record ${result.record_id} added and mapped to ${result.mapping.ubid || 'a new UBID'}.`);
      navigate('/dashboard');
    } catch (error: any) {
      const message = error.message || 'Failed to add record.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Add Record</h2>
            <p className="mt-1 text-sm text-slate-500">Create a department record and recompute UBID matching immediately.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase text-slate-500">Department</span>
              <select
                value={form.department}
                onChange={event => updateField('department', event.target.value)}
                disabled={Boolean(roleDepartment)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.department ? 'border-red-300' : 'border-slate-200'}`}
              >
                <option value="SE">SE</option>
                <option value="KSPCB">KSPCB</option>
                <option value="FACTORY">FACTORY</option>
              </select>
              {errors.department && <span className="text-xs text-red-600">{errors.department}</span>}
            </label>

            {FIELDS.map(field => {
              const isWide = 'wide' in field && field.wide;
              return (
              <label key={field.key} className={`space-y-1.5 ${isWide ? 'md:col-span-2' : ''}`}>
                <span className="text-xs font-semibold uppercase text-slate-500">{field.label}</span>
                <input
                  value={form[field.key]}
                  onChange={event => updateField(field.key, event.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors[field.key] ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors[field.key] && <span className="text-xs text-red-600">{errors[field.key]}</span>}
              </label>
              );
            })}
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} />
              {submitting ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
