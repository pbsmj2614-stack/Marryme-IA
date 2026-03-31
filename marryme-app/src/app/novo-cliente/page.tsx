"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEGMENTOS = ["Músico", "Banda", "DJ", "Fotógrafo", "Celebrante", "Cerimonialista", "Decoração", "Buffet", "Outro"];
const PLANOS    = ["Essencial", "Growth", "Premium", "Trial"];
const FASES     = ["Onboarding", "Captação", "Produção", "Entrega", "Pós-venda"];
const RESPS     = ["Paulo", "Murilo", "Kauê"];

interface FormData {
  nome_empresa:   string;
  segmento:       string;
  cidade:         string;
  whatsapp:       string;
  email:          string;
  plano:          string;
  fase_projeto:   string;
  responsavel_mm: string;
  observacoes:    string;
}

const EMPTY: FormData = {
  nome_empresa:   "",
  segmento:       "Músico",
  cidade:         "",
  whatsapp:       "",
  email:          "",
  plano:          "Essencial",
  fase_projeto:   "Onboarding",
  responsavel_mm: "",
  observacoes:    "",
};

interface FieldError {
  nome_empresa?: string;
  email?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").substring(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function todayBR(): string {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function InputClass(error?: string) {
  return `w-full bg-[#1e1e1e] border ${
    error ? "border-red-600" : "border-[#333]"
  } rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#666] transition`;
}

function SelectClass() {
  return "w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#666] transition appearance-none cursor-pointer";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoClientePage() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [form,    setForm]    = useState<FormData>(EMPTY);
  const [errors,  setErrors]  = useState<FieldError>({});
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; id?: string; aba?: string; aviso?: string | null; message?: string; error?: string } | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/login"); return; }
      setUser(u);
    }
    init();
  }, [router]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FieldError]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): boolean {
    const errs: FieldError = {};
    if (!form.nome_empresa.trim() || form.nome_empresa.trim().length < 2) {
      errs.nome_empresa = "Nome da empresa é obrigatório (mínimo 2 caracteres).";
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "E-mail inválido.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setResult(null);

    try {
      const res  = await fetch("/api/sheets/novo-cliente", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) setForm(EMPTY); // reset form on success
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Erro de rede" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <Header user={user} />

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* ── Cabeçalho ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
              ← Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold mt-2">Novo Cliente</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cria a aba na planilha, preenche tarefas base (hoje + 7 dias) e registra no Cadastro.
          </p>
          <p className="text-xs text-gray-600 mt-2">
            Data de cadastro: <span className="text-gray-400 font-mono">{todayBR()}</span>
          </p>
        </div>

        {/* ── Resultado ── */}
        {result && (
          <div className={`mb-6 px-4 py-4 rounded-xl border text-sm ${
            result.ok
              ? "bg-green-950 border-green-700 text-green-300"
              : "bg-red-950 border-red-700 text-red-300"
          }`}>
            {result.ok ? (
              <div className="space-y-1">
                <p className="font-semibold text-base">✓ Cliente cadastrado!</p>
                <p className="font-mono text-green-400">{result.id} · aba "{result.aba}"</p>
                <p className="text-green-400/70">{result.message}</p>
                {result.aviso && (
                  <p className="text-yellow-400 mt-2">⚠ {result.aviso}</p>
                )}
                <div className="flex gap-3 mt-3">
                  <Link
                    href="/dashboard"
                    className="px-4 py-2 rounded-lg bg-green-900 hover:bg-green-800 text-green-200 text-xs font-medium transition"
                  >
                    Ver no Dashboard
                  </Link>
                  <button
                    onClick={() => setResult(null)}
                    className="px-4 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-gray-300 text-xs font-medium transition border border-[#444]"
                  >
                    Cadastrar outro
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-semibold">✕ Erro ao cadastrar</p>
                <p className="mt-1 text-red-300/80">{result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Formulário ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-[#242424] border border-[#333] rounded-2xl overflow-hidden">

            {/* Seção: Identificação */}
            <div className="px-6 py-5 border-b border-[#2a2a2a]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Identificação</p>
              <div className="space-y-4">

                {/* Nome */}
                <div>
                  <Label required>Nome da Empresa / Artista</Label>
                  <input
                    type="text"
                    value={form.nome_empresa}
                    onChange={(e) => set("nome_empresa", e.target.value)}
                    placeholder="Ex: Banda Pérola, Paulo Fotógrafo…"
                    className={InputClass(errors.nome_empresa)}
                    disabled={loading}
                    autoFocus
                  />
                  {errors.nome_empresa && (
                    <p className="text-red-400 text-xs mt-1">{errors.nome_empresa}</p>
                  )}
                </div>

                {/* Segmento + Plano */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Segmento</Label>
                    <div className="relative">
                      <select value={form.segmento} onChange={(e) => set("segmento", e.target.value)} className={SelectClass()} disabled={loading}>
                        {SEGMENTOS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                    </div>
                  </div>
                  <div>
                    <Label>Plano</Label>
                    <div className="relative">
                      <select value={form.plano} onChange={(e) => set("plano", e.target.value)} className={SelectClass()} disabled={loading}>
                        {PLANOS.map((p) => <option key={p}>{p}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Seção: Contato */}
            <div className="px-6 py-5 border-b border-[#2a2a2a]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Contato</p>
              <div className="space-y-4">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>WhatsApp</Label>
                    <input
                      type="tel"
                      value={form.whatsapp}
                      onChange={(e) => set("whatsapp", formatPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className={InputClass()}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="contato@exemplo.com"
                      className={InputClass(errors.email)}
                      disabled={loading}
                    />
                    {errors.email && (
                      <p className="text-red-400 text-xs mt-1">{errors.email}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Cidade</Label>
                  <input
                    type="text"
                    value={form.cidade}
                    onChange={(e) => set("cidade", e.target.value)}
                    placeholder="São Paulo, SP"
                    className={InputClass()}
                    disabled={loading}
                  />
                </div>

              </div>
            </div>

            {/* Seção: Gestão */}
            <div className="px-6 py-5 border-b border-[#2a2a2a]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Gestão interna</p>
              <div className="grid grid-cols-2 gap-4">

                <div>
                  <Label>Fase do projeto</Label>
                  <div className="relative">
                    <select value={form.fase_projeto} onChange={(e) => set("fase_projeto", e.target.value)} className={SelectClass()} disabled={loading}>
                      {FASES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                  </div>
                </div>

                <div>
                  <Label>Responsável MM</Label>
                  <div className="relative">
                    <select value={form.responsavel_mm} onChange={(e) => set("responsavel_mm", e.target.value)} className={SelectClass()} disabled={loading}>
                      <option value="">— selecione —</option>
                      {RESPS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Observações */}
            <div className="px-6 py-5">
              <Label>Observações</Label>
              <textarea
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações adicionais, contexto, origem do lead…"
                rows={3}
                className={`${InputClass()} resize-none`}
                disabled={loading}
              />
            </div>
          </div>

          {/* ── Aviso de pré-requisito ── */}
          <p className="text-xs text-gray-600 mt-4 text-center">
            Requer aba <span className="font-mono text-gray-500">PlanilhaModelo</span> na planilha e{" "}
            <span className="font-mono text-gray-500">GOOGLE_SERVICE_ACCOUNT_JSON</span> configurado.
          </p>

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full py-3.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-400 border-t-black rounded-full animate-spin" />
                Cadastrando…
              </>
            ) : (
              "Cadastrar cliente"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
