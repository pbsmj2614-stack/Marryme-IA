export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const caminho = `${prestadorId}/${dir}/${Date.now()}-${file.name}`;
  const bytes = await file.arrayBuffer();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from("chat-arquivos")
    .upload(caminho, bytes, { contentType: file.type, upsert: false });

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Upload falhou" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("chat-arquivos").getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
