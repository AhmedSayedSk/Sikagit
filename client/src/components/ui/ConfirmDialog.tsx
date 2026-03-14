import { useEffect } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useConfirmStore } from '../../store/confirmStore';

export function ConfirmDialog() {
  const options = useConfirmStore(s => s.options);
  const handleConfirm = useConfirmStore(s => s.handleConfirm);
  const handleCancel = useConfirmStore(s => s.handleCancel);

  // Close on Escape key
  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
      if (e.key === 'Enter') handleConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, handleCancel, handleConfirm]);

  if (!options) return null;

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
  } = options;

  const iconBg = variant === 'info' ? 'bg-accent/10' : variant === 'warning' ? 'bg-warning/10' : 'bg-danger/10';
  const iconColor = variant === 'info' ? 'text-accent' : variant === 'warning' ? 'text-warning' : 'text-danger';
  const confirmColors = variant === 'info'
    ? 'bg-accent-emphasis hover:bg-accent text-white'
    : variant === 'warning'
      ? 'bg-warning hover:bg-warning/80 text-black'
      : 'bg-danger hover:bg-danger/80 text-white';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={handleCancel}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[380px] shadow-xl animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className={`p-2 rounded-full ${iconBg} flex-shrink-0`}>
            {variant === 'info'
              ? <Info size={18} className={iconColor} />
              : <AlertTriangle size={18} className={iconColor} />
            }
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            autoFocus
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
