import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { CheckCircle2, XCircle, GitBranch, Pause, ArrowRight, Clock } from 'lucide-react';

interface ReviewItem {
  pair_id: string;
  record_a: { record_id: string; department: string; business_name: string };
  record_b: { record_id: string; department: string; business_name: string };
  confidence: number;
  signals: {
    pan_match: number;
    gstin_match: number;
    name_similarity: number;
    pin_match: number;
    address_overlap: number;
    phone_match: number;
    owner_similarity: number;
    total: number;
  };
  outcome: string;
  reviewer_decision: string | null;
  record_a_full: any;
  record_b_full: any;
}

interface AuditEntry {
  timestamp: string;
  reviewer_id: string;
  pair_id: string;
  decision: string;
  record_a: any;
  record_b: any;
  confidence: number;
}

export default function ReviewerPortal() {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'audit'>('queue');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [queueData, auditData] = await Promise.all([
        fetchApi<ReviewItem[]>('/review-queue'),
        fetchApi<AuditEntry[]>('/audit-log'),
      ]);
      setQueue(queueData);
      setAuditLog(auditData);
    } catch (e) {
      console.error('Failed to load review data', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const submitDecision = async (pairId: string, decision: string) => {
    setActionLoading(pairId);
    try {
      await fetchApi(`/review/${encodeURIComponent(pairId)}`, {
        method: 'POST',
        body: JSON.stringify({ decision, reviewer_id: 'reviewer_001' }),
      });
      await loadData();
      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    } catch (e) {
      console.error('Decision failed', e);
    }
    setActionLoading(null);
  };

  const highlightDiff = (valA: string, valB: string, field: string) => {
    if (!valA || !valB) return { a: valA || '—', b: valB || '—', diff: true };
    const normA = valA.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normB = valB.toLowerCase().replace(/[^a-z0-9]/g, '');
    return { a: valA, b: valB, diff: normA !== normB };
  };

  const signalBar = (label: string, value: number, max: number) => (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 text-slate-600 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${value >= max * 0.8 ? 'bg-emerald-500' : value >= max * 0.4 ? 'bg-amber-500' : 'bg-slate-300'}`}
          style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-slate-700">{(value * 100).toFixed(0)}%</span>
    </div>
  );

  const fieldsToCompare = [
    { key: 'business_name', label: 'Business Name' },
    { key: 'owner_name', label: 'Owner Name' },
    { key: 'address', label: 'Address' },
    { key: 'pin_code', label: 'PIN Code' },
    { key: 'phone', label: 'Phone' },
    { key: 'pan', label: 'PAN' },
    { key: 'gstin', label: 'GSTIN' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Tab header */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('queue')}
          className={`text-sm font-medium pb-2 border-b-2 transition-colors ${activeTab === 'queue' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Review Queue ({queue.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`text-sm font-medium pb-2 border-b-2 transition-colors ${activeTab === 'audit' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Audit Log ({auditLog.length})
        </button>
      </div>

      {activeTab === 'queue' && (
        loading ? (
          <div className="text-center py-12 text-slate-400">Loading review queue...</div>
        ) : queue.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
            <p className="text-slate-700 font-medium">All clear!</p>
            <p className="text-sm text-slate-500 mt-1">No pending reviews at this time.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {queue.map(item => {
              const recA = item.record_a_full || {};
              const recB = item.record_b_full || {};
              return (
                <div key={item.pair_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono text-blue-700 font-medium">{item.record_a.record_id}</span>
                      <ArrowRight size={16} className="text-slate-400" />
                      <span className="font-mono text-blue-700 font-medium">{item.record_b.record_id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Confidence:</span>
                      <span className={`text-sm font-bold ${item.confidence >= 0.75 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {(item.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{item.record_a.department}</span>
                        <span className="font-mono text-xs text-slate-500">{item.record_a.record_id}</span>
                      </div>
                      <div className="space-y-2">
                        {fieldsToCompare.map(f => {
                          const { a, diff } = highlightDiff(String(recA[f.key] || ''), String(recB[f.key] || ''), f.key);
                          return (
                            <div key={f.key} className={`flex gap-2 text-xs ${diff ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                              <span className="text-slate-500 w-24 shrink-0">{f.label}</span>
                              <span className={`font-medium ${diff ? 'text-amber-800' : 'text-slate-900'}`}>{a || '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{item.record_b.department}</span>
                        <span className="font-mono text-xs text-slate-500">{item.record_b.record_id}</span>
                      </div>
                      <div className="space-y-2">
                        {fieldsToCompare.map(f => {
                          const { b, diff } = highlightDiff(String(recA[f.key] || ''), String(recB[f.key] || ''), f.key);
                          return (
                            <div key={f.key} className={`flex gap-2 text-xs ${diff ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                              <span className="text-slate-500 w-24 shrink-0">{f.label}</span>
                              <span className={`font-medium ${diff ? 'text-amber-800' : 'text-slate-900'}`}>{b || '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Signal breakdown */}
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 mb-3">Signal Breakdown</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {signalBar('PAN Match', item.signals.pan_match, 0.90)}
                      {signalBar('GSTIN Match', item.signals.gstin_match, 0.90)}
                      {signalBar('Name Similarity', item.signals.name_similarity, 0.65)}
                      {signalBar('PIN Match', item.signals.pin_match, 0.20)}
                      {signalBar('Address Overlap', item.signals.address_overlap, 0.40)}
                      {signalBar('Phone Match', item.signals.phone_match, 0.55)}
                      {signalBar('Owner Similarity', item.signals.owner_similarity, 0.45)}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap gap-3">
                    <button
                      onClick={() => submitDecision(item.pair_id, 'approved')}
                      disabled={actionLoading === item.pair_id}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 size={16} /> Approve Merge
                    </button>
                    <button
                      onClick={() => submitDecision(item.pair_id, 'rejected')}
                      disabled={actionLoading === item.pair_id}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                    <button
                      onClick={() => submitDecision(item.pair_id, 'split')}
                      disabled={actionLoading === item.pair_id}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      <GitBranch size={16} /> Split UBID
                    </button>
                    <button
                      onClick={() => submitDecision(item.pair_id, 'deferred')}
                      disabled={actionLoading === item.pair_id}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white text-sm font-medium rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors"
                    >
                      <Pause size={16} /> Defer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {auditLog.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No reviewer actions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Timestamp</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Reviewer</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Record A</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Record B</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Decision</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <Clock size={12} className="inline mr-1" />
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{entry.reviewer_id}</td>
                      <td className="px-4 py-3 text-xs font-mono">{entry.record_a.record_id}</td>
                      <td className="px-4 py-3 text-xs font-mono">{entry.record_b.record_id}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                          entry.decision === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                          entry.decision === 'rejected' ? 'bg-red-50 text-red-700' :
                          entry.decision === 'split' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {entry.decision}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{(entry.confidence * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
