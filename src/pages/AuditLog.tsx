import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Clock, User, GitMerge, XCircle, GitBranch, Pause } from 'lucide-react';

interface AuditEntry {
  timestamp: string;
  reviewer_id: string;
  pair_id: string;
  decision: string;
  record_a: { record_id: string; department: string; business_name: string };
  record_b: { record_id: string; department: string; business_name: string };
  confidence: number;
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<AuditEntry[]>('/audit-log');
      setEntries(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e) {
      console.error('Failed to load audit log', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const decisionIcon = (decision: string) => {
    switch (decision) {
      case 'approved': return <GitMerge size={16} className="text-emerald-600" />;
      case 'rejected': return <XCircle size={16} className="text-red-600" />;
      case 'split': return <GitBranch size={16} className="text-amber-600" />;
      default: return <Pause size={16} className="text-slate-500" />;
    }
  };

  const decisionBadge = (decision: string) => {
    const cls = decision === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : decision === 'rejected'
        ? 'bg-red-50 text-red-700 border-red-200'
        : decision === 'split'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-100 text-slate-700 border-slate-200';
    return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border ${cls}`}>{decisionIcon(decision)}{decision}</span>;
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Audit Log</h2>
        <p className="text-sm text-slate-500 mt-1">Complete record of all reviewer actions with timestamps</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Clock size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-700 font-medium">No actions recorded yet</p>
          <p className="text-sm text-slate-500 mt-1">Reviewer decisions will appear here with full audit details.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {decisionBadge(entry.decision)}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <User size={10} />
                      {entry.reviewer_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-xs text-slate-500">Record A:</span>
                      <span className="ml-1.5 font-mono text-xs text-blue-700">{entry.record_a.record_id}</span>
                      <span className="ml-1 text-xs text-slate-400">({entry.record_a.department})</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Record B:</span>
                      <span className="ml-1.5 font-mono text-xs text-blue-700">{entry.record_b.record_id}</span>
                      <span className="ml-1 text-xs text-slate-400">({entry.record_b.department})</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                    <Clock size={10} />
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    Confidence: <span className="font-mono font-semibold text-slate-700">{(entry.confidence * 100).toFixed(1)}%</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
