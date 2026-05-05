import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Search, Filter, AlertTriangle, Building2, Clock, XCircle, CheckCircle2, Eye, X, AlertCircle, Network } from 'lucide-react';

interface UBID {
  ubid: string;
  primary_name: string;
  status: 'Active' | 'Dormant' | 'Closed';
  source_departments: string[];
  confidence: number;
  last_event_date: string | null;
  last_event_type: string | null;
  evidence_count: number;
  sector: string | null;
  pin_code: string;
  linked_records: Array<{ record_id: string; department: string; business_name: string }>;
}

interface UBIDDetail extends UBID {
  linked_records: Array<{ record_id: string; department: string; business_name: string; raw?: any }>;
  match_results: any[];
  events: any[];
}

export default function Dashboard() {
  const [ubids, setUbids] = useState<UBID[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pinFilter, setPinFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [factoriesQuery, setFactoriesQuery] = useState(false);
  const [factoriesResults, setFactoriesResults] = useState<any[]>([]);
  const [selectedUbid, setSelectedUbid] = useState<UBIDDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingReviews, setPendingReviews] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ubidData, reviewData] = await Promise.all([
        fetchApi<UBID[]>('/ubids'),
        fetchApi<any[]>('/review-queue'),
      ]);
      setUbids(ubidData);
      setPendingReviews(reviewData.length);
    } catch (e) {
      console.error('Failed to load UBIDs', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const runFactoriesQuery = async () => {
    if (factoriesQuery) {
      setFactoriesQuery(false);
      setFactoriesResults([]);
      return;
    }
    try {
      const data = await fetchApi<any[]>('/query/factories-no-inspection');
      setFactoriesResults(data);
      setFactoriesQuery(true);
    } catch (e) {
      console.error('Query failed', e);
    }
  };

  const openDetail = async (ubid: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchApi<UBIDDetail>(`/ubids/${encodeURIComponent(ubid)}`);
      setSelectedUbid(data);
    } catch (e) {
      console.error('Failed to load detail', e);
    }
    setDetailLoading(false);
  };

  const stats = {
    total: ubids.length,
    active: ubids.filter(u => u.status === 'Active').length,
    dormant: ubids.filter(u => u.status === 'Dormant').length,
    closed: ubids.filter(u => u.status === 'Closed').length,
    pendingReviews,
    departmentsConnected: new Set(ubids.flatMap(u => u.source_departments)).size,
  };

  const sectors = [...new Set(ubids.map(u => u.sector).filter(Boolean))].sort() as string[];
  const departments = [...new Set(ubids.flatMap(u => u.source_departments))].sort();

  const filtered = ubids.filter(u => {
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (pinFilter && !u.pin_code.startsWith(pinFilter)) return false;
    if (sectorFilter !== 'all' && u.sector !== sectorFilter) return false;
    if (deptFilter !== 'all' && !u.source_departments.includes(deptFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      return u.ubid.toLowerCase().includes(s) || u.primary_name.toLowerCase().includes(s) || u.pin_code.includes(s);
    }
    return true;
  });

  const statusBadge = (status: string) => {
    const cls = status === 'Active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'Dormant'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>{status}</span>;
  };

  const confidenceBar = (score: number) => (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${score >= 0.85 ? 'bg-emerald-500' : score >= 0.55 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${score * 100}%` }} />
      </div>
      <span className="text-xs text-slate-600 font-mono">{(score * 100).toFixed(0)}%</span>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total UBIDs', value: stats.total, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Dormant', value: stats.dormant, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Closed', value: stats.closed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Pending Reviews', value: stats.pendingReviews, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Depts Connected', value: stats.departmentsConnected, icon: Network, color: 'text-teal-600', bg: 'bg-teal-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Special query banner */}
      {factoriesQuery && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600" />
              <span className="font-semibold text-amber-800 text-sm">Factories with No Inspection in 18 Months</span>
            </div>
            <button onClick={runFactoriesQuery} className="text-amber-600 hover:text-amber-800"><X size={16} /></button>
          </div>
          {factoriesResults.length === 0 ? (
            <p className="text-sm text-amber-700">No factories found matching this criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-amber-700 border-b border-amber-200">
                    <th className="pb-2 font-medium">UBID</th>
                    <th className="pb-2 font-medium">Business Name</th>
                    <th className="pb-2 font-medium">Sector</th>
                    <th className="pb-2 font-medium">PIN Code</th>
                    <th className="pb-2 font-medium">Last Inspection</th>
                  </tr>
                </thead>
                <tbody>
                  {factoriesResults.map((r, i) => (
                    <tr key={i} className="border-b border-amber-100">
                      <td className="py-2 font-mono text-xs">{r.ubid}</td>
                      <td className="py-2">{r.business_name}</td>
                      <td className="py-2">{r.sector}</td>
                      <td className="py-2 font-mono">{r.pin_code}</td>
                      <td className="py-2">{r.last_inspection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by UBID, name, or PIN code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Dormant">Dormant</option>
              <option value="Closed">Closed</option>
            </select>
            <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Sectors</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              type="text"
              placeholder="PIN code"
              value={pinFilter}
              onChange={e => setPinFilter(e.target.value)}
              className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={runFactoriesQuery}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              factoriesQuery
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
            }`}
          >
            <AlertTriangle size={14} className="inline mr-1.5" />
            Factories: No Inspection 18mo
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">UBID</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Business Name</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Departments</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Confidence</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Last Activity</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Sector</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No businesses found</td></tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.ubid} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium">{u.ubid}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.primary_name}</td>
                    <td className="px-4 py-3">{statusBadge(u.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.source_departments.map(d => (
                          <span key={d} className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{d}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">{confidenceBar(u.confidence)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.last_event_date || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.sector || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(u.ubid)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          Showing {filtered.length} of {ubids.length} businesses
        </div>
      </div>

      {/* Detail Panel */}
      {selectedUbid && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedUbid(null)} />
          <div className="relative w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selectedUbid.ubid}</h2>
                <p className="text-sm text-slate-500">{selectedUbid.primary_name}</p>
              </div>
              <button onClick={() => setSelectedUbid(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-4">
                <div>Status: {statusBadge(selectedUbid.status)}</div>
                <div className="text-sm text-slate-500">Confidence: {(selectedUbid.confidence * 100).toFixed(0)}%</div>
                <div className="text-sm text-slate-500">Evidence: {selectedUbid.evidence_count} events</div>
              </div>

              {/* Linked Records */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Linked Department Records</h3>
                <div className="space-y-3">
                  {selectedUbid.linked_records.map((lr, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-blue-700">{lr.department}</span>
                        <span className="text-xs font-mono text-slate-500">{lr.record_id}</span>
                      </div>
                      {lr.raw && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(lr.raw).filter(([k]) => k !== 'department').map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-slate-500 min-w-[100px]">{k.replace(/_/g, ' ')}:</span>
                              <span className="text-slate-900 font-medium">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Signal Breakdown */}
              {selectedUbid.match_results.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Signal Breakdown</h3>
                  <div className="space-y-2">
                    {selectedUbid.match_results.map((mr, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <p className="text-xs text-slate-500 mb-2">{mr.record_a.record_id} vs {mr.record_b.record_id}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {[
                            ['PAN Match', mr.signals.pan_match],
                            ['GSTIN Match', mr.signals.gstin_match],
                            ['Name Similarity', mr.signals.name_similarity],
                            ['PIN Match', mr.signals.pin_match],
                            ['Address Overlap', mr.signals.address_overlap],
                            ['Phone Match', mr.signals.phone_match],
                            ['Owner Similarity', mr.signals.owner_similarity],
                          ].map(([label, val]: any) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-slate-600">{label}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(val * 100 / 0.9, 100)}%` }} />
                                </div>
                                <span className="font-mono text-slate-700 w-10 text-right">{(val * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-xs font-semibold">
                          <span>Total Confidence</span>
                          <span className="text-blue-700">{(mr.confidence * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Timeline */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Activity Timeline</h3>
                {selectedUbid.events.length === 0 ? (
                  <p className="text-xs text-slate-400">No events recorded</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUbid.events.sort((a: any, b: any) => b.event_date.localeCompare(a.event_date)).map((ev: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                        <div>
                          <span className="font-medium text-slate-900">{ev.event_type}</span>
                          <span className="text-slate-400 mx-2">—</span>
                          <span className="text-slate-600">{ev.department}</span>
                          <p className="text-slate-400 mt-0.5">{ev.event_date} | {ev.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
