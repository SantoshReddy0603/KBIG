import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { fetchApi } from '../hooks/useApi';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

type SyncSource = 'AUTO_SYNC' | 'MANUAL_SYNC';

interface SyncedRecord {
  record_id: string;
  business_name: string;
  ubid: string | null;
  synced_at: string;
  source: SyncSource;
}

type SyncMap = Record<string, SyncedRecord[]>;

interface SyncResponse {
  source: SyncSource;
  added: number;
  skipped: number;
  records: Array<{ record_id: string; department: string; business_name: string; source: SyncSource; synced_at: string }>;
}

const DEPARTMENTS = ['Shop & Establishment', 'Factories', 'KSPCB'];

function sourceBadge(source: SyncSource) {
  const isAuto = source === 'AUTO_SYNC';
  const cls = isAuto
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : 'border-blue-100 bg-blue-50 text-blue-700';
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {isAuto ? 'Auto Synced' : 'Manual Sync'}
    </span>
  );
}

export default function Sync() {
  const { isAdmin, roleLabel } = useRole();
  const [syncMap, setSyncMap] = useState<SyncMap>({});
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await fetchApi<SyncMap>('/sync/last');
      setSyncMap(data);
      setErrorMessage('');
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load sync records.');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const runSync = async () => {
    setSyncing(true);
    setErrorMessage('');
    try {
      const response = await fetchApi<SyncResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify({ source: 'MANUAL_SYNC' }),
      });
      setLastResult(response);
      await loadData();
      notifyDataChanged();
      showToast('success', `Manual sync added ${response.added} records and skipped ${response.skipped}.`);
    } catch (error: any) {
      const message = error.message || 'Sync failed.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setSyncing(false);
  };

  const visibleDepartments = useMemo(() => (
    DEPARTMENTS.filter(department => syncMap[department] !== undefined || isAdmin)
  ), [isAdmin, syncMap]);

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Sync controls are available in Admin (KBIG) view.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sync Operations</h2>
          <p className="mt-1 text-sm text-slate-500">Run department ingestion and inspect source-tagged sync records.</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          Viewing as: {roleLabel}
        </span>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Run Manual Sync</p>
            <p className="mt-1 text-sm text-slate-500">Runs department ingestion and immediately recomputes UBID matching.</p>
          </div>
          <RotateCw size={20} className={syncing ? 'animate-spin text-blue-600' : 'text-slate-400'} />
        </button>
      </div>

      {lastResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-semibold">Manual sync completed.</span>
          <span className="ml-2">{lastResult.added} records added, {lastResult.skipped} skipped, and matching refreshed.</span>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">Last Synced Records by Department</h3>
          <span className="rounded border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700">Source tagged</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {visibleDepartments.map(department => {
            const records = syncMap[department] || [];
            return (
              <div key={department} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-800">{department}</h4>
                  <span className="text-xs text-slate-400">{records.length} shown</span>
                </div>
                {records.length === 0 ? (
                  <p className="text-xs text-slate-400">No synced records found</p>
                ) : (
                  <div className="space-y-3">
                    {records.map(record => (
                      <div key={`${record.record_id}-${record.synced_at}`} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs font-semibold text-blue-700">{record.record_id}</span>
                          {sourceBadge(record.source)}
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{record.business_name || 'Not Available'}</p>
                        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                          <p className="font-mono">{record.ubid || 'Not Available'}</p>
                          <p>{new Date(record.synced_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
