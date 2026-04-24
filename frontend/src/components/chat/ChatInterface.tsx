"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatSessao, ChatMensagem, ChatArquivo, ChatTipo, Roteiro } from "@/lib/types";
import SidebarSessoes from "./SidebarSessoes";
import ChatArea from "./ChatArea";
import InputArea from "./InputArea";
import RoteiroPainel from "./RoteiroPainel";

const MSGS_POR_PAGINA = 30;

interface SecaoAprovada {
  titulo: string;
  conteudo: string;
  aprovada_em: string;
}

type TabMobile = "chat" | "roteiro" | "historico";

interface Props {
  prestadorId: string;
  roteirosAntigos: Roteiro[];
  sessaoInicial?: string;
}

export default function ChatInterface({ prestadorId, roteirosAntigos, sessaoInicial }: Props) {
  const [sessoes, setSessoes] = useState<ChatSessao[]>([]);
  const [sessaoAtiva, setSessaoAtiva] = useState<string | null>(sessaoInicial ?? null);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [secoes, setSecoes] = useState<SecaoAprovada[]>([]);
  const [tabMobile, setTabMobile] = useState<TabMobile>("chat");
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [carregandoMaisAntigos, setCarregandoMaisAntigos] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Se veio com sessaoInicial, não precisa auto-selecionar a primeira da lista
  const autoSelecionadoRef = useRef(!!sessaoInicial);

  // Busca sessões do prestador — deps só em prestadorId para não re-fetchar a cada troca de sessão
  const carregarSessoes = useCallback(async () => {
    const res = await fetch(`/api/chat/sessoes?prestador_id=${prestadorId}`);
    const data = (await res.json()) as { sessoes: ChatSessao[] };
    setSessoes(data.sessoes ?? []);
    if (!autoSelecionadoRef.current && data.sessoes?.[0]) {
      setSessaoAtiva(data.sessoes[0].id);
      autoSelecionadoRef.current = true;
    }
  }, [prestadorId]);

  useEffect(() => {
    carregarSessoes();
  }, [carregarSessoes]);

  // Busca as últimas MSGS_POR_PAGINA mensagens (desc → reverse = ordem cronológica)
  useEffect(() => {
    if (!sessaoAtiva) {
      setMensagens([]);
      setHasMoreMsgs(false);
      return;
    }
    setCarregandoMsgs(true);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    fetch(
      `${supabaseUrl}/rest/v1/chat_mensagens?sessao_id=eq.${sessaoAtiva}&order=criado_em.desc&limit=${MSGS_POR_PAGINA}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
      .then((r) => r.json())
      .then((data: ChatMensagem[]) => {
        const msgs = (data ?? []).reverse();
        setMensagens(msgs);
        setHasMoreMsgs((data ?? []).length === MSGS_POR_PAGINA);
      })
      .finally(() => setCarregandoMsgs(false));
  }, [sessaoAtiva]);

  // Carrega mais mensagens antigas (paginação para cima)
  async function carregarMaisAntigos() {
    if (!sessaoAtiva || carregandoMaisAntigos) return;
    setCarregandoMaisAntigos(true);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const data = (await fetch(
      `${supabaseUrl}/rest/v1/chat_mensagens?sessao_id=eq.${sessaoAtiva}&order=criado_em.desc&limit=${MSGS_POR_PAGINA}&offset=${mensagens.length}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
      .then((r) => r.json())
      .catch(() => [])) as ChatMensagem[];

    const novos = (data ?? []).reverse();
    setMensagens((prev) => [...novos, ...prev]);
    setHasMoreMsgs(data.length === MSGS_POR_PAGINA);
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
    setSecoes([]);
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

  // Troca de sessão: cancela stream em andamento antes de trocar
  function selecionarSessao(id: string) {
    if (id === sessaoAtiva) return;
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText("");
    setSessaoAtiva(id);
    setTabMobile("chat");
  }

  async function enviarMensagem(content: string, arquivos: ChatArquivo[]) {
    let sid = sessaoAtiva;

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
            try {
              const payload = JSON.parse(line.slice(6)) as {
                delta?: string;
                done?: boolean;
                error?: string;
              };
              if (payload.error) throw new Error(payload.error);
              if (payload.delta) {
                fullText += payload.delta;
                setStreamingText(fullText);
              }
              if (payload.done) break;
            } catch {
              // continua
            }
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
    criarSessao(prompt.slice(0, 50), tipo).then(() => {
      enviarMensagem(prompt, []);
    });
  }

  function copiarTudo() {
    const texto = secoes.map((s) => `## ${s.titulo}\n\n${s.conteudo}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(texto);
  }

  async function finalizar() {
    if (!sessaoAtiva) return;
    const roteiro = Object.fromEntries(secoes.map((s) => [s.titulo, s.conteudo]));
    await fetch("/api/chat/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessaoAtiva, status: "finalizada", roteiro_final: roteiro }),
    });
    setSessoes((prev) =>
      prev.map((s) => (s.id === sessaoAtiva ? { ...s, status: "finalizada" } : s))
    );
  }

  const isEmpty = mensagens.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col flex-1">
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
            {t === "chat" ? "💬 Chat" : t === "roteiro" ? "📄 Roteiro" : "📁 Histórico"}
          </button>
        ))}
      </div>

      {/* Layout desktop: sidebar | chat | roteiro */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`w-[260px] shrink-0 border-r border-gray-200 bg-white overflow-hidden ${
            tabMobile === "historico" ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          }`}
        >
          <SidebarSessoes
            sessoes={sessoes}
            sessaoAtiva={sessaoAtiva}
            onSelecionar={selecionarSessao}
            onNova={() => criarSessao()}
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
          {/* Título da sessão ativa */}
          {sessaoAtiva && (
            <div className="px-4 py-2.5 border-b border-gray-100 bg-white">
              <p className="text-xs font-semibold text-gray-700 truncate">
                {sessoes.find((s) => s.id === sessaoAtiva)?.titulo ?? "Conversa"}
              </p>
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
            />
          )}

          <InputArea
            key={sessaoAtiva ?? "new"}
            prestadorId={prestadorId}
            sessaoId={sessaoAtiva ?? ""}
            disabled={isStreaming}
            onEnviar={enviarMensagem}
          />
        </div>

        {/* Painel do roteiro */}
        <aside
          className={`w-[380px] xl:w-[420px] shrink-0 border-l border-gray-200 bg-white overflow-hidden ${
            tabMobile === "roteiro" ? "flex flex-col w-full" : "hidden lg:flex lg:flex-col"
          }`}
        >
          <RoteiroPainel
            secoes={secoes}
            roteirosAntigos={roteirosAntigos}
            onCopiarTudo={copiarTudo}
            onFinalizar={finalizar}
            onUsarComoBase={(c) => enviarMensagem(c, [])}
          />
        </aside>
      </div>
    </div>
  );
}
