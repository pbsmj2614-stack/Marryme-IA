"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatSessao, ChatMensagem, ChatArquivo, ChatTipo, Roteiro } from "@/lib/types";
import { createClient } from "@/lib/supabase";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import SidebarSessoes from "./SidebarSessoes";
import ChatArea from "./ChatArea";
import InputArea from "./InputArea";
import RoteiroPainel from "./RoteiroPainel";

const MSGS_POR_PAGINA = 30;

type TabMobile = "chat" | "roteiro" | "historico";

interface Props {
  prestadorId: string;
  roteirosAntigos: Roteiro[];
  sessaoInicial?: string;
}

export default function ChatInterface({ prestadorId, roteirosAntigos, sessaoInicial }: Props) {
  const { user } = useCurrentUser();
  const userInitial = (
    user?.user_metadata?.full_name?.[0] ??
    user?.user_metadata?.name?.[0] ??
    user?.email?.[0] ??
    "U"
  ).toUpperCase();

  const [sessoes, setSessoes] = useState<ChatSessao[]>([]);
  const [sessaoAtiva, setSessaoAtiva] = useState<string | null>(sessaoInicial ?? null);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [tabMobile, setTabMobile] = useState<TabMobile>("chat");
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [carregandoMaisAntigos, setCarregandoMaisAntigos] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoSelecionadoRef = useRef(!!sessaoInicial);
  const sessaoInicialRef = useRef(sessaoInicial);

  // Cancela stream em andamento ao desmontar o componente (evita request órfã)
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  // Persiste sessão ativa no sessionStorage para sobreviver à navegação entre abas
  useEffect(() => {
    if (sessaoAtiva) {
      sessionStorage.setItem(`mm_sessao_${prestadorId}`, sessaoAtiva);
    }
  }, [sessaoAtiva, prestadorId]);

  const sessaoAtivaObj = sessoes.find((s) => s.id === sessaoAtiva);

  const carregarSessoes = useCallback(async () => {
    const res = await fetch(`/api/chat/sessoes?prestador_id=${prestadorId}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { sessoes: ChatSessao[] };
    setSessoes(data.sessoes ?? []);
    if (!autoSelecionadoRef.current) {
      autoSelecionadoRef.current = true;
      const lista = data.sessoes ?? [];
      // Prefere: sessão da URL > última salva no sessionStorage > primeira da lista
      const stored = sessionStorage.getItem(`mm_sessao_${prestadorId}`);
      const preferida = sessaoInicialRef.current ?? stored ?? null;
      const existe = preferida ? lista.find((s) => s.id === preferida) : null;
      setSessaoAtiva(existe?.id ?? lista[0]?.id ?? null);
    }
  }, [prestadorId]);

  useEffect(() => {
    carregarSessoes();
  }, [carregarSessoes]);

  useEffect(() => {
    if (!sessaoAtiva) {
      setMensagens([]);
      setHasMoreMsgs(false);
      return;
    }
    setCarregandoMsgs(true);
    const sb = createClient();

    void (async () => {
      try {
        const { data } = await sb
          .from("chat_mensagens")
          .select("*")
          .eq("sessao_id", sessaoAtiva)
          .order("criado_em", { ascending: false })
          .limit(MSGS_POR_PAGINA);
        const msgs = ((data ?? []) as ChatMensagem[]).reverse();
        setMensagens(msgs);
        setHasMoreMsgs((data ?? []).length === MSGS_POR_PAGINA);
      } finally {
        setCarregandoMsgs(false);
      }
    })();
  }, [sessaoAtiva]);

  async function carregarMaisAntigos() {
    if (!sessaoAtiva || carregandoMaisAntigos) return;
    setCarregandoMaisAntigos(true);
    const sb = createClient();

    const { data } = await sb
      .from("chat_mensagens")
      .select("*")
      .eq("sessao_id", sessaoAtiva)
      .order("criado_em", { ascending: false })
      .limit(MSGS_POR_PAGINA)
      .range(mensagens.length, mensagens.length + MSGS_POR_PAGINA - 1);

    const novos = ((data ?? []) as ChatMensagem[]).reverse();
    setMensagens((prev) => [...novos, ...prev]);
    setHasMoreMsgs((data ?? []).length === MSGS_POR_PAGINA);
    setCarregandoMaisAntigos(false);
  }

  async function criarSessao(titulo?: string, tipo?: ChatTipo) {
    const res = await fetch("/api/chat/sessoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prestador_id: prestadorId, titulo, tipo }),
    });
    const data = (await res.json()) as { sessao: ChatSessao };
    setSessoes((prev) => [data.sessao, ...prev]);
    setSessaoAtiva(data.sessao.id);
    setMensagens([]);
    setHasMoreMsgs(false);
    return data.sessao;
  }

  async function renomearSessao(id: string, titulo: string) {
    await fetch("/api/chat/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, titulo }),
    });
    setSessoes((prev) => prev.map((s) => (s.id === id ? { ...s, titulo } : s)));
  }

  async function arquivarSessao(id: string) {
    await fetch("/api/chat/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "arquivada" }),
    });
    setSessoes((prev) => prev.filter((s) => s.id !== id));
    if (sessaoAtiva === id) {
      const proxima = sessoes.find((s) => s.id !== id);
      setSessaoAtiva(proxima?.id ?? null);
    }
  }

  function selecionarSessao(id: string) {
    if (id === sessaoAtiva) return;
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText("");
    setSessaoAtiva(id);
    setTabMobile("chat");
  }

  async function enviarMensagem(
    content: string,
    arquivos: ChatArquivo[],
    sessaoIdOverride?: string
  ) {
    let sid = sessaoIdOverride ?? sessaoAtiva;

    if (!sid) {
      const nova = await criarSessao(content.slice(0, 50));
      sid = nova.id;
    }

    const msgTemp: ChatMensagem = {
      id: `temp-${Date.now()}`,
      sessao_id: sid,
      role: "user",
      content,
      arquivos,
      criado_em: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, msgTemp]);
    setStreamingText("");
    setIsStreaming(true);
    setTabMobile("chat");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/mensagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessao_id: sid, prestador_id: prestadorId, content, arquivos }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let payload: { delta?: string; done?: boolean; error?: string };
            try {
              payload = JSON.parse(line.slice(6)) as {
                delta?: string;
                done?: boolean;
                error?: string;
              };
            } catch {
              continue; // ignora linhas com JSON malformado
            }
            if (payload.error) throw new Error(payload.error);
            if (payload.delta) {
              fullText += payload.delta;
              setStreamingText(fullText);
            }
            if (payload.done) break;
          }
        }
      }

      const msgIA: ChatMensagem = {
        id: `ia-${Date.now()}`,
        sessao_id: sid,
        role: "assistant",
        content: fullText,
        arquivos: [],
        criado_em: new Date().toISOString(),
      };
      setMensagens((prev) => [...prev, msgIA]);
      carregarSessoes();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msgErro: ChatMensagem = {
          id: `err-${Date.now()}`,
          sessao_id: sid,
          role: "assistant",
          content: "❌ Ocorreu um erro ao gerar a resposta. Tente novamente.",
          arquivos: [],
          criado_em: new Date().toISOString(),
        };
        setMensagens((prev) => [...prev, msgErro]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  }

  function handlePromptBase(prompt: string, tipo: ChatTipo) {
    criarSessao(prompt.slice(0, 50), tipo).then((nova) => {
      enviarMensagem(prompt, [], nova.id);
    });
  }

  async function finalizar() {
    if (!sessaoAtiva) return;
    await fetch("/api/chat/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessaoAtiva, status: "finalizada" }),
    });
    setSessoes((prev) =>
      prev.map((s) => (s.id === sessaoAtiva ? { ...s, status: "finalizada" } : s))
    );
  }

  const isEmpty = mensagens.length === 0 && !isStreaming;
  const podeFinalizarSessao =
    sessaoAtivaObj?.status === "ativa" && mensagens.length > 0 && !isStreaming;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tabs mobile */}
      <div className="flex lg:hidden border-b border-gray-200 bg-white">
        {(["chat", "roteiro", "historico"] as TabMobile[]).map((t) => (
          <button
            key={t}
            onClick={() => setTabMobile(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition ${
              tabMobile === t
                ? "text-brand-700 border-b-2 border-brand-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "chat" ? "💬 Chat" : t === "roteiro" ? "📄 Referência" : "📁 Histórico"}
          </button>
        ))}
      </div>

      {/* Layout desktop: sidebar | chat | painel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`w-[260px] shrink-0 border-r border-slate-700 overflow-hidden ${
            tabMobile === "historico" ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          }`}
        >
          <SidebarSessoes
            sessoes={sessoes}
            sessaoAtiva={sessaoAtiva}
            onSelecionar={selecionarSessao}
            onNova={() => {
              abortRef.current?.abort();
              setIsStreaming(false);
              setStreamingText("");
              setSessaoAtiva(null);
              setMensagens([]);
              setHasMoreMsgs(false);
              setTabMobile("chat");
            }}
            onRenomear={renomearSessao}
            onArquivar={arquivarSessao}
          />
        </aside>

        {/* Chat */}
        <div
          className={`flex flex-col flex-1 overflow-hidden ${
            tabMobile === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Barra de status da sessão ativa */}
          {sessaoAtiva && (
            <div className="px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-2 min-w-0">
              <p className="text-xs font-semibold text-gray-700 truncate flex-1">
                {sessaoAtivaObj?.titulo ?? "Conversa"}
              </p>

              {podeFinalizarSessao && (
                <button
                  onClick={finalizar}
                  className="shrink-0 text-xs px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                >
                  ✓ Finalizar sessão
                </button>
              )}

              {sessaoAtivaObj?.status === "finalizada" && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium whitespace-nowrap">
                  ◷ Aguarda revisão
                </span>
              )}

              {sessaoAtivaObj?.status === "aprovada" && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium whitespace-nowrap">
                  ✓ Aprovado
                </span>
              )}
            </div>
          )}

          {/* Skeleton loading */}
          {carregandoMsgs ? (
            <div className="flex-1 px-4 py-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                  <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse shrink-0" />
                  <div
                    className={`h-14 rounded-2xl bg-gray-100 animate-pulse ${i % 2 === 0 ? "w-48" : "w-64"}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ChatArea
              mensagens={mensagens}
              streamingText={streamingText}
              isStreaming={isStreaming}
              isEmpty={isEmpty}
              onPromptBase={handlePromptBase}
              hasMoreMsgs={hasMoreMsgs}
              carregandoMais={carregandoMaisAntigos}
              onCarregarMais={carregarMaisAntigos}
              userInitial={userInitial}
            />
          )}

          {/* Banner quando sessão está fechada */}
          {(sessaoAtivaObj?.status === "finalizada" || sessaoAtivaObj?.status === "aprovada") && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 text-center">
              {sessaoAtivaObj.status === "finalizada"
                ? "Sessão finalizada — acesse Aprovações para revisar ou reabrir."
                : "Sessão aprovada — reabra na aba Aprovações para editar."}
            </div>
          )}

          <InputArea
            key={sessaoAtiva ?? "new"}
            prestadorId={prestadorId}
            sessaoId={sessaoAtiva ?? ""}
            disabled={
              isStreaming ||
              sessaoAtivaObj?.status === "finalizada" ||
              sessaoAtivaObj?.status === "aprovada"
            }
            onEnviar={enviarMensagem}
          />
        </div>

        {/* Painel de referência */}
        <aside
          className={`w-[380px] xl:w-[420px] shrink-0 border-l border-gray-200 bg-white overflow-hidden ${
            tabMobile === "roteiro" ? "flex flex-col w-full" : "hidden lg:flex lg:flex-col"
          }`}
        >
          <RoteiroPainel
            sessaoStatus={sessaoAtivaObj?.status}
            onFinalizar={podeFinalizarSessao ? finalizar : undefined}
            roteirosAntigos={roteirosAntigos}
            onUsarComoBase={(c) => enviarMensagem(c, [])}
          />
        </aside>
      </div>
    </div>
  );
}
