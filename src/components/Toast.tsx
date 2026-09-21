import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface ToastState {
  message: string;
  type?: 'success' | 'error';
}

interface ToastProps extends ToastState {
  onClose: () => void;
  duration?: number;
}

/**
 * Small auto-dismissing notification, fixed to the bottom-right corner.
 * Usage: keep a `const [toast, setToast] = useState<ToastState | null>(null)`
 * in the page, call `setToast({ message: '...', type: 'success' })` after an
 * action succeeds, and render `{toast && <Toast {...toast} onClose={() => setToast(null)} />}`.
 */
export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const isSuccess = type === 'success';

  return (
    <div className="fixed bottom-5 right-5 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div
        className={`flex items-center gap-2.5 pl-3.5 pr-2.5 py-3 rounded-2xl shadow-xl border text-xs font-semibold max-w-sm ${
          isSuccess
            ? 'bg-emerald-600 border-emerald-700 text-white'
            : 'bg-rose-600 border-rose-700 text-white'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 shrink-0" />
        )}
        <span className="leading-snug">{message}</span>
        <button
          onClick={onClose}
          className="ml-1 p-0.5 rounded-lg opacity-80 hover:opacity-100 hover:bg-white/10 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};