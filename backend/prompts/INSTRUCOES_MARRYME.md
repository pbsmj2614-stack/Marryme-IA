# INSTRUÇÕES MARRYME — GUIA DE GERAÇÃO DE ROTEIROS

> Arquivo de referência para os 4 prompts da Edge Function `gerar-roteiro`.
> Versão condensada para injeção está em `supabase/functions/gerar-roteiro/instrucoes.ts`.

---

## 1. FILOSOFIA GERAL DA MARRYME

Um roteiro MarryMe tem uma característica reconhecível: o profissional poderia ler em voz alta e os noivos saberiam que foi escrito especificamente para ele — não para "um músico", mas para *aquele* músico, com aquela história, aquele número, aquele marco.

**O que diferencia do roteiro genérico de IA:**
- Roteiro genérico: "Profissional dedicado que ama o que faz e se compromete com a excelência"
- Roteiro MarryMe: "Vanessa Macedo tem 10 anos de carreira, participou do The Voice Brasil em 2015 pelo time da Claudia Leitte, e desde então criou o momento mais emocionante de mais de 300 casamentos"

A diferença é que o segundo *prova*. O primeiro apenas *afirma*.

**Por que dados reais aparecem em cada cena:**
A decisão de contratar um fornecedor de casamento é 80% emocional. O casal não contrata "um fotógrafo com 8 anos de experiência" — contrata alguém em quem confia que vai cuidar do dia mais importante de suas vidas. Dados reais (número, nome, história, marco) criam essa confiança porque são verificáveis e específicos.

**O papel de cada entrega na jornada de vendas:**
| Entrega | Função |
|---|---|
| Análise estratégica | Calibrar posicionamento antes de qualquer texto — define o tom de tudo |
| Roteiro de vídeo | Conteúdo orgânico para aquecer leads e gerar confiança antes do contato |
| Copy de anúncios | Capturar leads frios no Meta Ads com emoção e urgência |
| Direção criativa | Garantir que o vídeo seja gravado com a qualidade e o enquadramento certos |

**Proibições absolutas — nunca usar em nenhum output:**
- "profissional dedicado"
- "amor pelo que faz"
- "comprometido com a excelência"
- "referência no mercado"
- "o melhor do mercado"
- "qualidade incomparável"
- "atenção aos detalhes"
- "líder no segmento"
- "número 1"
- "imperdível"

---

## 2. INSTRUÇÕES PARA A ANÁLISE ESTRATÉGICA

### Como identificar o nível de mercado real

Use o ticket médio como âncora principal, calibrado por contexto regional:

| Nível | Ticket (referência SP/RJ) | Linguagem | Foco |
|---|---|---|---|
| Premium | > R$8.000 | Sofisticada, seletiva | Exclusividade, curadoria, experiência |
| Intermediário | R$3.500–R$8.000 | Equilibrada, profissional | Qualidade + confiança |
| Acessível | < R$3.500 | Próxima, prática | Segurança, custo-benefício |

> Se o profissional afirma ser premium mas cobra R$2.500, o posicionamento real é intermediário. Usar o posicionamento real — não o desejado.

### Como extrair o posicionamento verdadeiro

O posicionamento real emerge da interseção de 3 dados:
1. Ticket médio (nível de mercado)
2. Especialidade/nicho (público que já atende)
3. Diferenciais concretos (o que realmente entrega de diferente)

Nunca usar o que o profissional diz que é — usar o que os dados indicam que ele é.

### Como definir público-alvo com precisão

❌ Nunca: "noivos que valorizam qualidade"
✅ Sempre: "noivas de 27–35 anos, classe AB, planejando casamento de 80–150 convidados em espaços [tipo], que buscam [emoção específica] e temem [medo específico]"

O medo é tão importante quanto o desejo — ele é o gatilho que faz o lead agir.

### Diferenciais reais vs. percebidos

**NÃO são diferenciais:**
- "bom atendimento"
- "pontualidade"
- "comprometimento"
- "profissionalismo"

**SÃO diferenciais (com prova):**
- "arranjos personalizados criados especificamente para cada casal, pelo marido produtor musical" → verificável, único, tangível
- "gravação de ensaio entregue como presente aos noivos" → concreto, algo que poucos fazem
- "técnico de som dedicado incluído no pacote, sem custo adicional" → específico, comparável

### Gatilhos emocionais por categoria

| Categoria | Gatilhos específicos |
|---|---|
| Músico/Cantora | Arrepio na entrada da noiva, lágrima do noivo, memória que os convidados vão carregar para sempre |
| Fotógrafo/Cinegrafista | O detalhe que dura 2 segundos mas fica para sempre, o olhar que ninguém mais capturaria |
| Celebrante | Cerimônia que parece ter sido escrita só para aquele casal, maridos que choram |
| DJ | Energia que faz o avô de 80 anos dançar, pista que não esvazia, família unida na pista |
| Banda de Samba | Pista cheia, famílias unidas, repertório que faz todo mundo cantar junto |
| Cerimonialista | O dia perfeito acontece porque alguém trabalhou 12 horas invisível nos bastidores |

### Como escrever o tom de comunicação

O tom deve ser uma frase acionável que um redator possa seguir diretamente:

❌ Genérico: "tom elegante e profissional"
✅ Acionável: "elegante e acolhedora, como uma amiga experiente que entende de casamentos de alto padrão e faz o casal se sentir seguro desde o primeiro contato"

---

## 3. INSTRUÇÕES PARA O ROTEIRO DE VÍDEO

### Regra de ouro

O roteiro é escrito para ser **falado**, não narrado. Se soar como texto de site, está errado.

Teste: leia em voz alta. Se parecer um locutor de comercial, reescreva até parecer uma conversa real.

### Estrutura cena a cena

#### CENA 1 — HOOK DE IDENTIFICAÇÃO (15–20 segundos)

**Objetivo:** Fazer o lead se sentir visto antes de qualquer apresentação.

**Técnica:** Começar com a situação ou emoção que o lead já está vivendo. Nunca começar com "Olá, eu sou..." — a identificação vem antes da apresentação.

**Modelo aprovado (Vanessa Macedo):**
> "Se você chegou até aqui, provavelmente está planejando um dos momentos mais importantes da sua vida e quer ter certeza de que cada detalhe será perfeito — incluindo a música que vai marcar esse momento."

**Por que funciona:** O lead pensa "é exatamente isso que estou sentindo". A Vanessa ainda não apareceu — mas o lead já está ouvindo.

**Regra:** O hook deve mencionar uma dor real ou desejo específico do público-alvo identificado na análise.

---

#### CENA 2 — AUTORIDADE E HISTÓRIA (25–30 segundos)

**Estrutura obrigatória:**
`nome + anos de carreira + número de eventos + marco verificável + ponto de virada`

- O **marco verificável** deve ser algo concreto: participação em programa de TV, evento de grande porte nomeado, prêmio específico
- O **ponto de virada** é quando/por que o profissional escolheu focar em casamentos — humaniza e conecta

**Modelo aprovado (Vanessa Macedo):**
> "Sou a Vanessa Macedo, cantora há 10 anos, já participei do The Voice Brasil em 2015 pelo time da Claudia Leitte, e desde então me dedico a criar o momento mais emocionante dos casamentos — a trilha sonora que ninguém esquece."

**Proibido:** Listar cursos e certificados sem contexto emocional. "Formada em música com especialização em..." não conecta — "depois de tocar no casamento da minha melhor amiga e ver a família toda em lágrimas, decidi que era isso" conecta.

---

#### CENA 3 — DIFERENCIAL ÚNICO (25–35 segundos)

**Regra:** Máximo 3 diferenciais, cada um com uma prova concreta.

**Estrutura por diferencial:**
`nome do diferencial → o que é na prática → por que isso importa para o casal`

**Modelo aprovado (arranjos personalizados):**
> "Meu diferencial começa antes do dia: meu marido é produtor musical e criamos arranjos exclusivos para cada casal. Vocês não vão ouvir uma versão genérica — vão ouvir a versão de vocês. E no ensaio, a gente grava tudo e entrega como lembrança."

**Por que funciona:** "meu marido é produtor musical" é verificável. "versão de vocês" é emocional. "grava e entrega como lembrança" é tangível.

**Proibido:** Diferencial sem prova. "Atendimento personalizado" não é diferencial. "Reunião 1 mês antes onde o casal escolhe livremente o repertório completo" é diferencial.

---

#### CENA 4 — FORMAÇÕES OU PROCESSO (20–25 segundos)

**Para músicos/bandas (formações):**
- Apresentar do menor para o maior
- Cada formação: nome + contexto de uso + sensação que provoca (não lista técnica)
- Exemplo: "O Duo funciona muito bem para cerimônias mais íntimas, aquele momento em que você quer que a atenção fique só nos noivos. O Quarteto preenche completamente o salão — todo mundo sente."

**Para outros profissionais (processo):**
- Mostrar que tem método, não improvisa
- Estrutura: etapas simples → sensação de segurança
- Tom: "É bem simples: a gente faz X, depois Y, e no dia vocês só precisam aproveitar"
- Incluir o momento em que o casal participa e personaliza

---

#### CENA 5 — PROVA SOCIAL (15–20 segundos)

- Usar resultado **emocional**, não técnico
- Não é "cliente satisfeito" — é "a noiva me pediu para cantar a mesma música duas vezes"
- Se houver depoimento real nos dados do formulário (`depoimento_favorito`), usar fragmento direto
- Citar reações específicas: olhar, lágrima, comentário de convidado real

---

#### CENA 6 — REGIÃO (5–10 segundos, opcional)

Incluir apenas se a cidade/região for relevante para segmentação ou se o profissional tiver mobilidade para destacar.

Tom inclusivo: "Se o seu sonho for em outro lugar, me conta — a gente vê o que dá para fazer."

---

#### CENA 7 — CTA (10–15 segundos)

O CTA deve ser uma **pergunta que inicia conversa**, não uma ordem comercial.

**Modelo aprovado:**
> "Qual a data e o local do casamento? Me conta que a gente marca uma conversa sem compromisso."

**Proibido:**
- "Clique no link"
- "Entre em contato agora"
- "Não perca essa oportunidade"
- "Garanta já a sua data"

O CTA deve parecer um convite natural de alguém que quer conhecer o casal — não uma chamada de vendedor.

**Calibrar pelo canal** (`como_conheceu_noivos`): se o profissional é encontrado principalmente por indicação, o CTA pode mencionar isso ("Se alguém te indicou, já é um bom sinal — me conta mais").

---

### Notas técnicas por cena

Para cada cena, gerar `orientacao_captacao` com:
- Enquadramento (plano médio, plano americano, close)
- Ambiente sugerido (estúdio, externo, local de trabalho)
- Expressão/energia esperada do profissional

---

## 4. INSTRUÇÕES PARA COPY DE ANÚNCIOS META ADS

### ANÚNCIO EMOCIONAL

**Estrutura:**
1. Hook: situação ou sentimento que o lead já viveu ou teme
2. Corpo: o profissional como solução para aquela emoção, com dado concreto
3. CTA: suave, com pergunta ou convite

**Exemplo aprovado (Sergião Luiz):**
> Headline: "O que faz um casamento ser realmente inesquecível?"
> Copy: "Não é a decoração. Não é o buffet. É a música ao vivo que faz a sua avó chorar e seu noivo te olhar diferente. Com mais de 35 anos de samba raiz e casamentos que viram festa de família, o Sergião Luiz sabe criar esse momento."
> CTA: "Qual é a data do seu casamento?"

---

### ANÚNCIO DIRETO

**Estrutura:**
1. Hook: dado concreto ou resultado tangível
2. Corpo: o que entrega na prática, com números
3. CTA: direto, com urgência suave (datas, disponibilidade)

**Exemplo aprovado (Sergião Luiz):**
> Headline: "35 anos de estrada. Centenas de festas. Uma especialidade."
> Copy: "Samba raiz com repertório MPB e internacional — o Sergião Luiz toca o que faz pista cheia e família unida. Agenda limitada para 2025."
> CTA: "Me conta a data e eu confirmo disponibilidade."

---

### ANÚNCIO PREMIUM

**Estrutura:**
1. Hook: posicionamento e seleção — não é para todo mundo
2. Corpo: o que o cliente de alto valor ganha ao contratar
3. CTA: convite exclusivo para conversa, não para compra

**Tom:** Confiante, discreto. Sem superlativos. Sem urgência artificial.

---

### Regras gerais de copy

- Headline deve funcionar sozinha como gancho de scroll — o lead para só lendo ela
- Máximo 4 linhas de corpo (não usar bullets ou listas)
- Cada anúncio funciona de forma independente dos outros dois
- Proibido: "líder no mercado", "o melhor", "número 1", "imperdível", "última chance"
- Ancorar cada anúncio em um dado concreto diferente da análise

---

## 5. INSTRUÇÕES PARA DIREÇÃO CRIATIVA

### Enquadramento por posicionamento

| Posicionamento | Enquadramento | Câmera |
|---|---|---|
| Premium/clássico | Plano médio limpo, fundo desfocado | Movimento suave, tripé |
| Intermediário | Plano americano, ambiente de trabalho | Levemente dinâmica |
| Popular/animado | Plano aberto com movimento | Mais dinâmica, câmera na mão |

### Ambientação por categoria

| Categoria | Ambientações sugeridas |
|---|---|
| Cantora/Músico clássico | Estúdio, sala com instrumento ao fundo, espaço de evento elegante vazio |
| Banda de samba | Jardim, área externa com luz natural, ambiente festivo organizado |
| Fotógrafo/Cinegrafista | Luz natural forte, mesa com equipamento, externo urbano ou natural |
| Celebrante | Altar, jardim, espaço de cerimônia vazio com luz bonita da tarde |
| DJ | Booth de DJ com equipamento real, pista vazia, ambiente noturno elegante |
| Cerimonialista | Mesa de planejamento com detalhes, bastidores organizados, evento montado |

### Estilo de edição por posicionamento

| Posicionamento | Ritmo de corte | Transições | Trilha |
|---|---|---|---|
| Premium/clássico | Lento, respira | Dissolve suave | Incidental discreta |
| Jovem/moderno | Acelerado, no beat | Cortes diretos + letreiros | Trilha mais marcada |
| Emocional/romântico | Misto, câmera lenta em momentos-chave | Planos detalhe | Trilha emocional |

### Regras para as 3 sugestões

- Cada sugestão deve ser específica para o perfil — sem cenas genéricas de "casal feliz"
- Cada campo (ambientacao, enquadramento, estilo_edicao, legenda_sugerida): máximo 2 linhas
- As 3 sugestões devem ter abordagens diferentes entre si: uma mais institucional, uma mais emocional, uma mais técnica/bastidores

---

## 6. MAPEAMENTO CAMPO A CAMPO DO FORMULÁRIO

| Campo | Onde e como usar |
|---|---|
| `nome_artistico` | CENA 2 — nunca omitir; é a âncora de identidade do roteiro |
| `anos_experiencia` | CENA 2 — dado obrigatório de autoridade |
| `numero_casamentos` | CENA 2 ou CENA 5 — prova social concreta; usar o número exato |
| `especialidade` | CENA 1 — base para o hook; define o nicho e a dor do lead |
| `diferenciais` | CENA 3 — nunca parafrasear como genérico; extrair o que é verificável |
| `estilo_trabalho` | CENA 4/5 — base para o método e tom de comunicação |
| `depoimento_favorito` | CENA 5 — se disponível, usar fragmento direto sem edição excessiva |
| `momentos_especiais` | CENA 2 ou 5 — storytelling; histórias reais criam conexão emocional |
| `como_conheceu_noivos` | CTA — calibra o canal; se é indicação, mencionar no CTA |
| `preco_medio` | Análise estratégica — calibra nível de mercado e posicionamento |
| `formacao` | CENA 2 — apenas se relevante para autoridade; não listar cursos sem contexto |
| `cidade_base` | CENA 6 (opcional) — segmentação regional |
| `informacoes_adicionais` | Verificar se há dado que eleva um diferencial já identificado |
| `equipamentos` | CENA 3 ou 4 — apenas se for diferencial técnico real (ex: "Electro Voice até 200 pessoas") |

---

## 7. EXEMPLOS DE QUALIDADE APROVADOS

### VANESSA MACEDO — Cantora/Músico (Premium)

**Perfil:** 10 anos de carreira, 300+ eventos, The Voice Brasil 2015 (time Claudia Leitte, 4 fases). Formações: Duo R$3.200 / Trio R$3.700 / Quarteto R$4.200. Técnico de som dedicado, equipamento Electro Voice até 200 pessoas. Marido produtor musical cria arranjos exclusivos.

**Por que os roteiros aprovados funcionam:**
- Usam dados verificáveis: "The Voice Brasil 2015", "time da Claudia Leitte", "4 fases" — ninguém inventa isso
- O diferencial dos arranjos tem prova concreta (marido produtor musical) — não é "personalização", é um processo real
- A gravação do ensaio é tangível — o casal consegue imaginar recebendo aquilo
- O CTA é uma pergunta, nunca uma ordem

**Trecho aprovado — CENA 1:**
> "Se você chegou até aqui, provavelmente está planejando um dos momentos mais importantes da sua vida e quer ter certeza de que cada detalhe será perfeito — incluindo a música que vai marcar esse momento."

**Por que funciona:** O lead pensa "é exatamente isso". A Vanessa não apareceu ainda — mas o lead já está ouvindo com atenção.

**Trecho aprovado — CENA 2:**
> "Sou a Vanessa Macedo, cantora há 10 anos, já participei do The Voice Brasil em 2015 pelo time da Claudia Leitte, e desde então me dedico a criar o momento mais emocionante dos casamentos — a trilha sonora que ninguém esquece."

**Trecho aprovado — CENA 3:**
> "Meu diferencial começa antes do dia: meu marido é produtor musical e criamos arranjos exclusivos para cada casal. Vocês não vão ouvir uma versão genérica — vão ouvir a versão de vocês. E no ensaio, a gente grava tudo e entrega como lembrança."

**Trecho aprovado — CTA:**
> "Qual a data e o local do casamento? Me conta que a gente marca uma conversa sem compromisso e eu conto tudo sobre como funciona."

---

### SERGIÃO LUIZ — Banda de Samba (Intermediário/Premium)

**Perfil:** 35 anos de carreira, especialidade em samba raiz com repertório MPB e internacional adaptado. Diferencial: sofisticação + energia de pista — casamentos que unem famílias de perfis diferentes.

**Por que os roteiros aprovados funcionam:**
- "35 anos de estrada" comunica autoridade imediata sem listar cursos
- "Samba raiz com repertório MPB e internacional" é nicho definido — não é "música para todos os gostos"
- O diferencial de unir famílias ressoa com um desejo universal dos noivos (que frequentemente têm famílias com gostos diferentes)
- Tom próximo mas não informal demais — profissional que você também chamaria para uma roda de samba

**Trecho aprovado — Anúncio Emocional:**
> Headline: "O que faz um casamento ser realmente inesquecível?"
> Copy: "O que faz um casamento ser inesquecível não é apenas a decoração ou o buffet, mas a alma e a emoção que a música ao vivo transmite para quem você ama. Com o Sergião Luiz, cada momento vira memória — e a pista só esvazia quando a festa acaba."
> CTA: "Qual é a data do seu casamento?"

**Por que funciona:** Começa com uma pergunta que o lead já se fez. Responde com emoção. Termina com outra pergunta — cria diálogo, não pitch.

**Trecho aprovado — Anúncio Direto:**
> Headline: "35 anos de estrada. Samba que une famílias."
> Copy: "Com mais de 35 anos de estrada e especialidade em samba raiz, o Sergião Luiz leva energia e sofisticação para casamentos que precisam de pista cheia do início ao fim. Agenda limitada."
> CTA: "Me conta a data e a gente vê disponibilidade."

---

## 8. CHECKLIST FINAL DE QUALIDADE

Antes de aprovar qualquer output, verificar:

- [ ] Aparece o nome do profissional na CENA 2?
- [ ] Aparece pelo menos 1 número concreto (anos, eventos, ticket)?
- [ ] Aparece pelo menos 1 diferencial com prova verificável?
- [ ] O hook não começa com "Olá" ou "Sou [nome]"?
- [ ] O CTA é uma pergunta, não uma ordem?
- [ ] Nenhuma das proibições absolutas foi usada?
- [ ] O tom está alinhado com o posicionamento definido na análise?
- [ ] Os dados do `momentos_especiais` ou `depoimento_favorito` foram aproveitados?
