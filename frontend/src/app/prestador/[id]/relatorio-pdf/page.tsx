import { redirect, notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { PrestadorMeta, RelatorioCampanha, CampanhaInsight } from "@/lib/types";
import PrintButton from "./PrintButton";
import { fmt, fmtBRL, fmtPct } from "@/lib/formatters";

function scoreLabel(s: number) {
  if (s >= 70) return { label: "Saudável", color: "#16a34a" };
  if (s >= 40) return { label: "Atenção", color: "#ca8a04" };
  return { label: "Em Risco", color: "#dc2626" };
}

export default async function RelatorioPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prestador } = await supabase.from("prestadores").select("*").eq("id", id).single();

  if (!prestador) notFound();

  const { data: relatorios } = await supabase
    .from("relatorios_campanha")
    .select("*")
    .eq("prestador_id", id)
    .order("gerado_em", { ascending: false })
    .limit(1);

  const p = prestador as PrestadorMeta;
  const rel = (relatorios?.[0] ?? null) as RelatorioCampanha | null;
  const kpis = rel?.dados_json.kpis;
  const campanhas = rel?.dados_json.campanhas ?? [];
  const score = rel?.health_score ?? null;
  const sc = score !== null ? scoreLabel(score) : null;

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {/* Print button — hidden on print */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <PrintButton />
        <a
          href={`/prestador/${id}?tab=campanha#campanha`}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
        >
          ← Voltar
        </a>
      </div>

      <style>{`
        @media print {
          @page { margin: 20mm 18mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="max-w-[800px] mx-auto px-8 py-10 font-sans text-gray-900">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">
              Relatório de Campanha
            </p>
            <h1 className="text-3xl font-bold text-gray-900">{p.nome_artistico}</h1>
            {p.cidade_base && <p className="text-sm text-gray-500 mt-1">{p.cidade_base}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Gerado em</p>
            <p className="text-sm font-semibold text-gray-700">{hoje}</p>
            {rel && (
              <>
                <p className="text-xs text-gray-400 mt-2">Período</p>
                <p className="text-xs text-gray-600">
                  {new Date(rel.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                  {" a "}
                  {new Date(rel.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
              </>
            )}
          </div>
        </div>

        {!rel && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Nenhum relatório gerado ainda.</p>
            <p className="text-sm mt-2">
              Acesse a aba Campanha e clique em &quot;Atualizar dados&quot;.
            </p>
          </div>
        )}

        {rel && kpis && (
          <>
            {/* Health Score */}
            {sc && score !== null && (
              <div
                className="rounded-2xl p-6 mb-6 flex items-center gap-6"
                style={{ backgroundColor: `${sc.color}15`, border: `2px solid ${sc.color}30` }}
              >
                <div
                  className="w-20 h-20 rounded-full flex flex-col items-center justify-center shrink-0"
                  style={{ border: `4px solid ${sc.color}` }}
                >
                  <span className="text-3xl font-bold" style={{ color: sc.color }}>
                    {score}
                  </span>
                  <span className="text-[9px] text-gray-400">/ 100</span>
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: sc.color }}>
                    {sc.label}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Health Score calculado com base em CTR, frequência e CPM das campanhas ativas no
                    período.
                  </p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
              Métricas do período
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: "Impressões", value: fmt(kpis.impressions) },
                { label: "Alcance", value: fmt(kpis.reach) },
                { label: "Cliques", value: fmt(kpis.clicks) },
                { label: "CTR", value: fmtPct(kpis.ctr) },
                { label: "CPM", value: fmtBRL(kpis.cpm) },
                { label: "Frequência", value: fmt(kpis.frequency, 2) },
                { label: "Gasto total", value: fmtBRL(kpis.spend) },
                { label: "Resultados", value: fmt(kpis.results) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Campanhas */}
            {campanhas.length > 0 && (
              <>
                <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">
                  Campanhas ({campanhas.length})
                </h2>
                <table className="w-full text-sm mb-6" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      {[
                        "Campanha",
                        "Impressões",
                        "Cliques",
                        "CTR",
                        "CPM",
                        "Gasto",
                        "Resultados",
                      ].map((h) => (
                        <th
                          key={h}
                          className={`py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide ${h === "Campanha" ? "text-left pr-3" : "text-right px-2"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(campanhas as CampanhaInsight[]).map((c, i) => (
                      <tr
                        key={c.campaign_id}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          backgroundColor: i % 2 ? "#fafafa" : "white",
                        }}
                      >
                        <td
                          className="py-2 pr-3 text-gray-800 font-medium max-w-[200px] truncate"
                          style={{ maxWidth: 200 }}
                        >
                          {c.campaign_name}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmt(c.impressions)}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmt(c.clicks)}</td>
                        <td
                          className="py-2 px-2 text-right font-medium"
                          style={{
                            color: c.ctr >= 1 ? "#16a34a" : c.ctr >= 0.5 ? "#ca8a04" : "#dc2626",
                          }}
                        >
                          {fmtPct(c.ctr)}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(c.cpm)}</td>
                        <td className="py-2 px-2 text-right text-gray-700 font-medium">
                          {fmtBRL(c.spend)}
                        </td>
                        <td className="py-2 pl-2 text-right font-bold text-gray-900">
                          {fmt(c.results)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Interpretação */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                Interpretação do Health Score
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-green-700 mb-1">70–100 · Saudável</p>
                  <p className="text-gray-600 text-xs">
                    CTR alto, frequência baixa e CPM eficiente. Campanha performando bem.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-yellow-700 mb-1">40–69 · Atenção</p>
                  <p className="text-gray-600 text-xs">
                    Pontos de melhoria identificados. Revisão de segmentação ou criativo
                    recomendada.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-red-700 mb-1">0–39 · Em Risco</p>
                  <p className="text-gray-600 text-xs">
                    CTR baixo e/ou frequência alta. Ação imediata necessária para evitar
                    desperdício.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Rodapé */}
        <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <span>MarryMe · Relatório gerado automaticamente via Meta Marketing API</span>
          <span>act_{p.meta_ad_account_id ?? "—"}</span>
        </div>
      </div>
    </>
  );
}
