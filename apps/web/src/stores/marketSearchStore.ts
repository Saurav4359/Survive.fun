import { create } from "zustand";

type State = {
  query: string;
  setQuery: (q: string) => void;
};

export const useMarketSearchStore = create<State>((set) => ({
  query: "",
  setQuery: (q) => set({ query: q }),
}));
