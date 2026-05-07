import { FormEvent, useEffect, useState } from 'react';
import * as Papa from 'papaparse';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { fetchApi } from '../hooks/useApi';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

interface BulkUploadResponse {
  total_rows: number;
  inserted_rows: number;
  skipped_rows: number;
  added: number;
  ignored: number;
  rejected_rows: Array<{ row: number; errors: string[] }>;
}

function departmentValue(department: string | null) {
  if (department === 'Shop & Establishment') return 'SE';
  if (department === 'Factories') return 'FACTORY';
  if (department === 'KSPCB') return 'KSPCB';
  return 'SE';
}

function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: result => {
        const rows = result.data.filter(row =>
          Object.values(row).some(value => String(value ?? '').trim())
        );
        resolve(rows);
      },
      error: error => reject(error),
    });
  });
}

export default function UploadCsv() {
  const { roleDepartment } = useRole();
  const [department, setDepartment] = useState('SE');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (roleDepartment) setDepartment(departmentValue(roleDepartment));
  }, [roleDepartment]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setResult(null);
    setErrorMessage('');

    if (!file) {
      setErrorMessage('Choose a CSV file before uploading.');
      return;
    }

    setUploading(true);
    try {
      const rows = await parseCsv(file);
      if (!rows.length) {
        throw new Error('The CSV did not contain any usable rows.');
      }

      const response = await fetchApi<BulkUploadResponse>('/records/bulk', {
        method: 'POST',
        body: JSON.stringify({ department, records: rows }),
      });

      setResult(response);
      notifyDataChanged();
      showToast('success', `${response.inserted_rows} records inserted. ${response.skipped_rows} rows skipped.`);
    } catch (error: any) {
      const message = error.message || 'CSV upload failed.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setUploading(false);
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Upload CSV</h2>
          <p className="mt-1 text-sm text-slate-500">Bulk add department records and refresh matching automatically.</p>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase text-slate-500">Department</span>
              <select
                value={department}
                onChange={event => setDepartment(event.target.value)}
                disabled={Boolean(roleDepartment)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SE">SE</option>
                <option value="KSPCB">KSPCB</option>
                <option value="FACTORY">FACTORY</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase text-slate-500">CSV File</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={event => setFile(event.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-slate-500" />
              <div className="min-w-0 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Accepted columns</p>
                <p className="mt-1">business_name and address are required. owner_name, pin_code, phone, pan, and gstin are optional.</p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-semibold">Upload summary: {result.total_rows} total rows, {result.inserted_rows} inserted, {result.skipped_rows} skipped.</p>
              {result.rejected_rows.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  {result.rejected_rows.slice(0, 5).map(row => (
                    <p key={row.row}>Row {row.row}: {row.errors.join(', ')}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={16} className={uploading ? 'animate-pulse' : ''} />
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
