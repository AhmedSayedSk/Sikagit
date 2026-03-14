import { useToastStore } from '../../store/toastStore';
import { X, CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const colors = {
  success: 'border-success bg-[#1a3a2a] text-success',
  error: 'border-danger bg-[#3a1a1a] text-danger',
  info: 'border-accent bg-[#1a2a3a] text-accent',
};

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const removeToast = useToastStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[400px]">
      {toasts.map(toast => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            style={{ animation: 'toast-in 200ms ease-out' }}
            className={cn(
              'flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg',
              colors[toast.type]
            )}
          >
            <Icon size={15} className="flex-shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed flex-1 text-text-primary">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
