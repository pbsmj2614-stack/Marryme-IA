/**
 * seedDashboard.ts
 * Popula as tabelas mm_clientes e mm_tarefas com dados de exemplo.
 * Execute apenas quando as tabelas estiverem vazias.
 *
 * Uso: importe e chame seedDashboard() no console do navegador ou
 *      em um componente de dev temporário.
 */

import { createClient } from "@/lib/supabase";

interface ClienteSeed {
  codigo: string;
  nome: string;
  plano: "Essencial" | "Growth" | "Enterprise";
  valor_contrato: number;
  status: "Ativo" | "Pausado";
}

interface TarefaSeed {
  cliente_codigo: string;
  titulo: string;
  status: "Pendente" | "Finalizado" | "Atrasado";
}

const CLIENTES_SEED: ClienteSeed[] = [
  { codigo: "MM001", nome: "Analu",            plano: "Growth",    valor_contrato: 600,  status: "Ativo"   },
  { codigo: "MM002", nome: "AirtonSax",         plano: "Essencial", valor_contrato: 300,  status: "Ativo"   },
  { codigo: "MM003", nome: "Aline Nascimento",  plano: "Enterprise", valor_contrato: 1200, status: "Ativo"   },
  { codigo: "MM004", nome: "Arpeggio",          plano: "Growth",    valor_contrato: 600,  status: "Ativo"   },
  { codigo: "MM005", nome: "Banda Pérola",      plano: "Essencial", valor_contrato: 300,  status: "Pausado" },
];

const TAREFAS_SEED: TarefaSeed[] = [
  // MM001 — Analu (4/5 finalizadas → score 80 → Saudável)
  { cliente_codigo: "MM001", titulo: "Briefing inicial",        status: "Finalizado" },
  { cliente_codigo: "MM001", titulo: "Criação de conteúdo",     status: "Finalizado" },
  { cliente_codigo: "MM001", titulo: "Revisão de roteiro",      status: "Finalizado" },
  { cliente_codigo: "MM001", titulo: "Publicação do anúncio",   status: "Finalizado" },
  { cliente_codigo: "MM001", titulo: "Otimização de campanha",  status: "Pendente"   },

  // MM002 — AirtonSax (1/5 finalizada → score 20 → Em risco)
  { cliente_codigo: "MM002", titulo: "Briefing inicial",    status: "Finalizado" },
  { cliente_codigo: "MM002", titulo: "Entrevista gravada",  status: "Atrasado"   },
  { cliente_codigo: "MM002", titulo: "Roteiro de vídeo",   status: "Atrasado"   },
  { cliente_codigo: "MM002", titulo: "Edição de vídeo",    status: "Pendente"   },
  { cliente_codigo: "MM002", titulo: "Publicação",         status: "Pendente"   },

  // MM003 — Aline Nascimento (3/5 finalizadas → score 60 → Em atenção)
  { cliente_codigo: "MM003", titulo: "Briefing inicial",         status: "Finalizado" },
  { cliente_codigo: "MM003", titulo: "Estratégia de conteúdo",   status: "Finalizado" },
  { cliente_codigo: "MM003", titulo: "Criação de roteiro",       status: "Finalizado" },
  { cliente_codigo: "MM003", titulo: "Gravação de vídeo",        status: "Pendente"   },
  { cliente_codigo: "MM003", titulo: "Edição e entrega",         status: "Atrasado"   },

  // MM004 — Arpeggio (4/4 finalizadas → score 100 → Concluído)
  { cliente_codigo: "MM004", titulo: "Briefing inicial",      status: "Finalizado" },
  { cliente_codigo: "MM004", titulo: "Entrevista completa",   status: "Finalizado" },
  { cliente_codigo: "MM004", titulo: "Roteiro aprovado",      status: "Finalizado" },
  { cliente_codigo: "MM004", titulo: "Vídeo entregue",        status: "Finalizado" },

  // MM005 — Banda Pérola (1/4 finalizada → score 25 → Em risco | Pausado)
  { cliente_codigo: "MM005", titulo: "Briefing inicial",           status: "Finalizado" },
  { cliente_codigo: "MM005", titulo: "Alinhamento de estratégia",  status: "Atrasado"   },
  { cliente_codigo: "MM005", titulo: "Criação de conteúdo",        status: "Atrasado"   },
  { cliente_codigo: "MM005", titulo: "Aprovação final",            status: "Pendente"   },
];

export async function seedDashboard(): Promise<void> {
  const supabase = createClient();

  // Verifica se já existe dado
  const { data: existing } = await supabase
    .from("mm_clientes")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0) {
    console.info("seedDashboard: dados já existem, nada a fazer.");
    return;
  }

  console.info("seedDashboard: inserindo clientes...");
  const { data: clientesInseridos, error: errClientes } = await supabase
    .from("mm_clientes")
    .insert(CLIENTES_SEED)
    .select("id, codigo");

  if (errClientes || !clientesInseridos) {
    console.error("seedDashboard: erro ao inserir clientes", errClientes);
    return;
  }

  const codigoToId: Record<string, string> = {};
  clientesInseridos.forEach((c: { codigo: string; id: string }) => {
    codigoToId[c.codigo] = c.id;
  });

  console.info("seedDashboard: inserindo tarefas...");
  const tarefasParaInserir = TAREFAS_SEED.map(({ cliente_codigo, titulo, status }) => ({
    cliente_id: codigoToId[cliente_codigo],
    titulo,
    status,
  })).filter((t) => t.cliente_id);

  const { error: errTarefas } = await supabase
    .from("mm_tarefas")
    .insert(tarefasParaInserir);

  if (errTarefas) {
    console.error("seedDashboard: erro ao inserir tarefas", errTarefas);
    return;
  }

  console.info("seedDashboard: concluído com sucesso.");
}
