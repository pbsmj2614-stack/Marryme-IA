/**
 * POST /api/chat/mensagem
 * Body: { sessao_id, prestador_id, content, arquivos? }
 *
 * Fluxo:
 * 1. Salva mensagem do usuário
 * 2. Busca histórico (últimas 40 mensagens)
 * 3. Monta system prompt com CONTEXT.md + dados do prestador
 * 4. Chama Claude com streaming
 * 5. Stream SSE para o cliente
 * 6. Ao terminar, salva resposta + atualiza tokens_usados
 *
 * SSE format:
 *   data: {"delta":"texto"}\n\n
 *   data: {"done":true,"tokens":N}\n\n
 *   data: {"error":"msg"}\n\n
 */

export const runtime = "nodejs";

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { montarSystemPrompt } from "@/lib/chat/montar-contexto";
import type { ChatArquivo } from "@/lib/types";

type MsgRow = { role: "user" | "assistant"; content: string; arquivos: ChatArquivo[] };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

// Baixa arquivo via URL pública (bucket é PUBLIC — não precisa do SDK Supabase)
async function baixarBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[baixarBuffer] HTTP", res.status, res.statusText, url);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    console.log("[baixarBuffer] ok — bytes:", buf.byteLength, "url:", url.slice(-80));
    return buf;
  } catch (e) {
    console.error("[baixarBuffer] fetch error:", e);
    return null;
  }
}

async function buildContent(
  content: string,
  arquivos: ChatArquivo[]
): Promise<Anthropic.MessageParam["content"]> {
  const imagens = arquivos.filter((a) => (IMAGE_TYPES as readonly string[]).includes(a.tipo));
  const pdfs = arquivos.filter((a) => a.tipo === "application/pdf");
  const textos = arquivos.filter((a) => a.tipo === "text/plain");

  if (imagens.length === 0 && pdfs.length === 0 && textos.length === 0) return content;

  const imagemBlocos = await Promise.all(
    imagens.map(async (img): Promise<Anthropic.ImageBlockParam> => {
      const buf = await baixarBuffer(img.url);
      if (buf) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: img.tipo as ImageMediaType,
            data: buf.toString("base64"),
          },
        };
      }
      return { type: "image", source: { type: "url", url: img.url } };
    })
  );

  // PDFs: extrai texto com pdf-parse → bloco de texto puro (compatível com qualquer modelo Claude)
  const pdfBlocos = await Promise.all(
    pdfs.map(async (pdf): Promise<Anthropic.TextBlockParam> => {
      const buf = await baixarBuffer(pdf.url);
      if (!buf) {
        return { type: "text", text: `[PDF: ${pdf.nome} — não foi possível baixar]` };
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (
          buf: Buffer
        ) => Promise<{ text: string; numpages: number }>;
        const parsed = await pdfParse(buf);
        const texto = parsed.text?.trim();
        if (!texto) {
          return {
            type: "text",
            text: `[PDF: ${pdf.nome} — PDF baseado em imagem, sem camada de texto. Peça ao usuário para enviar as páginas como imagem ou copiar o conteúdo.]`,
          };
        }
        return {
          type: "text",
          text: `=== PDF: ${pdf.nome} (${parsed.numpages} p.) ===\n${texto}\n===`,
        };
      } catch (e) {
        console.error("[buildContent] pdf-parse error:", e);
        return { type: "text", text: `[PDF: ${pdf.nome} — erro ao extrair texto]` };
      }
    })
  );

  const textoBlocos = await Promise.all(
    textos.map(async (txt): Promise<Anthropic.TextBlockParam> => {
      try {
        const res = await fetch(txt.url);
        if (res.ok) {
          const conteudo = await res.text();
          return { type: "text", text: `=== ${txt.nome} ===\n${conteudo}\n===` };
        }
      } catch (e) {
        console.error("[buildContent] text fetch error:", e);
      }
      return { type: "text", text: `[Arquivo de texto: ${txt.nome} — não foi possível carregar]` };
    })
  );

  return [...imagemBlocos, ...pdfBlocos, ...textoBlocos, { type: "text", text: content }];
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const body = (await req.json().catch(() => null)) as {
    sessao_id: string;
    prestador_id: string;
    content: string;
    arquivos?: ChatArquivo[];
  } | null;

  if (!body?.sessao_id || !body?.prestador_id || !body?.content) {
    return new Response(
      `data: ${JSON.stringify({ error: "sessao_id, prestador_id e content são obrigatórios" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const supabase = supabaseAdmin();

  // 1. Salva mensagem do usuário
  await supabase.from("chat_mensagens").insert({
    sessao_id: body.sessao_id,
    role: "user",
    content: body.content,
    arquivos: body.arquivos ?? [],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      // Keepalive: evita timeout em proxies/conexões lentas (a cada 20s)
      const heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          /* fechado */
        }
      }, 20_000);

      try {
        // 2. Histórico de mensagens
        const { data: historico } = await supabase
          .from("chat_mensagens")
          .select("role, content, arquivos")
          .eq("sessao_id", body.sessao_id)
          .order("criado_em", { ascending: true })
          .limit(40);

        const mensagens: Anthropic.MessageParam[] = await Promise.all(
          (historico ?? []).map(async (m: MsgRow) => ({
            role: m.role,
            content: await buildContent(m.content, m.arquivos ?? []),
          }))
        );

        // 3. System prompt
        const systemPrompt = await montarSystemPrompt(body.prestador_id);

        // 4. Stream Claude
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        let fullText = "";
        let inputTokens = 0;
        let outputTokens = 0;

        const claudeStream = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages: mensagens,
        });

        for await (const chunk of claudeStream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            fullText += chunk.delta.text;
            send({ delta: chunk.delta.text });
          }
          if (chunk.type === "message_delta" && chunk.usage) {
            outputTokens = chunk.usage.output_tokens ?? 0;
          }
          if (chunk.type === "message_start" && chunk.message.usage) {
            inputTokens = chunk.message.usage.input_tokens ?? 0;
          }
        }

        const totalTokens = inputTokens + outputTokens;

        // 5. Salva resposta da IA
        await supabase.from("chat_mensagens").insert({
          sessao_id: body.sessao_id,
          role: "assistant",
          content: fullText,
          arquivos: [],
        });

        // Atualiza tokens acumulados na sessão
        const { data: sessao } = await supabase
          .from("chat_sessoes")
          .select("tokens_usados")
          .eq("id", body.sessao_id)
          .single();

        await supabase
          .from("chat_sessoes")
          .update({ tokens_usados: (sessao?.tokens_usados ?? 0) + totalTokens })
          .eq("id", body.sessao_id);

        send({ done: true, tokens: totalTokens });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(heartbeatId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
