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

function buildContent(content: string, arquivos: ChatArquivo[]): Anthropic.MessageParam["content"] {
  const imagens = arquivos.filter((a) =>
    ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(a.tipo)
  );
  if (imagens.length === 0) return content;

  return [
    ...imagens.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "url", url: img.url },
      })
    ),
    { type: "text", text: content },
  ];
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

      try {
        // 2. Histórico de mensagens
        const { data: historico } = await supabase
          .from("chat_mensagens")
          .select("role, content, arquivos")
          .eq("sessao_id", body.sessao_id)
          .order("criado_em", { ascending: true })
          .limit(40);

        const mensagens: Anthropic.MessageParam[] = (historico ?? []).map((m: MsgRow) => ({
          role: m.role,
          content: buildContent(m.content, m.arquivos ?? []),
        }));

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
