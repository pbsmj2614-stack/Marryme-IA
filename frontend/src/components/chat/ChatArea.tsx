"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMensagem, ChatArquivo } from "@/lib/types";
import PromptsBase from "./PromptsBase";
import type { ChatTipo } from "@/lib/types";

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
}

function Bolha({ msg }: { msg: ChatMensagem | MensagemTemporaria }) {
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
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
          isIA ? "bg-brand-100 text-brand-700" : "bg-gray-200 text-gray-600"
        }`}
      >
        {isIA ? "IA" : "Vc"}
      </div>

      {/* Conteúdo */}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isIA ? "" : "items-end"}`}>
        {/* Arquivos anexados */}
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

        {/* Bolha de texto */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isIA
              ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
              : "bg-brand-600 text-white rounded-tr-sm"
          } ${"streaming" in msg && msg.streaming ? "animate-pulse" : ""}`}
        >
          {isIA ? (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:mb-2 prose-headings:mt-3 prose-li:my-0 prose-code:text-brand-700 prose-code:bg-brand-50 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>

        {/* Botão copiar (IA) */}
        {isIA && (
          <button
            onClick={copiar}
            className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-700 transition-opacity self-start ml-1"
          >
            {copiado ? "✓ Copiado" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
        IA
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
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
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mostrarScrollBtn, setMostrarScrollBtn] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, streamingText]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanciaFundo = el.scrollHeight - el.scrollTop - el.clientHeight;
    setMostrarScrollBtn(distanciaFundo > 200);
  }

  if (isEmpty) {
    return <PromptsBase onSelect={onPromptBase} />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-5 space-y-4"
      >
        {mensagens.map((m) => (
          <Bolha key={m.id} msg={m} />
        ))}

        {/* Streaming atual */}
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
          />
        )}

        {/* Typing indicator quando aguarda primeiro delta */}
        {isStreaming && !streamingText && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Botão "ir para o fim" */}
      {mostrarScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-4 right-4 w-8 h-8 bg-white border border-gray-300 rounded-full shadow flex items-center justify-center text-gray-500 hover:bg-gray-50 transition"
        >
          ↓
        </button>
      )}
    </div>
  );
}

export type { MensagemTemporaria };
