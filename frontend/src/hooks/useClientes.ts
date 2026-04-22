"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchClientes,
  fetchClientesAtivos,
  fetchTarefasByCliente,
  type ClienteComTarefas,
  type TarefaRow,
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
