import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../hooks/useApi';
import { Building2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { useRole } from '../context/RoleContext';

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

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchApi<Department[]>('/departments');
      setDepartments(data);
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

    return () =>
      window.removeEventListener('kbig-data-changed', handler);
  }, [loadData]);

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
                              department.last_synced
                            ).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>

                  <Building2
                    size={18}
                    className="text-slate-300"
                  />
                </div>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {department.total_records}
                    </p>

                    <p className="text-xs text-slate-500">
                      Total Records
                    </p>
                  </div>

                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {clampedPercent(department.match_rate)}%
                    </p>

                    <p className="text-xs text-slate-500">
                      UBID Coverage
                    </p>
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
                      <CheckCircle2
                        size={14}
                        className="text-blue-500"
                      />
                      Review-Linked
                    </span>

                    <span className="font-semibold text-slate-900">
                      {department.manually_linked}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <AlertCircle
                        size={14}
                        className="text-amber-500"
                      />
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
                        width: `${clampedPercent(
                          department.match_rate
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
