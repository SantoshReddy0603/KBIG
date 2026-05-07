import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type ViewRole = 'Admin (KBIG)' | 'Shop & Establishment' | 'Factories' | 'KSPCB';

export const VIEW_ROLES: ViewRole[] = ['Admin (KBIG)', 'Shop & Establishment', 'Factories', 'KSPCB'];
export const ROLE_STORAGE_KEY = 'kbig-view-role';
export const ADMIN_TOKEN_STORAGE_KEY = 'kbig-admin-token';

interface RoleContextValue {
  role: ViewRole | null;
  roleDepartment: Exclude<ViewRole, 'Admin (KBIG)'> | null;
  roleLabel: string;
  isAdmin: boolean;
  hasRole: boolean;
  adminToken: string | null;
  setRole: (role: ViewRole, token?: string) => void;
  clearRole: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function clearLegacyDataCache() {
  if (typeof window === 'undefined') return;
  const preserved = new Set([ROLE_STORAGE_KEY, ADMIN_TOKEN_STORAGE_KEY]);
  [window.localStorage, window.sessionStorage].forEach(storage => {
    Object.keys(storage)
      .filter(key => key.startsWith('kbig-') && !preserved.has(key))
      .forEach(key => storage.removeItem(key));
  });
}

function storedRole(): ViewRole | null {
  if (typeof window === 'undefined') return null;
  const role = window.localStorage.getItem(ROLE_STORAGE_KEY) as ViewRole | null;
  if (!role || !VIEW_ROLES.includes(role)) return null;
  if (role === 'Admin (KBIG)' && !window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)) return null;
  return role;
}

function storedAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<ViewRole | null>(storedRole);
  const [adminToken, setAdminToken] = useState<string | null>(storedAdminToken);

  useEffect(() => {
    clearLegacyDataCache();
  }, []);

  const value = useMemo<RoleContextValue>(() => ({
    role,
    roleDepartment: role && role !== 'Admin (KBIG)' ? role : null,
    roleLabel: role || 'No role selected',
    isAdmin: role === 'Admin (KBIG)' && Boolean(adminToken),
    hasRole: Boolean(role),
    adminToken,
    setRole: (nextRole, token) => {
      setRoleState(nextRole);
      window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);

      if (nextRole === 'Admin (KBIG)') {
        const nextToken = token || adminToken || '';
        setAdminToken(nextToken);
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, nextToken);
      } else {
        setAdminToken(null);
        window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      }

      window.dispatchEvent(new CustomEvent('kbig-role-changed', { detail: { role: nextRole } }));
      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    },
    clearRole: () => {
      setRoleState(null);
      setAdminToken(null);
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('kbig-role-changed', { detail: { role: null } }));
      window.dispatchEvent(new CustomEvent('kbig-data-changed'));
    },
  }), [adminToken, role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used inside RoleProvider');
  return context;
}
