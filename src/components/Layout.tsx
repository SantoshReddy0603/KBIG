import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, Building2, ScrollText, Activity, PlusCircle, Upload, RefreshCw, LogOut, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { fetchApi } from '../hooks/useApi';
import ToastHost from './ToastHost';
import { notifyDataChanged, showToast } from '../utils/appEvents';
import { useRole } from '../context/RoleContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/review', label: 'Reviewer Portal', icon: ClipboardCheck, adminOnly: true },
  { to: '/sync', label: 'Sync', icon: RefreshCw, adminOnly: true },
  { to: '/departments', label: 'Departments', icon: Building2, adminOnly: false },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, adminOnly: false },
  { to: '/audit-log', label: 'Audit Log', icon: ScrollText, adminOnly: true },
];

export default function Layout() {
  const [matching, setMatching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { roleLabel, clearRole, isAdmin } = useRole();
  const visibleNavItems = navItems.filter(item => isAdmin || !item.adminOnly);

  const runMatching = async () => {
    setMatching(true);
    try {
      await fetchApi('/match', { method: 'POST' });
      notifyDataChanged();
      showToast('success', 'Matching engine recomputed with reviewer decisions preserved.');
    } catch (e: any) {
      showToast('error', e.message || 'Matching failed.');
    }
    setMatching(false);
  };

  const switchRole = () => {
    clearRole();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">KB</div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">KBIG</h1>
              <p className="text-[11px] text-slate-400 leading-tight">Karnataka Business Identity Graph</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Unified Business Identifier System<br />
            Karnataka Commerce & Industries
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <span className="text-sm text-slate-500">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 lg:inline-flex">
              Viewing as: {roleLabel}
            </span>
            <NavLink
              to="/add-record"
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <PlusCircle size={16} />
              <span className="hidden sm:inline">Add Record</span>
            </NavLink>
            <NavLink
              to="/upload-csv"
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Upload CSV</span>
            </NavLink>
            {isAdmin && (
              <button
                onClick={runMatching}
                disabled={matching}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Activity size={16} className={matching ? 'animate-spin' : ''} />
                <span className="hidden md:inline">{matching ? 'Running...' : 'Run Matching Engine'}</span>
                <span className="md:hidden">{matching ? 'Run...' : 'Match'}</span>
              </button>
            )}
            <button
              onClick={switchRole}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Switch Role</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
