import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Search, Filter, AlertTriangle, Building2, Clock, XCircle, CheckCircle2, Eye, X, AlertCircle, Network, GitBranch, PlusCircle } from 'lucide-react';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

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
  linked_records: Array<{ record_id: string; department: string; business_name: string; ubid?: string | null; raw?: any }>;
  match_results: any[];
  events: any[];
  notifications?: Array<{
    notification_id: string;
    department: string;
    event_type: string;
    message: string;
    details: string;
    created_at: string;
    read: boolean;
  }>;
}

const EVENT_TYPES = [
  'Inspection Completed',
  'Factory Inspection',
  'Licence Renewal',
  'Consent Filing',
  'Compliance Filing',
  'Utility Consumption',
  'Closure Notice',
];

const emptyEventForm = () => ({
  record_id: '',
  event_type: 'Inspection Completed',
  event_date: new Date().toISOString().split('T')[0],
  details: '',
});

export default function Dashboard() {
  const { roleLabel, isAdmin } = useRole();
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
  const [errorMessage, setErrorMessage] = useState('');
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [splitLoading, setSplitLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ubidData, reviewData] = await Promise.all([
        fetchApi<UBID[]>('/ubids'),
        isAdmin ? fetchApi<any[]>('/review-queue') : Promise.resolve([]),
      ]);
      setUbids(ubidData);
      setPendingReviews(reviewData.length);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load UBIDs.');
    }
    setLoading(false);
  }, [isAdmin, roleLabel]);

  useEffect(() => { loadData(); }, [loadData]);

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
    } catch (error: any) {
      const message = error.message || 'Query failed.';
      setErrorMessage(message);
      showToast('error', message);
    }
  };

  const openDetail = useCallback(async (ubid: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchApi<UBIDDetail>(`/ubids/${encodeURIComponent(ubid)}`);
      setSelectedUbid(data);
      setEventForm(current => ({
        ...current,
        record_id: current.record_id && data.linked_records.some(record => record.record_id === current.record_id)
          ? current.record_id
          : data.linked_records[0]?.record_id || '',
      }));
    } catch (error: any) {
      const message = error.message || 'Failed to load detail.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setDetailLoading(false);
  }, []);

  const addEvent = async () => {
    if (!selectedUbid) return;
    if (!eventForm.record_id || !eventForm.event_type || !eventForm.event_date) {
      showToast('error', 'Choose a record, event type, and event date.');
      return;
    }

    setEventSubmitting(true);
    try {
      await fetchApi('/events', {
        method: 'POST',
        body: JSON.stringify({
          ubid: selectedUbid.ubid,
          ...eventForm,
        }),
      });
      setEventForm(current => ({ ...emptyEventForm(), record_id: current.record_id }));
      await loadData();
      await openDetail(selectedUbid.ubid);
      notifyDataChanged();
      showToast('success', 'Event added and status reclassified.');
    } catch (error: any) {
      const message = error.message || 'Failed to add event.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setEventSubmitting(false);
  };

  const splitRecord = async (recordId: string) => {
    if (!selectedUbid || selectedUbid.linked_records.length < 2) return;

    setSplitLoading(recordId);
    try {
      const result = await fetchApi<{ old_ubid_record: UBIDDetail | null; new_ubid: string | null }>(
        `/ubids/${encodeURIComponent(selectedUbid.ubid)}/split`,
        {
          method: 'POST',
          body: JSON.stringify({ record_id: recordId, reviewer_id: 'reviewer_001' }),
        }
      );
      await loadData();
      if (result.old_ubid_record) {
        await openDetail(selectedUbid.ubid);
      } else {
        setSelectedUbid(null);
      }
      notifyDataChanged();
      showToast('success', `Record ${recordId} split into ${result.new_ubid || 'a new UBID'}.`);
    } catch (error: any) {
      const message = error.message || 'Failed to split UBID.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setSplitLoading(null);
  };

  useEffect(() => {
    const handler = () => {
      loadData();
      if (selectedUbid) openDetail(selectedUbid.ubid);
    };
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData, openDetail, selectedUbid]);

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

  const displayValue = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text ? text : 'Not Available';
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

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
              <span className="font-semibold text-amber-800 text-sm">Active Manufacturing Factories in PIN 560058 with No Inspection in 18 Months</span>
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
            PIN 560058 No Inspection
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
                  <tr key={u.ubid} onClick={() => openDetail(u.ubid)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors">
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
                    <td className="px-4 py-3 text-xs text-slate-500">{u.last_event_date || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.sector || '-'}</td>
                    <td className="px-4 py-3">
                      <button onClick={(event) => { event.stopPropagation(); openDetail(u.ubid); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
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
                {detailLoading && <p className="mt-1 text-xs text-blue-600">Refreshing detail...</p>}
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">{lr.record_id}</span>
                          <span className="text-xs font-mono text-blue-700">{lr.ubid || selectedUbid.ubid}</span>
                          {isAdmin && selectedUbid.linked_records.length > 1 && (
                            <button
                              type="button"
                              onClick={() => splitRecord(lr.record_id)}
                              disabled={splitLoading === lr.record_id}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              <GitBranch size={12} />
                              {splitLoading === lr.record_id ? 'Splitting...' : 'Split'}
                            </button>
                          )}
                        </div>
                      </div>
                      {lr.raw && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(lr.raw).filter(([k]) => k !== 'department').map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-slate-500 min-w-[100px]">{k.replace(/_/g, ' ')}:</span>
                              <span className="text-slate-900 font-medium">{displayValue(v)}</span>
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
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Explainability</h3>
                  <div className="space-y-2">
                    {selectedUbid.match_results.map((mr, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-500">{mr.record_a.record_id} vs {mr.record_b.record_id}</p>
                          <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-blue-700">
                            Total {(mr.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                                <th className="px-3 py-2 font-semibold">Signal</th>
                                <th className="px-3 py-2 font-semibold">Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ['PAN', mr.signals.pan_match],
                                ['GSTIN', mr.signals.gstin_match],
                                ['Name similarity', mr.signals.name_similarity],
                                ['Address', mr.signals.address_overlap],
                                ['Phone', mr.signals.phone_match],
                                ['Owner', mr.signals.owner_similarity],
                              ].map(([label, value]: any) => (
                                <tr key={label} className="border-b border-slate-100 last:border-0">
                                  <td className="px-3 py-2 text-slate-600">{label}</td>
                                  <td className="px-3 py-2 font-mono text-slate-900">{(value * 100).toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                          {mr.explanation || 'Explanation unavailable for this pair.'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Event */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Add Event</h3>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-slate-500">Record</span>
                      <select
                        value={eventForm.record_id}
                        onChange={event => setEventForm(current => ({ ...current, record_id: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {selectedUbid.linked_records.map(record => (
                          <option key={record.record_id} value={record.record_id}>
                            {record.record_id} - {record.department}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-slate-500">Event Type</span>
                      <select
                        value={eventForm.event_type}
                        onChange={event => setEventForm(current => ({ ...current, event_type: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-slate-500">Event Date</span>
                      <input
                        type="date"
                        value={eventForm.event_date}
                        onChange={event => setEventForm(current => ({ ...current, event_date: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-slate-500">Details</span>
                      <input
                        value={eventForm.details}
                        onChange={event => setEventForm(current => ({ ...current, details: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={addEvent}
                      disabled={eventSubmitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <PlusCircle size={16} />
                      {eventSubmitting ? 'Adding...' : 'Add Event'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Notifications */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Business Notifications</h3>
                {(selectedUbid.notifications || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No notifications for this UBID</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedUbid.notifications || []).map(notification => (
                      <div key={notification.notification_id} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-blue-900">{notification.message}</span>
                          <span className="text-blue-700">{new Date(notification.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-blue-800">{notification.department} | {notification.event_type}</p>
                        <p className="mt-0.5 text-blue-700">{notification.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                          <span className="text-slate-400 mx-2">-</span>
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
