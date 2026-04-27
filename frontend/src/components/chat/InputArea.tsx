"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type DragEvent,
} from "react";
import type { ChatArquivo } from "@/lib/types";

const TIPOS_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
];
const MAX_ARQUIVOS = 10;
const MAX_TOTAL_MB = 50;

interface Props {
  prestadorId: string;
  sessaoId: string;
  disabled?: boolean;
  onEnviar: (content: string, arquivos: ChatArquivo[]) => void;
}

interface ArquivoPreview {
  file: File;
  preview?: string;
  uploading: boolean;
  url?: string;
  erro?: string;
}

export default function InputArea({ prestadorId, sessaoId, disabled, onEnviar }: Props) {
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<ArquivoPreview[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Diretório de upload estável — fallback para antes da sessão existir
  const uploadDirRef = useRef<string>(sessaoId || `tmp-${Date.now()}`);
  useEffect(() => {
    if (sessaoId) uploadDirRef.current = sessaoId;
  }, [sessaoId]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 88) + "px";
  }, []);

  async function uploadArquivo(file: File, idx: number) {
    // Upload via API route server-side (usa supabaseAdmin — sem dependência de políticas de bucket)
    const form = new FormData();
    form.append("file", file);
    form.append("prestadorId", prestadorId);
    form.append("dir", uploadDirRef.current);

    const res = await fetch("/api/chat/upload", { method: "POST", body: form });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setArquivos((prev) =>
        prev.map((a, i) =>
          i === idx ? { ...a, uploading: false, erro: body.error ?? "Falha no upload" } : a
        )
      );
      return;
    }

    const { url } = (await res.json()) as { url: string };
    setArquivos((prev) => prev.map((a, i) => (i === idx ? { ...a, uploading: false, url } : a)));
  }

  function adicionarArquivos(files: File[]) {
    const existentes = arquivos.length;
    const validos = files
      .filter((f) => TIPOS_ACEITOS.includes(f.type))
      .slice(0, MAX_ARQUIVOS - existentes);

    if (validos.length === 0) return;

    const totalMB =
      [...arquivos, ...validos].reduce(
        (s, a) =>
          s + ("size" in a ? (a as { size: number }).size : (a as ArquivoPreview).file.size),
        0
      ) /
      1024 /
      1024;
    if (totalMB > MAX_TOTAL_MB) return;

    const novos: ArquivoPreview[] = validos.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      uploading: true,
    }));

    // setState puro — uploads disparados depois, fora do updater
    setArquivos((prev) => [...prev, ...novos]);
    validos.forEach((file, i) => {
      void uploadArquivo(file, existentes + i);
    });
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => {
      const a = prev[idx];
      if (a.preview) URL.revokeObjectURL(a.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function enviar() {
    const t = texto.trim();
    if (!t || disabled) return;
    const pendente = arquivos.some((a) => a.uploading);
    if (pendente) return;

    const chatArquivos: ChatArquivo[] = arquivos
      .filter((a) => a.url)
      .map((a) => ({
        nome: a.file.name,
        url: a.url!,
        tipo: a.file.type,
        tamanho: a.file.size,
      }));

    onEnviar(t, chatArquivos);
    setTexto("");
    setArquivos([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    adicionarArquivos(Array.from(e.dataTransfer.files));
  }

  const podaEnviar = texto.trim().length > 0 && !disabled && !arquivos.some((a) => a.uploading);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={handleDrop}
      className={`border-t border-gray-200 bg-white px-4 py-3 transition-colors ${arrastando ? "bg-brand-50 border-brand-300" : ""}`}
    >
      {/* Previews de arquivos */}
      {arquivos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {arquivos.map((a, i) => (
            <div
              key={i}
              title={a.erro ?? undefined}
              className={`relative flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs border ${
                a.erro
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-gray-100 border-gray-200 text-gray-600"
              }`}
            >
              {a.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.preview} alt={a.file.name} className="w-8 h-8 object-cover rounded" />
              ) : (
                <span className="text-base">{a.erro ? "⚠️" : "📄"}</span>
              )}
              <div className="flex flex-col min-w-0">
                <span className="max-w-[100px] truncate">{a.file.name}</span>
                {a.erro && (
                  <span className="text-[10px] text-red-500 truncate max-w-[100px]">
                    Falha no upload
                  </span>
                )}
              </div>
              {a.uploading && (
                <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <button
                onClick={() => removerArquivo(i)}
                className={`ml-1 shrink-0 hover:opacity-80 ${a.erro ? "text-red-400" : "text-gray-400 hover:text-gray-700"}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Botão de upload */}
        <button
          type="button"
          onClick={() => inputFileRef.current?.click()}
          disabled={disabled}
          title="Anexar arquivo"
          className="shrink-0 p-2 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition disabled:opacity-40"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
            />
          </svg>
        </button>
        <input
          ref={inputFileRef}
          type="file"
          multiple
          accept={TIPOS_ACEITOS.join(",")}
          className="hidden"
          onChange={(e) => adicionarArquivos(Array.from(e.target.files ?? []))}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            arrastando ? "Solte aqui…" : "Mensagem… (Enter envia, Shift+Enter quebra linha)"
          }
          rows={1}
          className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent transition disabled:opacity-50"
          style={{ minHeight: "40px", maxHeight: "88px" }}
        />

        {/* Botão enviar */}
        <button
          type="button"
          onClick={enviar}
          disabled={!podaEnviar}
          className="shrink-0 w-10 h-10 flex items-center justify-center bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition"
        >
          {disabled ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          )}
        </button>
      </div>

      {arrastando && <p className="text-center text-xs text-brand-500 mt-2">Solte para anexar</p>}
    </div>
  );
}
