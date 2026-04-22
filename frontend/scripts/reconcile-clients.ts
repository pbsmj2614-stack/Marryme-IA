/* eslint-disable no-console */
/**
 * scripts/reconcile-clients.ts
 *
 * Compara contagens e divergências entre as duas bases de clientes:
 *   - mm_clientes  (Pipeline / Daily — CS interno)
 *   - prestadores  (Roteiros / Meta Ads — sistema de IA)
 *
 * Uso:
 *   npx tsx scripts/reconcile-clients.ts
 *
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (.env ou .env.local)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// Carrega .env.local do diretório do frontend
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("❌  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(url, key);

// ─── Tipos mínimos ────────────────────────────────────────────────────────────

interface MmCliente {
  id_cliente: string;
  nome_empresa: string;
  status: string;
  fase_projeto: string | null;
  responsavel_mm: string | null;
}

interface Prestador {
  id: string;
  nome_artistico: string;
  meta_ad_account_id: string | null;
  meta_sync_status: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function separator(label: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

function row(label: string, value: string | number) {
  console.log(`  ${label.padEnd(40)} ${value}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍  MarryMe — Reconciliação de Clientes");
  console.log(`    Executado em: ${new Date().toLocaleString("pt-BR")}\n`);

  // ── Busca dados ──────────────────────────────────────────────────────────────
  const [mmResult, prestResult] = await Promise.all([
    supabase
      .from("mm_clientes")
      .select("id_cliente, nome_empresa, status, fase_projeto, responsavel_mm")
      .order("id_cliente"),
    supabase
      .from("prestadores")
      .select("id, nome_artistico, meta_ad_account_id, meta_sync_status")
      .order("nome_artistico"),
  ]);

  if (mmResult.error) {
    console.error("❌  Erro ao buscar mm_clientes:", mmResult.error.message);
    process.exit(1);
  }
  if (prestResult.error) {
    console.error("❌  Erro ao buscar prestadores:", prestResult.error.message);
    process.exit(1);
  }

  const mmClientes = mmResult.data as MmCliente[];
  const prestadores = prestResult.data as Prestador[];

  // ── Contagens ────────────────────────────────────────────────────────────────
  separator("CONTAGENS");

  const mmAtivos = mmClientes.filter((c) => c.status === "Ativo");
  const mmPausados = mmClientes.filter((c) => c.status === "Pausado");
  const mmEncerrados = mmClientes.filter((c) => c.status === "Encerrado");
  const prestComMeta = prestadores.filter((p) => p.meta_ad_account_id);

  row("mm_clientes (total)", mmClientes.length);
  row("  → Ativos", mmAtivos.length);
  row("  → Pausados", mmPausados.length);
  row("  → Encerrados", mmEncerrados.length);
  row("prestadores (total)", prestadores.length);
  row("  → Com Meta Ads configurado", prestComMeta.length);

  // ── Por responsável ──────────────────────────────────────────────────────────
  separator("DISTRIBUIÇÃO POR RESPONSÁVEL (mm_clientes ativos)");

  const porResp = mmAtivos.reduce<Record<string, number>>((acc, c) => {
    const r = c.responsavel_mm ?? "(sem responsável)";
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  Object.entries(porResp)
    .sort((a, b) => b[1] - a[1])
    .forEach(([resp, count]) => row(resp, count));

  // ── Por fase ─────────────────────────────────────────────────────────────────
  separator("DISTRIBUIÇÃO POR FASE (mm_clientes ativos)");

  const porFase = mmAtivos.reduce<Record<string, number>>((acc, c) => {
    const f = c.fase_projeto ?? "(sem fase)";
    acc[f] = (acc[f] ?? 0) + 1;
    return acc;
  }, {});

  Object.entries(porFase)
    .sort((a, b) => b[1] - a[1])
    .forEach(([fase, count]) => row(fase, count));

  // ── Inconsistências ──────────────────────────────────────────────────────────
  separator("INCONSISTÊNCIAS DETECTADAS");

  let issues = 0;

  // Nomes suspeitos (muito curtos ou com caracteres estranhos)
  const nomesEstranhos = mmClientes.filter(
    (c) => c.nome_empresa.trim().length < 3 || /[<>{}]/.test(c.nome_empresa)
  );
  if (nomesEstranhos.length > 0) {
    console.log(`\n  ⚠️  Nomes suspeitos em mm_clientes (${nomesEstranhos.length}):`);
    nomesEstranhos.forEach((c) => console.log(`     [${c.id_cliente}] "${c.nome_empresa}"`));
    issues += nomesEstranhos.length;
  }

  // Clientes ativos sem responsável
  const semResp = mmAtivos.filter((c) => !c.responsavel_mm);
  if (semResp.length > 0) {
    console.log(`\n  ⚠️  Clientes ativos sem responsável (${semResp.length}):`);
    semResp.forEach((c) => console.log(`     [${c.id_cliente}] ${c.nome_empresa}`));
    issues += semResp.length;
  }

  // Clientes ativos sem fase definida
  const semFase = mmAtivos.filter((c) => !c.fase_projeto);
  if (semFase.length > 0) {
    console.log(`\n  ⚠️  Clientes ativos sem fase (${semFase.length}):`);
    semFase.forEach((c) => console.log(`     [${c.id_cliente}] ${c.nome_empresa}`));
    issues += semFase.length;
  }

  // Prestadores com Meta configurado mas sync com erro
  const metaComErro = prestadores.filter(
    (p) => p.meta_ad_account_id && p.meta_sync_status === "erro"
  );
  if (metaComErro.length > 0) {
    console.log(`\n  ⚠️  Prestadores com Meta Ads em erro (${metaComErro.length}):`);
    metaComErro.forEach((p) =>
      console.log(`     [${p.id.slice(0, 8)}] ${p.nome_artistico} — conta: ${p.meta_ad_account_id}`)
    );
    issues += metaComErro.length;
  }

  if (issues === 0) {
    console.log("  ✅  Nenhuma inconsistência detectada.");
  }

  // ── Divergência de contagem ───────────────────────────────────────────────────
  separator("RESUMO FINAL");

  const diff = mmAtivos.length - prestadores.length;
  row("mm_clientes ativos", mmAtivos.length);
  row("prestadores (roteiros/IA)", prestadores.length);
  row(
    "Divergência",
    diff === 0
      ? "0 (ok)"
      : `${Math.abs(diff)} ${diff > 0 ? "cliente(s) sem prestador" : "prestador(es) sem cliente CS"}`
  );

  if (issues > 0) {
    console.log(`\n  ⚠️  Total de inconsistências: ${issues}`);
    console.log("     Corrija manualmente no Supabase Studio ou via migration aditiva.\n");
  } else {
    console.log("\n  ✅  Tudo certo!\n");
  }
}

main().catch((err: unknown) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
