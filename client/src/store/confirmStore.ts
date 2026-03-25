import { create } from 'zustand';

interface ConfirmCheckbox {
  label: string;
  defaultChecked?: boolean;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  checkbox?: ConfirmCheckbox;
}

interface ConfirmResult {
  confirmed: boolean;
  checkboxValue?: boolean;
}

interface ConfirmState {
  options: ConfirmOptions | null;
  resolve: ((value: ConfirmResult) => void) | null;
  // Returns just boolean (backwards-compatible) — ignores checkbox
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // Returns full result including checkbox value
  confirmWithCheckbox: (options: ConfirmOptions) => Promise<ConfirmResult>;
  handleConfirm: (checkboxValue?: boolean) => void;
  handleCancel: () => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  options: null,
  resolve: null,

  confirm: (options) => {
    return new Promise<boolean>((resolve) => {
      set({
        options,
        resolve: (result: ConfirmResult) => resolve(result.confirmed),
      });
    });
  },

  confirmWithCheckbox: (options) => {
    return new Promise<ConfirmResult>((resolve) => {
      set({ options, resolve });
    });
  },

  handleConfirm: (checkboxValue?: boolean) => {
    const { resolve } = get();
    resolve?.({ confirmed: true, checkboxValue });
    set({ options: null, resolve: null });
  },

  handleCancel: () => {
    const { resolve } = get();
    resolve?.({ confirmed: false });
    set({ options: null, resolve: null });
  },
}));
