"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMensagem, ChatArquivo } from "@/lib/types";
import PromptsBase from "./PromptsBase";
import type { ChatTipo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown } from "lucide-react";

interface MensagemTemporaria {
  id: string;
  role: "user" | "assistant";
  content: string;
  arquivos: ChatArquivo[];
  criado_em: string;
  streaming?: boolean;
}

interface Props {
  mensagens: (ChatMensagem | MensagemTemporaria)[];
  streamingText: string;
  isStreaming: boolean;
  isEmpty: boolean;
  onPromptBase: (prompt: string, tipo: ChatTipo) => void;
  hasMoreMsgs?: boolean;
  carregandoMais?: boolean;
  onCarregarMais?: () => void;
  userInitial?: string;
}

function Bolha({
  msg,
  userInitial,
}: {
  msg: ChatMensagem | MensagemTemporaria;
  userInitial?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const isIA = msg.role === "assistant";

  function copiar() {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className={`flex gap-3 group ${isIA ? "" : "flex-row-reverse"}`}>
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
          isIA ? "bg-brand-100 text-brand-700" : "bg-slate-600 text-white"
        }`}
      >
        {isIA ? "C" : (userInitial ?? "U")}
      </div>

      <div className={`flex flex-col gap-1 max-w-[78%] ${isIA ? "" : "items-end"}`}>
        {(msg.arquivos ?? []).length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${isIA ? "" : "justify-end"}`}>
            {msg.arquivos.map((a, i) =>
              a.tipo.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={a.url}
                  alt={a.nome}
                  className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                />
              ) : (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 transition"
                >
                  📄 {a.nome}
                </a>
              )
            )}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isIA
              ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
              : "bg-brand-600 text-white rounded-tr-sm"
          } ${"streaming" in msg && msg.streaming ? "opacity-80" : ""}`}
        >
          {isIA ? (
            <div className="prose prose-base max-w-none prose-p:my-1.5 prose-headings:mb-2 prose-headings:mt-3 prose-li:my-0.5 prose-code:text-brand-700 prose-code:bg-brand-50 prose-code:px-1 prose-code:rounded prose-p:text-[15px] prose-li:text-[15px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>

        {isIA && (
          <Button
            variant="ghost"
            onClick={copiar}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-gray-600 transition-opacity self-start ml-1 h-auto p-0 font-normal"
          >
            {copiado ? "✓ Copiado" : "Copiar"}
          </Button>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
        C
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({
  mensagens,
  streamingText,
  isStreaming,
  isEmpty,
  onPromptBase,
  hasMoreMsgs,
  carregandoMais,
  onCarregarMais,
  userInitial,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mostrarScrollBtn, setMostrarScrollBtn] = useState(false);

  const lastMsgIdRef = useRef<string | undefined>();
  const prevScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isPrependingRef.current) {
      const delta = container.scrollHeight - prevScrollHeightRef.current;
      container.scrollTop = delta;
      isPrependingRef.current = false;
    } else {
      const lastId = mensagens[mensagens.length - 1]?.id;
      if (lastId !== lastMsgIdRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        lastMsgIdRef.current = lastId;
      }
    }
    prevScrollHeightRef.current = container.scrollHeight;
  }, [mensagens]);

  useEffect(() => {
    if (streamingText) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingText]);

  function handleCarregarMais() {
    const container = containerRef.current;
    if (!container || !onCarregarMais) return;
    prevScrollHeightRef.current = container.scrollHeight;
    isPrependingRef.current = true;
    onCarregarMais();
  }

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    setMostrarScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    // Dispara carregamento automático ao chegar perto do topo (dentro de 80px)
    if (el.scrollTop < 80 && hasMoreMsgs && !carregandoMais) {
      handleCarregarMais();
    }
  }

  return (
    <div className="relative flex-1 min-h-0">
      {isEmpty ? (
        <PromptsBase onSelect={onPromptBase} />
      ) : (
        // absolute inset-0 garante altura definida para o overflow-y-auto funcionar
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto px-4 py-5 space-y-4"
        >
          {hasMoreMsgs && (
            <div className="flex justify-center pb-2">
              <Button
                variant="outline"
                onClick={handleCarregarMais}
                disabled={carregandoMais}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg bg-white transition disabled:opacity-50 flex items-center gap-1.5 h-auto"
              >
                {carregandoMais ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  "↑ Carregar mensagens anteriores"
                )}
              </Button>
            </div>
          )}

          {mensagens.map((m) => (
            <Bolha key={m.id} msg={m} userInitial={userInitial} />
          ))}

          {isStreaming && streamingText && (
            <Bolha
              msg={{
                id: "streaming",
                role: "assistant",
                content: streamingText,
                arquivos: [],
                criado_em: new Date().toISOString(),
                streaming: true,
              }}
              userInitial={userInitial}
            />
          )}

          {isStreaming && !streamingText && <TypingIndicator />}

          <div ref={bottomRef} className="h-2" />
        </div>
      )}

      {!isEmpty && mostrarScrollBtn && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-4 right-4 w-8 h-8 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-500 hover:bg-gray-50 transition z-10 p-0"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export type { MensagemTemporaria };
