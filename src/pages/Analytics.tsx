import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, GitPullRequest, Save, SlidersHorizontal, TimerReset } from 'lucide-react';
import { fetchApi } from '../hooks/useApi';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

interface Thresholds {
  review: number;
  auto_link: number;
}

interface DepartmentAnalytics {
  department: string;
  total_records: number;
  linked_records: number;
  last_synced: string | null;
  thresholds: Thresholds;
}

interface AnalyticsSummary {
  generated_at: string;
  totals: {
    ubids: number;
    records: number;
    events: number;
    unmatched_events: number;
    pending_reviews: number;
    linked_records: number;
  };
  status_counts: Record<'Active' | 'Dormant' | 'Closed', number>;
  department_counts: DepartmentAnalytics[];
  match_outcomes: Record<'Auto-Link' | 'Review Needed' | 'Keep Separate', number>;
  confidence_bands: Record<'high' | 'review' | 'low', number>;
  sector_counts: Record<string, number>;
  event_type_counts: Record<string, number>;
  review_decisions: Record<string, number>;
  factories_without_inspection_560058: Array<{
    ubid: string;
    business_name: string;
    pin_code: string;
    last_inspection: string;
    confidence: number;
    evidence_count: number;
  }>;
  unmatched_events: Array<{
    event_id: string;
    department: string;
    event_type: string;
    event_date: string;
    business_name?: string | null;
    reason: string;
  }>;
}

const DEPARTMENTS = ['Shop & Establishment', 'Factories', 'KSPCB'];
const CHART_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function objectEntries(record: Record<string, number>) {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

function conicGradient(entries: Array<[string, number]>) {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return '#e2e8f0';

  let cursor = 0;
  const stops = entries.map(([, value], index) => {
    const start = cursor;
    const size = (value / total) * 100;
    cursor += size;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function DonutChart({ title, entries }: { title: string; entries: Array<[string, number]> }) {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{title}</h3>
      <div className="flex items-center gap-5">
        <div
          className="relative h-32 w-32 shrink-0 rounded-full"
          style={{ background: conicGradient(entries) }}
        >
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-bold text-slate-900">{total}</span>
            <span className="text-[10px] font-semibold uppercase text-slate-400">Total</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {entries.map(([label, value], index) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate">{label}</span>
              </span>
              <span className="font-mono font-semibold text-slate-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HorizontalBars({ title, entries }: { title: string; entries: Array<[string, number]> }) {
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{title}</h3>
      <div className="space-y-3">
        {entries.map(([label, value], index) => (
          <div key={label}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="truncate font-medium text-slate-600">{label}</span>
              <span className="font-mono text-slate-500">{value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: percent(value / max),
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DepartmentCoverage({ departments }: { departments: DepartmentAnalytics[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-900">Department Link Coverage</h3>
      <div className="space-y-4">
        {departments.map(department => {
          const coverage = department.total_records ? department.linked_records / department.total_records : 0;
          return (
            <div key={department.department}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="font-medium text-slate-600">{department.department}</span>
                <span className="font-mono text-slate-500">{department.linked_records}/{department.total_records}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600" style={{ width: percent(coverage) }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Analytics() {
  const { isAdmin, roleLabel } = useRole();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, Thresholds>>({});
  const [savingDepartment, setSavingDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<AnalyticsSummary>('/analytics');
      setSummary(data);
      setThresholds(Object.fromEntries(data.department_counts.map(department => [
        department.department,
        department.thresholds,
      ])));
      setErrorMessage('');
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load analytics.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('kbig-data-changed', handler);
    return () => window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

  const updateThreshold = (department: string, key: keyof Thresholds, value: number) => {
    setThresholds(current => ({
      ...current,
      [department]: {
        ...(current[department] || { review: 0.55, auto_link: 0.85 }),
        [key]: value,
      },
    }));
  };

  const saveThreshold = async (department: string) => {
    const next = thresholds[department];
    if (!next) return;

    setSavingDepartment(department);
    try {
      await fetchApi(`/thresholds/${encodeURIComponent(department)}`, {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      await loadData();
      notifyDataChanged();
      showToast('success', `${department} thresholds updated.`);
    } catch (error: any) {
      const message = error.message || 'Failed to update thresholds.';
      setErrorMessage(message);
      showToast('error', message);
    }
    setSavingDepartment(null);
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Analytics</h2>
          <p className="mt-1 text-sm text-slate-500">UBID coverage, matching outcomes, activity health, and review queues.</p>
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

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            {[
              { label: 'UBIDs', value: summary.totals.ubids, icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Records', value: summary.totals.records, icon: GitPullRequest, color: 'text-teal-600', bg: 'bg-teal-50' },
              { label: 'Linked', value: summary.totals.linked_records, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Events', value: summary.totals.events, icon: TimerReset, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Unmatched', value: summary.totals.unmatched_events, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Reviews', value: summary.totals.pending_reviews, icon: SlidersHorizontal, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${item.bg}`}>
                  <item.icon size={18} className={item.color} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{item.value}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <DonutChart title="Status Classification" entries={objectEntries(summary.status_counts)} />
            <DonutChart title="Match Outcomes" entries={objectEntries(summary.match_outcomes)} />
            <DepartmentCoverage departments={summary.department_counts} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <HorizontalBars
              title="Confidence Bands"
              entries={[
                ['High 85-100%', summary.confidence_bands.high],
                ['Review 55-84%', summary.confidence_bands.review],
                ['Low 0-54%', summary.confidence_bands.low],
              ]}
            />
            <HorizontalBars title="Event Signals" entries={objectEntries(summary.event_type_counts).slice(0, 7)} />
            <HorizontalBars title="Sectors" entries={objectEntries(summary.sector_counts).slice(0, 7)} />
          </div>

          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-amber-900">Active Manufacturing Factories in PIN 560058 With No Inspection in 18 Months</h3>
              <span className="rounded border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700">
                {summary.factories_without_inspection_560058.length} results
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 text-left text-xs text-amber-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">UBID</th>
                    <th className="px-3 py-2 font-semibold">Business</th>
                    <th className="px-3 py-2 font-semibold">PIN</th>
                    <th className="px-3 py-2 font-semibold">Last Inspection</th>
                    <th className="px-3 py-2 font-semibold">Evidence</th>
                    <th className="px-3 py-2 font-semibold">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.factories_without_inspection_560058.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No matching businesses found</td></tr>
                  ) : summary.factories_without_inspection_560058.map(result => (
                    <tr key={result.ubid} className="border-t border-amber-100">
                      <td className="px-3 py-2 font-mono text-xs text-blue-700">{result.ubid}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{result.business_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{result.pin_code}</td>
                      <td className="px-3 py-2 text-slate-600">{result.last_inspection}</td>
                      <td className="px-3 py-2 font-mono text-xs">{result.evidence_count}</td>
                      <td className="px-3 py-2 font-mono text-xs">{percent(result.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {isAdmin && (
            <section className="space-y-4">
              <h3 className="text-base font-bold text-slate-900">Department Threshold Tuning</h3>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {DEPARTMENTS.filter(department => thresholds[department]).map(department => (
                  <div key={department} className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">{department}</h4>
                      <button
                        type="button"
                        onClick={() => saveThreshold(department)}
                        disabled={savingDepartment === department}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save size={13} />
                        {savingDepartment === department ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {(['review', 'auto_link'] as const).map(key => (
                      <label key={key} className="mb-4 block last:mb-0">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-semibold uppercase text-slate-500">{key.replace('_', ' ')}</span>
                          <span className="font-mono text-slate-700">{percent(thresholds[department][key])}</span>
                        </div>
                        <input
                          type="range"
                          min={key === 'review' ? 30 : 60}
                          max={key === 'review' ? 84 : 99}
                          value={Math.round(thresholds[department][key] * 100)}
                          onChange={event => updateThreshold(department, key, Number(event.target.value) / 100)}
                          className="w-full accent-blue-600"
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">Unmatched Event Review</h3>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                {summary.unmatched_events.length} visible
              </span>
            </div>
            {summary.unmatched_events.length === 0 ? (
              <p className="text-sm text-slate-400">No unjoined activity events are waiting for review.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Event</th>
                      <th className="px-3 py-2 font-semibold">Department</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Business</th>
                      <th className="px-3 py-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.unmatched_events.map(event => (
                      <tr key={event.event_id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{event.event_id}</td>
                        <td className="px-3 py-2 text-slate-600">{event.department}</td>
                        <td className="px-3 py-2 text-slate-900">{event.event_type}</td>
                        <td className="px-3 py-2 text-slate-600">{event.event_date}</td>
                        <td className="px-3 py-2 text-slate-600">{event.business_name || 'Not Available'}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{event.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
