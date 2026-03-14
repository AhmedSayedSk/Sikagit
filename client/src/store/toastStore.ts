import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = String(++nextId);
    set(s => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
