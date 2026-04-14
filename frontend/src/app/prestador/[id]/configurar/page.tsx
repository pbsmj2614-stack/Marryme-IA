"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type DiagResult = {
  ok: boolean;
  token_valido?: boolean;
  token_usuario?: string;
  token_usuario_id?: string;
  token_expira_em?: string;
  token_tem_ads_read?: boolean;
  token_permissoes?: string[];
  token_erro?: string;
  token_fonte?: string;
  conta_acessivel?: boolean;
  conta_nome?: string;
  conta_status?: string;
  conta_erro?: string;
  conta_sugestao?: string;
  contas_acessiveis?: Array<{ id: string; nome: string; status: string }>;
  contas_erro?: string;
  account_id_testado?: string;
};

export default function ConfigurarMetaPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = createClient();

  const [nome,        setNome]        = useState("");
  const [accountId,   setAccountId]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [erro,        setErro]        = useState<string | null>(null);
  const [sucesso,     setSucesso]     = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [diag,        setDiag]        = useState<DiagResult | null>(null);

  const [novoToken,       setNovoToken]       = useState("");
  const [salvandoToken,   setSalvandoToken]   = useState(false);
  const [tokenMsg,        setTokenMsg]        = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("prestadores")
        .select("nome_artistico, meta_ad_account_id")
        .eq("id", id)
        .single();
      if (data) {
        setNome(data.nome_artistico);
        setAccountId(data.meta_ad_account_id ?? "");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleSalvarToken() {
    if (!novoToken.trim()) return;
    setSalvandoToken(true);
    setTokenMsg(null);
    try {
      const res  = await fetch("/api/meta/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: novoToken.trim() }),
      });
      const data = await res.json() as { ok: boolean; expira_em?: string; erro?: string };
      if (data.ok) {
        setTokenMsg({ ok: true, texto: `Token salvo! Expira em: ${data.expira_em ?? "desconhecido"}` });
        setNovoToken("");
        setDiag(null);
      } else {
        setTokenMsg({ ok: false, texto: data.erro ?? "Erro ao salvar token" });
      }
    } catch {
      setTokenMsg({ ok: false, texto: "Erro de rede ao salvar token" });
    } finally {
      setSalvandoToken(false);
    }
  }

  async function handleVerificar() {
    const cleaned = accountId.trim().replace(/^act_/i, "");
    setVerificando(true);
    setDiag(null);
    try {
      const res  = await fetch(`/api/meta/verificar?account_id=${cleaned}`);
      const data = await res.json() as DiagResult;
      setDiag(data);
    } catch {
      setDiag({ ok: false, token_erro: "Erro de rede ao verificar" });
    } finally {
      setVerificando(false);
    }
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);

    const cleaned = accountId.trim().replace(/^act_/i, "");
    if (!cleaned) {
      setErro("Informe o ID da conta de anúncios.");
      return;
    }
    if (!/^\d+$/.test(cleaned)) {
      setErro("O ID da conta deve conter apenas números (ex: 1234567890).");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("prestadores")
      .update({
        meta_ad_account_id: cleaned,
        meta_sync_status:   "pendente",
      })
      .eq("id", id);

    setSaving(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setSucesso(true);
    setTimeout(() => router.push(`/prestador/${id}?tab=campanha`), 1200);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-brand-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/" className="hover:text-gray-600 transition">Prestadores</Link>
          <span>/</span>
          <Link href={`/prestador/${id}`} className="hover:text-gray-600 transition truncate max-w-[180px]">{nome}</Link>
          <span>/</span>
          <span className="text-gray-600">Configurar Meta Ads</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Configurar Meta Ads</h1>
              <p className="text-sm text-gray-500">{nome}</p>
            </div>
          </div>

          {/* Instruções */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-blue-800 mb-1">Como encontrar o ID da conta?</p>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Acesse o <strong>Gerenciador de Anúncios</strong> do Meta</li>
              <li>Na URL, copie o número após <code className="bg-blue-100 px-1 rounded">act_</code></li>
              <li>Exemplo: <code className="bg-blue-100 px-1 rounded">act_1234567890</code> → ID: <strong>1234567890</strong></li>
            </ol>
          </div>

          <form onSubmit={handleSalvar} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ID da Conta de Anúncios
              </label>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-400 focus-within:border-brand-400 transition">
                <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 select-none">
                  act_
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="1234567890"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value.replace(/[^0-9]/g, ""))}
                  className="flex-1 px-3 py-2.5 text-sm outline-none bg-white"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Apenas dígitos — sem o prefixo "act_"
              </p>
            </div>

            {/* Botão verificar */}
            <button
              type="button"
              onClick={handleVerificar}
              disabled={verificando || !accountId.trim()}
              className="w-full py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
            >
              {verificando ? "Verificando..." : "🔍 Verificar conexão com Meta"}
            </button>

            {/* Resultado diagnóstico */}
            {diag && (
              <div className={`rounded-xl border p-4 text-sm space-y-3 ${diag.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={`font-semibold ${diag.ok ? "text-green-800" : "text-red-800"}`}>
                  {diag.ok ? "✓ Tudo certo — pronto para sincronizar" : "✕ Problema encontrado"}
                </p>

                {/* Token info */}
                <div className="bg-white/60 rounded-lg p-3 space-y-1">
                  {diag.token_fonte && (
                    <p className="text-gray-500 text-xs">Fonte do token: <span className="font-mono">{diag.token_fonte}</span></p>
                  )}
                  {diag.token_usuario && (
                    <p className="text-gray-700">Token pertence a: <strong>{diag.token_usuario}</strong>
                      {diag.token_usuario_id && <span className="text-gray-400 text-xs ml-1">(ID: {diag.token_usuario_id})</span>}
                    </p>
                  )}
                  {diag.token_expira_em && (
                    <p className="text-gray-700">Expira em: <strong>{diag.token_expira_em}</strong></p>
                  )}
                  {diag.token_tem_ads_read === true && (
                    <p className="text-green-700 text-xs">✓ Permissão ads_read OK</p>
                  )}
                  {diag.token_tem_ads_read === false && (
                    <p className="text-red-700">⚠ Token sem permissão <code>ads_read</code> — gere um novo token com essa permissão</p>
                  )}
                  {diag.token_erro && (
                    <p className="text-red-700">Erro no token: {diag.token_erro}</p>
                  )}
                </div>

                {/* Conta testada */}
                {diag.conta_acessivel === true && (
                  <p className="text-green-700">✓ Conta <strong>{diag.conta_nome}</strong> ({diag.conta_status}) acessível</p>
                )}
                {diag.conta_acessivel === false && (
                  <div className="space-y-2">
                    <div className="bg-red-100 rounded-lg p-3">
                      <p className="text-red-800 font-medium">Conta ID {diag.account_id_testado} — sem acesso</p>
                      <p className="text-red-700 text-xs mt-1">{diag.conta_erro}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                      <p className="font-semibold">Como resolver:</p>
                      <p>1. Acesse <strong>business.facebook.com → Configurações → Contas de Anúncios</strong></p>
                      <p>2. Selecione a conta e clique em <strong>"Adicionar Pessoas"</strong></p>
                      <p>3. Adicione o usuário <strong>{diag.token_usuario ?? "do token"}</strong> como <strong>Admin ou Analista</strong></p>
                      <p>4. Clique em "Verificar" novamente</p>
                    </div>
                  </div>
                )}

                {/* Lista de contas acessíveis */}
                {diag.contas_acessiveis && diag.contas_acessiveis.length > 0 && (
                  <div>
                    <p className="text-gray-700 font-medium">
                      {diag.conta_acessivel === false
                        ? "Contas que este token PODE acessar — clique para usar:"
                        : "Contas acessíveis pelo token:"}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {diag.contas_acessiveis.map((c) => (
                        <li key={c.id}
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs border ${
                            c.id === accountId
                              ? "bg-green-50 border-green-300 text-green-800"
                              : "bg-white border-gray-200 text-gray-700"
                          }`}
                        >
                          <span>
                            <span className="font-mono font-bold">{c.id}</span>
                            <span className="ml-2 text-gray-500">{c.nome}</span>
                            <span className="ml-1 text-gray-400">({c.status})</span>
                          </span>
                          {c.id !== accountId && (
                            <button
                              type="button"
                              onClick={() => setAccountId(c.id)}
                              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition shrink-0"
                            >
                              Usar este ID
                            </button>
                          )}
                          {c.id === accountId && (
                            <span className="text-green-700 font-medium shrink-0">✓ selecionado</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diag.contas_acessiveis?.length === 0 && diag.token_valido && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <p className="font-semibold">Token válido mas sem acesso a nenhuma conta de anúncios.</p>
                    <p className="mt-1">Certifique-se que o usuário <strong>{diag.token_usuario}</strong> foi adicionado como administrador de pelo menos uma conta de anúncios no Meta Business Manager.</p>
                  </div>
                )}
              </div>
            )}

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            {sucesso && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Salvo! Redirecionando…
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || sucesso}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Salvando…
                  </>
                ) : "Salvar configuração"}
              </button>
              <Link
                href={`/prestador/${id}`}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>

        {/* Painel de atualização de token */}
        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-800 mb-1">Atualizar token Meta</p>
          <p className="text-xs text-gray-500 mb-3">
            Cole aqui um token do <strong>Graph API Explorer</strong>. O sistema converte automaticamente
            para token de longa duração (~60 dias) e salva no banco — sem precisar editar o servidor.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="EAAxxxxxx..."
              value={novoToken}
              onChange={(e) => setNovoToken(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
            <button
              type="button"
              onClick={handleSalvarToken}
              disabled={salvandoToken || !novoToken.trim()}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shrink-0"
            >
              {salvandoToken ? "Salvando..." : "Salvar token"}
            </button>
          </div>
          {tokenMsg && (
            <p className={`mt-2 text-xs ${tokenMsg.ok ? "text-green-700" : "text-red-700"}`}>
              {tokenMsg.ok ? "✓" : "✕"} {tokenMsg.texto}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Para nunca mais ter esse problema, crie um <strong>Usuário do Sistema</strong> no Meta Business Manager
            e gere um token permanente (não expira).
          </p>
        </div>
      </div>
    </div>
  );
}
