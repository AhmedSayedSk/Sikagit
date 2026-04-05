import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: Toast['type'], message: string, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (type, message, action) => {
    const id = String(++nextId);
    set(s => ({ toasts: [...s.toasts, { id, type, message, action }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, action ? 10000 : 4000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
