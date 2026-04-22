"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchClientes,
  fetchClientesAtivos,
  fetchTarefasByCliente,
  fetchPipelineRaw,
  type ClienteComTarefas,
  type TarefaRow,
  type PipelineRaw,
} from "@/lib/queries";

export const clientesKeys = {
  all: ["clientes"] as const,
  ativos: ["clientes", "ativos"] as const,
  tarefas: (clienteId: string) => ["clientes", clienteId, "tarefas"] as const,
};

export function useClientes() {
  return useQuery<ClienteComTarefas[]>({
    queryKey: clientesKeys.all,
    queryFn: fetchClientes,
  });
}

export function useClientesAtivos() {
  return useQuery<ClienteComTarefas[]>({
    queryKey: clientesKeys.ativos,
    queryFn: fetchClientesAtivos,
  });
}

export function useTarefasByCliente(clienteId: string) {
  return useQuery<TarefaRow[]>({
    queryKey: clientesKeys.tarefas(clienteId),
    queryFn: () => fetchTarefasByCliente(clienteId),
    enabled: Boolean(clienteId),
  });
}

export function useInvalidateClientes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clientesKeys.all });
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export const pipelineKeys = {
  raw: ["pipeline-data"] as const,
};

export function usePipelineRaw(enabled = true) {
  return useQuery<PipelineRaw>({
    queryKey: pipelineKeys.raw,
    queryFn: fetchPipelineRaw,
    enabled,
  });
}

export function useInvalidatePipeline() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: pipelineKeys.raw });
}
