import { create } from "zustand";

export interface ErrorEntry {
  id: string;
  message: string;
  source?: string;
  ts: number;
}

const MAX_ERRORS = 5;

interface ErrorState {
  errors: ErrorEntry[];
  addError: (message: string, source?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let _seq = 0;

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],

  addError: (message, source) =>
    set((state) => {
      const entry: ErrorEntry = {
        id: `err_${Date.now()}_${++_seq}`,
        message: message.slice(0, 200),
        source,
        ts: Date.now(),
      };
      const next = [...state.errors, entry];
      if (next.length > MAX_ERRORS) next.shift();
      return { errors: next };
    }),

  dismiss: (id) =>
    set((state) => ({ errors: state.errors.filter((e) => e.id !== id) })),

  clear: () => set({ errors: [] }),
}));
