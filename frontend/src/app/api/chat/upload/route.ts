export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Fallback de MIME por extensão — browsers no Windows às vezes retornam type vazio
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const prestadorId = formData.get("prestadorId") as string | null;
  const dir = (formData.get("dir") as string | null) || `tmp-${Date.now()}`;

  if (!file || !prestadorId) {
    return NextResponse.json({ error: "file e prestadorId são obrigatórios" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = file.type || EXT_MIME[ext] || "application/octet-stream";

  console.log(`[upload] "${file.name}" tipo:${contentType} bytes:${file.size}`);

  const caminho = `${prestadorId}/${dir}/${Date.now()}-${file.name}`;
  const bytes = await file.arrayBuffer();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from("chat-arquivos")
    .upload(caminho, bytes, { contentType, upsert: false });

  if (error || !data) {
    console.error(`[upload] erro Supabase — "${file.name}":`, error?.message);
    return NextResponse.json({ error: error?.message ?? "Upload falhou" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("chat-arquivos").getPublicUrl(data.path);
  console.log(`[upload] ok — path:${data.path}`);
  return NextResponse.json({ url: urlData.publicUrl, tipo: contentType });
}
