"use client";

import type { ChatTipo } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface PromptBase {
  label: string;
  tipo: ChatTipo;
  prompt: string;
}

const PROMPTS_BASE: PromptBase[] = [
  {
    label: "🎬 Criar vídeo de apresentação",
    tipo: "video_apresentacao",
    prompt:
      "Vamos criar um vídeo de apresentação completo. Você tem fotos ou vídeos do prestador para eu analisar antes de começar?",
  },
  {
    label: "📢 Criar CTAs para Meta Ads",
    tipo: "cta_anuncio",
    prompt:
      "Preciso de 3 variações de anúncio (emocional, direto e premium) para Meta Ads. O objetivo principal é gerar mais conversas no WhatsApp ou aumentar visualizações?",
  },
  {
    label: "🎨 Definir direção criativa",
    tipo: "direcao_criativa",
    prompt:
      "Vamos montar a direção criativa completa — ambiente, enquadramento, vestuário e estilo de edição. Tem referências visuais que você quer me mostrar?",
  },
  {
    label: "📊 Gerar análise estratégica",
    tipo: "analise",
    prompt:
      "Faça uma análise estratégica completa do prestador com base nos dados da entrevista e me apresente o posicionamento sugerido.",
  },
  {
    label: "✏️ Refinar roteiro existente",
    tipo: "geral",
    prompt:
      "Tenho um roteiro que precisa de ajustes. Vou colar aqui para você analisar e sugerir melhorias.",
  },
];

interface Props {
  onSelect: (prompt: string, tipo: ChatTipo) => void;
}

export default function PromptsBase({ onSelect }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <div className="mb-8">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-brand-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Como posso ajudar?</h3>
        <p className="text-xs text-gray-400">
          Escolha um ponto de partida ou escreva livremente abaixo
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {PROMPTS_BASE.map((p) => (
          <Button
            key={p.tipo + p.label}
            variant="outline"
            onClick={() => onSelect(p.prompt, p.tipo)}
            className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border-gray-200 rounded-full hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 h-auto"
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
