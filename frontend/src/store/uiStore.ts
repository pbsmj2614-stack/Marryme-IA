import { create } from "zustand";

interface UIStore {
  // Filtro de responsável — compartilhado entre Pipeline e Daily
  filtroResponsavel: string;
  setFiltroResponsavel: (v: string) => void;

  // Pipeline — filtros e ordenação
  pipelineFiltroStatus: string;
  pipelineBusca: string;
  pipelineSortKey: string | null;
  pipelineSortDir: "asc" | "desc";
  setPipelineFiltroStatus: (v: string) => void;
  setPipelineBusca: (v: string) => void;
  setPipelineSortKey: (v: string | null) => void;
  setPipelineSortDir: (v: "asc" | "desc") => void;

  // Daily — busca
  dailyBusca: string;
  setDailyBusca: (v: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  filtroResponsavel: "Todos",
  setFiltroResponsavel: (v) => set({ filtroResponsavel: v }),

  pipelineFiltroStatus: "Todos",
  pipelineBusca: "",
  pipelineSortKey: null,
  pipelineSortDir: "asc",
  setPipelineFiltroStatus: (v) => set({ pipelineFiltroStatus: v }),
  setPipelineBusca: (v) => set({ pipelineBusca: v }),
  setPipelineSortKey: (v) => set({ pipelineSortKey: v }),
  setPipelineSortDir: (v) => set({ pipelineSortDir: v }),

  dailyBusca: "",
  setDailyBusca: (v) => set({ dailyBusca: v }),
}));
