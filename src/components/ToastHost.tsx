import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastType } from '../utils/appEvents';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
};

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: ToastType; message?: string }>).detail;
      if (!detail?.message) return;

      const toast: Toast = {
        id: Date.now() + Math.random(),
        type: detail.type || 'info',
        message: detail.message,
      };

      setToasts(current => [...current, toast]);
      window.setTimeout(() => {
        setToasts(current => current.filter(item => item.id !== toast.id));
      }, 4200);
    };

    window.addEventListener('kbig-toast', handler);
    return () => window.removeEventListener('kbig-toast', handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed right-4 top-16 z-[70] w-[min(24rem,calc(100vw-2rem))] space-y-2">
      {toasts.map(toast => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${STYLES[toast.type]}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-medium leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}
              className="rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
