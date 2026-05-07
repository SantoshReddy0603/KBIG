import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Clock, User, GitMerge, XCircle, GitBranch, Pause, Eye, X, RefreshCw } from 'lucide-react';
import { useRole } from '../context/RoleContext';

interface AuditEntry {
  timestamp: string;
  reviewer_id: string;
  pair_id: string;
  action_type?: 'review' | 'sync' | 'threshold' | 'event_review' | 'event' | 'auto_link' | 'review_queue' | 'manual_record' | 'csv_upload' | 'system';
  decision: string;
  record_a: { record_id: string; department: string; business_name: string } | null;
  record_b: { record_id: string; department: string; business_name: string } | null;
  confidence: number;
  signals?: Record<string, number> | null;
  assigned_ubid?: string | null;
  details?: {
    source?: 'AUTO_SYNC' | 'MANUAL_SYNC';
    record_a_id?: string;
    record_b_id?: string;
    record_a_name?: string;
    record_b_name?: string;
    record_a_label?: string;
    record_b_label?: string;
    departments?: string[];
    signals?: Record<string, number> | null;
    final_confidence?: number;
    assigned_ubid?: string | null;
    records_added?: Array<{
      record_id: string;
      department: string;
      business_name: string;
      ubid: string | null;
      source: 'AUTO_SYNC' | 'MANUAL_SYNC';
      synced_at: string;
    }>;
    records_added_count?: number;
    skipped_records?: Array<{
      row?: number;
      department?: string;
      source_record_id?: string;
      business_name?: string;
      reason?: string;
      errors?: string[];
    }>;
    skipped_count?: number;
    auto_linked_created?: number;
    review_queue_created?: number;
    ubids_updated?: string[];
    event?: {
      event_id: string;
      event_type: string;
      department: string;
      details: string;
      ubid: string | null;
    };
    notification?: {
      notification_id: string;
      business_name: string;
      message: string;
    } | null;
  };
}

function sourceLabel(source?: string) {
  if (source === 'AUTO_SYNC') return 'Auto Synced';
  if (source === 'MANUAL_SYNC') return 'Manual Sync';
  return 'Sync';
}

export default function AuditLog() {
  const { roleLabel, isAdmin } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!isAdmin) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchApi<AuditEntry[]>('/audit-log');
      setEntries(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setErrorMessage('');
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load audit log.');
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const decisionIcon = (entry: AuditEntry) => {
    if (entry.action_type === 'sync') return <RefreshCw size={16} className="text-blue-600" />;
    if (entry.action_type === 'auto_link') return <GitMerge size={16} className="text-emerald-600" />;
    if (entry.action_type === 'review_queue') return <Pause size={16} className="text-amber-600" />;
    if (entry.action_type === 'event') return <Clock size={16} className="text-blue-600" />;
    switch (entry.decision) {
      case 'approved': return <GitMerge size={16} className="text-emerald-600" />;
      case 'rejected': return <XCircle size={16} className="text-red-600" />;
      case 'split': return <GitBranch size={16} className="text-amber-600" />;
      default: return <Pause size={16} className="text-slate-500" />;
    }
  };

  const decisionBadge = (entry: AuditEntry) => {
    const label = entry.action_type === 'sync' ? sourceLabel(entry.details?.source) : entry.decision;
    const cls = entry.action_type === 'sync'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : entry.decision === 'approved'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : entry.decision === 'rejected'
          ? 'bg-red-50 text-red-700 border-red-200'
          : entry.decision === 'split'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-100 text-slate-700 border-slate-200';
    return <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${cls}`}>{decisionIcon(entry)}{label}</span>;
  };

  const confidence = (entry: AuditEntry) => entry.details?.final_confidence ?? entry.confidence ?? 0;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audit Log</h2>
          <p className="mt-1 text-sm text-slate-500">Trace reviewer and sync actions with record-level evidence.</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          Viewing as: {roleLabel}
        </span>
      </div>

      {!isAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Audit logs are available in Admin (KBIG) view.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {isAdmin && (loading ? (
        <div className="py-12 text-center text-slate-400">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Clock size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-700">No actions recorded yet</p>
          <p className="mt-1 text-sm text-slate-500">Reviewer and sync decisions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={`${entry.timestamp}-${entry.pair_id}-${i}`} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {decisionBadge(entry)}
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <User size={10} />
                      {entry.reviewer_id}
                    </span>
                  </div>
                  {entry.action_type === 'sync' ? (
                    <p className="text-sm text-slate-600">
                      {entry.details?.records_added_count ?? entry.details?.records_added?.length ?? 0} records imported,
                      {' '}{entry.details?.auto_linked_created || 0} auto-linked,
                      {' '}{entry.details?.skipped_count ?? entry.details?.skipped_records?.length ?? 0} skipped.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div>
                        <span className="text-xs text-slate-500">Record A:</span>
                        <span className="ml-1.5 font-mono text-xs text-blue-700">{entry.record_a?.record_id || 'Not Available'}</span>
                        <span className="ml-1 text-xs text-slate-700">{entry.record_a?.business_name || ''}</span>
                        <span className="ml-1 text-xs text-slate-400">({entry.record_a?.department || 'Not Available'})</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Record B:</span>
                        <span className="ml-1.5 font-mono text-xs text-blue-700">{entry.record_b?.record_id || 'Not Available'}</span>
                        <span className="ml-1 text-xs text-slate-700">{entry.record_b?.business_name || ''}</span>
                        <span className="ml-1 text-xs text-slate-400">({entry.record_b?.department || 'Not Available'})</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="space-y-1 text-right">
                    <p className="flex items-center justify-end gap-1 text-xs text-slate-500">
                      <Clock size={10} />
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                    {entry.action_type !== 'sync' && (
                      <p className="text-xs text-slate-500">
                        Confidence: <span className="font-mono font-semibold text-slate-700">{(confidence(entry) * 100).toFixed(1)}%</span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedEntry(entry)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={15} />
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedEntry(null)} />
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-900">Audit Details</h3>
                <p className="text-xs text-slate-500">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setSelectedEntry(null)} className="rounded-lg p-2 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {selectedEntry.action_type === 'sync' ? (
              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Source</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{sourceLabel(selectedEntry.details?.source)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Records Added</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.details?.records_added_count ?? selectedEntry.details?.records_added?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Skipped</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.details?.skipped_count ?? selectedEntry.details?.skipped_records?.length ?? 0}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold uppercase text-emerald-700">Auto-Linked</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900">{selectedEntry.details?.auto_linked_created || 0}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase text-amber-700">Review Queue</p>
                    <p className="mt-1 text-sm font-semibold text-amber-900">{selectedEntry.details?.review_queue_created || 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">UBIDs Updated</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.details?.ubids_updated?.length || 0}</p>
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-slate-800">Records Added</h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Record ID</th>
                          <th className="px-3 py-2 font-semibold">Department</th>
                          <th className="px-3 py-2 font-semibold">Business</th>
                          <th className="px-3 py-2 font-semibold">UBID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedEntry.details?.records_added || []).map(record => (
                          <tr key={record.record_id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-mono text-xs text-blue-700">{record.record_id}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{record.department}</td>
                            <td className="px-3 py-2 text-slate-900">{record.business_name}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">{record.ubid || 'Not Available'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(selectedEntry.details?.skipped_records?.length || 0) > 0 && (
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-800">Skipped Source Records</h4>
                    <div className="space-y-2">
                      {(selectedEntry.details?.skipped_records || []).map((record, index) => (
                        <div key={`${record.source_record_id || record.row || index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <p className="font-medium text-slate-900">{record.business_name || `Row ${record.row || index + 1}`}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {record.department || 'Not Available'} | {record.source_record_id || 'No source id'} | {record.reason || record.errors?.join(', ') || 'Skipped'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Record A</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-blue-700">{selectedEntry.details?.record_a_id || selectedEntry.record_a?.record_id || 'Not Available'}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedEntry.details?.record_a_name || selectedEntry.record_a?.business_name || 'Not Available'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Record B</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-blue-700">{selectedEntry.details?.record_b_id || selectedEntry.record_b?.record_id || 'Not Available'}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedEntry.details?.record_b_name || selectedEntry.record_b?.business_name || 'Not Available'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Departments</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{(selectedEntry.details?.departments || []).join(' + ') || 'Not Available'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Assigned UBID</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{selectedEntry.details?.assigned_ubid || selectedEntry.assigned_ubid || 'Not Available'}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase text-blue-700">Final Confidence</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-blue-900">{(confidence(selectedEntry) * 100).toFixed(1)}%</p>
                </div>

                {selectedEntry.details?.event && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <p className="text-xs font-semibold uppercase text-indigo-700">Event</p>
                    <p className="mt-1 text-sm font-semibold text-indigo-950">{selectedEntry.details.event.event_type}</p>
                    <p className="mt-1 text-xs text-indigo-800">{selectedEntry.details.event.department} | {selectedEntry.details.event.details}</p>
                    {selectedEntry.details.notification && (
                      <p className="mt-2 text-xs font-medium text-indigo-900">
                        Notification: {selectedEntry.details.notification.business_name} - {selectedEntry.details.notification.message}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-slate-800">Matching Signals</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(selectedEntry.details?.signals || selectedEntry.signals || {}).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        <span className="text-slate-600">{key.replace(/_/g, ' ')}</span>
                        <span className="font-mono font-semibold text-slate-900">{(Number(value) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
