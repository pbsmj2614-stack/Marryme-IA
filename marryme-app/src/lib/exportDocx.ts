import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import type {
  AnaliseEstrategica,
  Anuncio,
  CenaRoteiro,
  DirecaoCena,
  Prestador,
  Roteiro,
} from "@/lib/types";

// ─── Identidade visual ────────────────────────────────────────────────────────

const C = {
  PINK:        "E84393",
  DARK:        "1E293B",
  SLATE:       "334155",
  GRAY:        "6B7280",
  GRAY_LIGHT:  "F1F5F9",
  GRAY_BORDER: "CBD5E1",
  WHITE:       "FFFFFF",
  BLACK:       "1E293B",
  AMBER:       "92400E",
  BLUE:        "1D4ED8",
  RED:         "BE185D",
} as const;

// Half-points (24 = 12pt)
const SZ = {
  HUGE:    52, // 26pt — nome na capa
  SECTION: 28, // 14pt — títulos de seção
  BODY:    24, // 12pt — texto principal
  SMALL:   20, // 10pt — metadados
  TINY:    18, // 9pt  — rodapé e notas
} as const;

const FONT = "Nunito";

// Página A4/Letter com 1" de margem: área útil = 6,5" = 9360 twips
const PAGE_WIDTH = convertInchesToTwip(6.5);

// Espaçamento de linha 1,15× para texto corrido
const LINHA_NORMAL = { line: 276, lineRule: LineRuleType.AUTO };

const CATEG: Record<string, string> = {
  musico:         "Músico / Cantora",
  fotografo:      "Fotógrafo / Cinegrafista",
  celebrante:     "Celebrante",
  dj:             "DJ",
  cerimonialista: "Cerimonialista",
  outro:          "Outro",
};

const TEMPO_CENAS = ["15–20s", "25–30s", "25–35s", "20–25s", "20–25s", "15–20s", "5–10s", "10–15s"];
const TITULO_CABECALHO = "Perfil de Apresentação";

// ─── Utilitários ──────────────────────────────────────────────────────────────

function dataHoje(): string {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function normalizar(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
}

function nomeArquivo(nome: string, tipo: string): string {
  return `${normalizar(nome)}_${tipo}_MarryMe.docx`;
}

// ShadingType.CLEAR é a forma correta de cor sólida no OOXML.
// ShadingType.SOLID usa "color" como cor do padrão (não o fill), causando o bug azul-lavanda.
function shd(fill: string): { type: typeof ShadingType.CLEAR; color: string; fill: string } {
  return { type: ShadingType.CLEAR, color: "auto", fill };
}

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: "auto", space: 0 };
const SEM_BORDAS_CELULA = { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA };

// ─── Blocos base ──────────────────────────────────────────────────────────────

function espaco(before = 120): Paragraph {
  return new Paragraph({ spacing: { before, after: 0 } });
}

function regua(cor: string = C.GRAY_BORDER): Paragraph {
  return new Paragraph({
    border: { bottom: { color: cor, size: 4, space: 1, style: BorderStyle.SINGLE } },
    spacing: { before: 0, after: 0 },
  });
}

// Cabeçalho de página: MARRY ME  |  Perfil de Apresentação
function cabecalhoDoc(): Header {
  return new Header({
    children: [
      new Paragraph({
        spacing: { before: 0, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.GRAY_BORDER, space: 6 } },
        children: [
          new TextRun({ text: "MARRY ME", bold: true, color: C.PINK, size: SZ.SMALL, font: FONT }),
          new TextRun({ text: "   |   ", color: C.GRAY_BORDER, size: SZ.SMALL }),
          new TextRun({ text: TITULO_CABECALHO, color: C.GRAY, size: SZ.TINY, font: FONT }),
        ],
      }),
    ],
  });
}

// Cabeçalho de cena: parágrafo único com fundo escuro — sem tabela, sem risco de texto vertical.
// Título à esquerda, tempo à direita via tab stop. Borda colorida à esquerda como acento.
function headerCena(num: number, titulo: string, tempo: string, corAccento: string = C.PINK): Paragraph {
  return new Paragraph({
    shading: shd(C.DARK),
    border: { left: { style: BorderStyle.SINGLE, size: 20, color: corAccento, space: 0 } },
    tabStops: [{ type: TabStopType.RIGHT, position: convertInchesToTwip(6.3) }],
    keepNext: true,
    spacing: { before: 0, after: 0 },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    children: [
      new TextRun({
        text: `CENA ${String(num).padStart(2, "0")} — ${titulo.toUpperCase()}`,
        bold: true, color: C.WHITE, size: SZ.SMALL, font: FONT,
      }),
      new TextRun({ text: "\t", size: SZ.SMALL, font: FONT }),
      new TextRun({ text: tempo, bold: true, color: corAccento, size: SZ.SMALL, font: FONT }),
    ],
  });
}

// Título de seção: parágrafo navy com borda colorida à esquerda
// corAccento = rosa para roteiro/análise/direção, azul para meta ads
function tituloSecao(texto: string, corAccento: string = C.PINK): Paragraph[] {
  return [
    espaco(360),
    new Paragraph({
      shading: shd(C.DARK),
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: corAccento, space: 0 } },
      spacing: { before: 0, after: 0 },
      indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.15) },
      children: [
        new TextRun({ text: texto.toUpperCase(), bold: true, color: C.WHITE, size: SZ.SECTION, font: FONT }),
      ],
    }),
    espaco(180),
  ];
}

// Nota de gravação
function notaGravacao(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.BOTH,
    keepNext: true,
    indent: { left: convertInchesToTwip(0.3) },
    spacing: { before: 80, after: 80, ...LINHA_NORMAL },
    children: [
      new TextRun({ text: "NOTA DE GRAVAÇÃO: ", bold: true, italics: true, color: C.PINK, size: SZ.TINY, font: FONT }),
      new TextRun({ text: texto, italics: true, color: C.GRAY, size: SZ.TINY, font: FONT }),
    ],
  });
}

// Fala: label bold + parágrafos com justificação e entrelinha padrão
function fala(falante: string, texto: string): Paragraph[] {
  const paragrafos = texto.split(/\n\n+/).filter(Boolean);
  return [
    espaco(120),
    new Paragraph({
      keepNext: true,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: `${falante}:`, bold: true, color: C.DARK, size: SZ.BODY, font: FONT })],
    }),
    ...paragrafos.map((p) =>
      new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { before: 0, after: 120, ...LINHA_NORMAL },
        children: [new TextRun({ text: p.trim(), size: SZ.BODY, color: C.BLACK, font: FONT })],
      })
    ),
  ];
}

// Label cinza pequeno + valor justificado
function campoValor(label: string, valor: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 180, after: 40 },
      children: [new TextRun({ text: label.toUpperCase(), bold: true, color: C.GRAY, size: SZ.TINY, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      spacing: { before: 0, after: 100, ...LINHA_NORMAL },
      children: [new TextRun({ text: valor, size: SZ.BODY, color: C.BLACK, font: FONT })],
    }),
  ];
}

// Item bullet justificado
function itemBullet(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.BOTH,
    bullet: { level: 0 },
    indent: { left: convertInchesToTwip(0.3) },
    spacing: { before: 40, after: 40, ...LINHA_NORMAL },
    children: [new TextRun({ text: texto, size: SZ.BODY, color: C.BLACK, font: FONT })],
  });
}

// ─── Capa ─────────────────────────────────────────────────────────────────────

function paginaCapa(nome: string, categoria: string): Paragraph[] {
  const cat = CATEG[categoria] ?? categoria;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "MARRY ME", bold: true, color: C.PINK, size: 40, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [
        new TextRun({ text: "Assessoria de Vendas & Marketing para Casamentos", color: C.GRAY, size: SZ.SMALL, font: FONT }),
      ],
    }),
    regua(C.GRAY_BORDER),
    espaco(480),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 140 },
      children: [new TextRun({ text: nome, bold: true, color: C.DARK, size: SZ.HUGE, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [new TextRun({ text: cat, italics: true, color: C.GRAY, size: SZ.SECTION, font: FONT })],
    }),
    regua(C.PINK),
    espaco(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: `Gerado em ${dataHoje()}`, color: C.GRAY, size: SZ.SMALL, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Documento confidencial — MarryMe", color: C.GRAY, size: SZ.TINY, font: FONT })],
    }),
  ];
}

// ─── Seção: Análise Estratégica ───────────────────────────────────────────────

function secaoAnalise(a: AnaliseEstrategica): (Paragraph | Table)[] {
  return [
    ...tituloSecao("Análise Estratégica do Perfil"),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      spacing: { before: 0, after: 180, ...LINHA_NORMAL },
      children: [
        new TextRun({
          text: "Este documento define o posicionamento estratégico do profissional e orienta todos os materiais de comunicação.",
          italics: true, color: C.GRAY, size: SZ.SMALL, font: FONT,
        }),
      ],
    }),
    ...campoValor("Posicionamento Final", a.posicionamento_final),
    ...campoValor("Público-alvo", a.publico_alvo),
    ...campoValor("Nível de Mercado", a.nivel_mercado),
    ...campoValor("Tom de Comunicação", a.tom_comunicacao),
    new Paragraph({
      spacing: { before: 180, after: 40 },
      children: [new TextRun({ text: "DIFERENCIAIS-CHAVE", bold: true, color: C.GRAY, size: SZ.TINY, font: FONT })],
    }),
    ...a.diferenciais_chave.map(itemBullet),
    new Paragraph({
      spacing: { before: 180, after: 40 },
      children: [new TextRun({ text: "GATILHOS EMOCIONAIS", bold: true, color: C.GRAY, size: SZ.TINY, font: FONT })],
    }),
    ...a.gatilhos_emocionais.map(itemBullet),
  ];
}

// ─── Seção: Roteiro de Vídeo ──────────────────────────────────────────────────

function secaoRoteiro(r: { roteiro: CenaRoteiro[] }, nomeCliente: string): (Paragraph | Table)[] {
  const primeiroNome = nomeCliente.toUpperCase().split(" ")[0];
  const items: (Paragraph | Table)[] = [
    ...tituloSecao("Roteiro de Vídeo de Apresentação", C.PINK),
    new Paragraph({
      spacing: { before: 0, after: 40, ...LINHA_NORMAL },
      children: [
        new TextRun({ text: "Tempo estimado: ", bold: true, size: SZ.SMALL, font: FONT }),
        new TextRun({ text: "2 a 3 minutos   ", size: SZ.SMALL, font: FONT }),
        new TextRun({ text: "Objetivo: ", bold: true, size: SZ.SMALL, font: FONT }),
        new TextRun({ text: "Gerar segurança, desejo e conduzir para a reunião", size: SZ.SMALL, font: FONT }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40, ...LINHA_NORMAL },
      children: [
        new TextRun({ text: "Canal: ", bold: true, size: SZ.SMALL, font: FONT }),
        new TextRun({ text: "WhatsApp — atendimento a leads de tráfego pago", size: SZ.SMALL, font: FONT }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 0, ...LINHA_NORMAL },
      children: [
        new TextRun({ text: "Estrutura: ", bold: true, size: SZ.SMALL, font: FONT }),
        new TextRun({
          text: "Identificação — Autoridade — Diferenciação — Processo — Prova Social — Convite",
          italics: true, size: SZ.SMALL, color: C.GRAY, font: FONT,
        }),
      ],
    }),
    espaco(140),
    regua(),
  ];

  r.roteiro.forEach((cena, idx) => {
    const tempo = TEMPO_CENAS[idx] ?? "15–20s";
    items.push(espaco(220));
    items.push(headerCena(cena.cena, cena.titulo, tempo, C.PINK));
    if (cena.orientacao_captacao) {
      items.push(notaGravacao(cena.orientacao_captacao));
    }
    items.push(...fala(`${primeiroNome} (fala para câmera)`, cena.texto));
    if (cena.legenda_sugerida) {
      items.push(
        new Paragraph({
          alignment: AlignmentType.BOTH,
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { before: 60, after: 0, ...LINHA_NORMAL },
          children: [
            new TextRun({ text: "Legenda sugerida: ", bold: true, italics: true, color: C.PINK, size: SZ.TINY, font: FONT }),
            new TextRun({ text: cena.legenda_sugerida, italics: true, color: C.GRAY, size: SZ.TINY, font: FONT }),
          ],
        })
      );
    }
    items.push(espaco(100), regua(C.GRAY_BORDER));
  });

  return items;
}

// ─── Seção: Copy de Anúncios (acento azul) ───────────────────────────────────

function secaoAnuncios(c: { anuncios: Anuncio[] }): (Paragraph | Table)[] {
  const COR_TIPO: Record<string, string> = { emocional: C.RED, direto: C.BLUE, premium: C.AMBER };
  const LABEL_TIPO: Record<string, string> = { emocional: "EMOCIONAL", direto: "DIRETO", premium: "PREMIUM" };

  const items: (Paragraph | Table)[] = [
    ...tituloSecao("Roteiros para Anúncios — Meta Ads", C.BLUE),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      spacing: { before: 0, after: 180, ...LINHA_NORMAL },
      children: [
        new TextRun({
          text: "Três variações para campanhas no Meta Ads. Cada anúncio funciona de forma independente.",
          italics: true, color: C.GRAY, size: SZ.SMALL, font: FONT,
        }),
      ],
    }),
  ];

  c.anuncios.forEach((ad) => {
    const cor = COR_TIPO[ad.tipo] ?? C.PINK;
    items.push(
      espaco(200),
      new Paragraph({
        keepNext: true,
        shading: shd(C.GRAY_LIGHT),
        border: { left: { style: BorderStyle.SINGLE, size: 14, color: cor, space: 8 } },
        indent: { left: convertInchesToTwip(0.2) },
        spacing: { before: 80, after: 60 },
        children: [
          new TextRun({ text: LABEL_TIPO[ad.tipo] ?? ad.tipo.toUpperCase(), bold: true, color: cor, size: SZ.SMALL, font: FONT }),
        ],
      }),
      new Paragraph({
        keepNext: true,
        indent: { left: convertInchesToTwip(0.2) },
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text: "Headline: ", bold: true, color: C.DARK, size: SZ.BODY, font: FONT }),
          new TextRun({ text: ad.headline, bold: true, size: SZ.BODY, font: FONT }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.BOTH,
        keepNext: true,
        indent: { left: convertInchesToTwip(0.2) },
        spacing: { before: 0, after: 60, ...LINHA_NORMAL },
        children: [new TextRun({ text: ad.copy, size: SZ.BODY, color: C.BLACK, font: FONT })],
      }),
      new Paragraph({
        indent: { left: convertInchesToTwip(0.2) },
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: "CTA: ", bold: true, color: C.DARK, size: SZ.BODY, font: FONT }),
          new TextRun({ text: ad.cta, size: SZ.BODY, color: C.BLACK, font: FONT }),
        ],
      }),
      regua(C.GRAY_BORDER),
    );
  });

  return items;
}

// ─── Seção: Direção Criativa ──────────────────────────────────────────────────

function secaoDirecao(d: { direcao: DirecaoCena[] }): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = [
    ...tituloSecao("Direção Criativa", C.PINK),
    new Paragraph({
      alignment: AlignmentType.BOTH,
      spacing: { before: 0, after: 180, ...LINHA_NORMAL },
      children: [
        new TextRun({
          text: "Sugestões de enquadramento, ambientação e estilo de edição para a gravação do vídeo.",
          italics: true, color: C.GRAY, size: SZ.SMALL, font: FONT,
        }),
      ],
    }),
  ];

  d.direcao.forEach((item, idx) => {
    items.push(
      espaco(180),
      new Paragraph({
        keepNext: true,
        shading: shd(C.GRAY_LIGHT),
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.SLATE, space: 8 } },
        indent: { left: convertInchesToTwip(0.2) },
        spacing: { before: 80, after: 60 },
        children: [
          new TextRun({ text: `${idx + 1}.  ${item.tipo_cena}`, bold: true, color: C.DARK, size: SZ.BODY, font: FONT }),
        ],
      }),
    );

    const campos: [string, string][] = [
      ["Ambientação",      item.ambientacao],
      ["Enquadramento",    item.enquadramento],
      ["Estilo de edição", item.estilo_edicao],
      ["Legenda sugerida", item.legenda_sugerida],
    ];

    campos.filter(([, v]) => v).forEach(([label, valor]) => {
      items.push(
        new Paragraph({
          alignment: AlignmentType.BOTH,
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { before: 60, after: 40, ...LINHA_NORMAL },
          children: [
            new TextRun({ text: `${label}: `, bold: true, color: C.GRAY, size: SZ.SMALL, font: FONT }),
            new TextRun({ text: valor, color: C.BLACK, size: SZ.SMALL, font: FONT }),
          ],
        })
      );
    });
    items.push(espaco(80), regua(C.GRAY_BORDER));
  });

  return items;
}

// ─── Montagem do documento ────────────────────────────────────────────────────

function montarDocumento(children: (Paragraph | Table)[], nome: string, categoria: string): Document {
  const cat = CATEG[categoria] ?? categoria;
  return new Document({
    styles: {
      default: {
        document: { run: { font: FONT } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
            },
          },
        },
        headers: { default: cabecalhoDoc() },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.GRAY_BORDER, space: 6 } },
                children: [
                  new TextRun({ text: `MarryMe — ${dataHoje()}    `, color: C.GRAY, size: SZ.TINY, font: FONT }),
                  new TextRun({ text: `${nome}  ·  ${cat}`, bold: true, color: C.DARK, size: SZ.TINY, font: FONT }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

export type TipoExport = "completo" | "analise" | "roteiro" | "anuncios" | "direcao";

export async function exportarDocumento(
  tipo: TipoExport,
  prestador: Pick<Prestador, "nome_artistico" | "categoria">,
  roteiro: Roteiro,
): Promise<void> {
  const nome = prestador.nome_artistico;
  const cat  = prestador.categoria;
  const capa = paginaCapa(nome, cat);

  let conteudo: (Paragraph | Table)[];
  let sufixo: string;

  switch (tipo) {
    case "analise":
      if (!roteiro.analise_estrategica) throw new Error("Análise estratégica não disponível");
      conteudo = [...capa, ...secaoAnalise(roteiro.analise_estrategica)];
      sufixo = "AnaliseEstrategica";
      break;
    case "roteiro":
      if (!roteiro.roteiro_sugerido) throw new Error("Roteiro de vídeo não disponível");
      conteudo = [...capa, ...secaoRoteiro(roteiro.roteiro_sugerido, nome)];
      sufixo = "RoteiroVideo";
      break;
    case "anuncios":
      if (!roteiro.copy_anuncios) throw new Error("Anúncios não disponíveis");
      conteudo = [...capa, ...secaoAnuncios(roteiro.copy_anuncios)];
      sufixo = "Anuncios";
      break;
    case "direcao":
      if (!roteiro.direcao_criativa) throw new Error("Direção criativa não disponível");
      conteudo = [...capa, ...secaoDirecao(roteiro.direcao_criativa)];
      sufixo = "DirecaoCriativa";
      break;
    case "completo":
    default:
      conteudo = [...capa];
      if (roteiro.analise_estrategica)  conteudo.push(...secaoAnalise(roteiro.analise_estrategica));
      if (roteiro.roteiro_sugerido)     conteudo.push(...secaoRoteiro(roteiro.roteiro_sugerido, nome));
      if (roteiro.copy_anuncios)        conteudo.push(...secaoAnuncios(roteiro.copy_anuncios));
      if (roteiro.direcao_criativa)     conteudo.push(...secaoDirecao(roteiro.direcao_criativa));
      sufixo = "Completo";
      break;
  }

  const doc  = montarDocumento(conteudo, nome, cat);
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = nomeArquivo(nome, sufixo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
