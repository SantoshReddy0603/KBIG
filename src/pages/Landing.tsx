import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Lock, ShieldCheck } from 'lucide-react';
import { useRole, ViewRole } from '../context/RoleContext';
import { showToast } from '../utils/appEvents';

const DEPARTMENT_ROLES: ViewRole[] = ['Shop & Establishment', 'Factories', 'KSPCB'];

export default function Landing() {
  const navigate = useNavigate();
  const { hasRole, roleLabel, setRole, clearRole } = useRole();
  const [password, setPassword] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const enterDepartment = (role: ViewRole) => {
    setRole(role);
    navigate('/dashboard');
  };

  const authenticateAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthenticating(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Admin login failed.');
      setRole('Admin (KBIG)', payload.token);
      showToast('success', 'Admin access granted.');
      navigate('/dashboard');
    } catch (error: any) {
      const message = error.message || 'Admin login failed.';
      setErrorMessage(message);
      showToast('error', message);
    }

    setAuthenticating(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">KB</div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">KBIG</h1>
              <p className="text-xs text-slate-500">Karnataka Business Identity Graph</p>
            </div>
          </div>
          {hasRole && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Continue as {roleLabel}
            </button>
          )}
        </div>

        <div className="grid flex-1 items-center gap-6 lg:grid-cols-[1fr_24rem]">
          <section>
            <div className="mb-6">
              <h2 className="text-3xl font-bold tracking-tight text-slate-950">Select a system view</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Choose Admin for full UBID operations, or enter a department view for scoped access to that department's records.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {DEPARTMENT_ROLES.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => enterDepartment(role)}
                  className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Building2 size={20} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{role}</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-500">Department-only record visibility.</p>
                </button>
              ))}
            </div>
          </section>

          <form onSubmit={authenticateAdmin} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Admin (KBIG)</h3>
                <p className="text-xs text-slate-500">Full access requires password</p>
              </div>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase text-slate-500">Password</span>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin password"
                />
              </div>
            </label>

            {errorMessage && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={authenticating || !password.trim()}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {authenticating ? 'Checking...' : 'Enter Admin View'}
            </button>

            {hasRole && (
              <button
                type="button"
                onClick={clearRole}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear current view
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
