import os
import json
from pathlib import Path
from dotenv import load_dotenv
import anthropic

# 🔐 Carregar variáveis de ambiente
# Tenta backend/.env primeiro, depois raiz do projeto (../.env)
load_dotenv(dotenv_path=Path(__file__).parent / ".env")
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=False)

api_key = os.getenv("ANTHROPIC_API_KEY")

if not api_key:
    print("❌ Erro: ANTHROPIC_API_KEY não encontrada.")
    print("   Crie backend/.env com: ANTHROPIC_API_KEY=sk-ant-...")
    exit()

client = anthropic.Anthropic(api_key=api_key)
MODELO = "claude-sonnet-4-6"


# 🤖 Chamar Claude
def gerar_resposta(prompt: str, max_tokens: int = 2000) -> dict | str:
    try:
        print(f"   ... chamando {MODELO} ...")
        response = client.messages.create(
            model=MODELO,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )

        texto = response.content[0].text.strip()

        # Limpeza de JSON (remove ```json ... ```)
        if "```json" in texto:
            texto = texto.split("```json")[1].split("```")[0].strip()
        elif "```" in texto:
            texto = texto.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(texto)
        except json.JSONDecodeError:
            return texto

    except Exception as e:
        print(f"❌ Erro na API Anthropic: {e}")
        return {"erro": str(e)}


# 📂 Carregar dados do cliente
def carregar_cliente() -> dict:
    caminho = Path(__file__).parent / "data" / "cliente.json"
    if not caminho.exists():
        print(f"❌ Arquivo não encontrado: {caminho}")
        print("   Crie backend/data/cliente.json com os dados do cliente.")
        print("   Use backend/data/cliente_exemplo.json como referência.")
        exit()
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)


# 📂 Carregar prompt
def carregar_prompt(nome_arquivo: str) -> str:
    caminho = Path(__file__).parent / "prompts" / nome_arquivo
    if not caminho.exists():
        print(f"❌ Prompt não encontrado: {caminho}")
        return ""
    with open(caminho, "r", encoding="utf-8") as f:
        return f.read()


# 💾 Salvar output
def salvar_output(nome_cliente: str, dados: dict) -> str:
    pasta = Path(__file__).parent / "outputs"
    pasta.mkdir(exist_ok=True)

    nome_limpo = str(nome_cliente).replace(" ", "_").lower()
    caminho = pasta / f"{nome_limpo}.json"

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)

    return str(caminho)


# 🚀 MAIN — Pipeline de 4 passos com Claude
def main():
    print("🚀 MarryMe IA — Processador de Roteiros (Claude)\n")
    print(f"   Modelo: {MODELO}\n")

    cliente = carregar_cliente()
    nome_artistico = cliente.get("nome_artistico", "cliente_teste")
    cliente_json = json.dumps(cliente, ensure_ascii=False, indent=2)

    # ─── PASSO 1: ANÁLISE ESTRATÉGICA ────────────────────────────────────────
    print("Passo 1/4: Análise Estratégica...")
    prompt_estrategia = carregar_prompt("prompt_estrategia.txt")
    prompt_estrategia = prompt_estrategia.replace("{{JSON_CLIENTE}}", cliente_json)
    resposta_estrategia = gerar_resposta(prompt_estrategia, max_tokens=1600)

    est_data = (
        json.dumps(resposta_estrategia, ensure_ascii=False)
        if isinstance(resposta_estrategia, dict)
        else str(resposta_estrategia)
    )

    # ─── PASSO 2: ROTEIRO DE VÍDEO ───────────────────────────────────────────
    print("Passo 2/4: Roteiro de Vídeo...")
    prompt_roteiro = carregar_prompt("prompt_roteiro.txt")
    prompt_roteiro = prompt_roteiro.replace("{{JSON_ESTRATEGICO}}", est_data)
    prompt_roteiro = prompt_roteiro.replace("{{JSON_CLIENTE}}", cliente_json)
    resposta_roteiro = gerar_resposta(prompt_roteiro, max_tokens=2200)

    # ─── PASSO 3: COPY DE ANÚNCIOS ───────────────────────────────────────────
    print("Passo 3/4: Copy de Anúncios (Meta Ads)...")
    prompt_ads = carregar_prompt("prompt_ads.txt")
    prompt_ads = prompt_ads.replace("{{JSON_ESTRATEGICO}}", est_data)
    prompt_ads = prompt_ads.replace("{{JSON_CLIENTE}}", cliente_json)
    resposta_ads = gerar_resposta(prompt_ads, max_tokens=1400)

    # ─── PASSO 4: DIREÇÃO CRIATIVA ───────────────────────────────────────────
    print("Passo 4/4: Direção Criativa...")
    prompt_direcao = carregar_prompt("prompt_direcao.txt")
    prompt_direcao = prompt_direcao.replace("{{JSON_ESTRATEGICO}}", est_data)
    prompt_direcao = prompt_direcao.replace("{{JSON_CLIENTE}}", cliente_json)
    resposta_direcao = gerar_resposta(prompt_direcao, max_tokens=1000)

    # ─── COMPILAR E SALVAR ───────────────────────────────────────────────────
    resultado_final = {
        "cliente": cliente,
        "analise_estrategica": resposta_estrategia,
        "roteiro_sugerido": resposta_roteiro,
        "copy_anuncios": resposta_ads,
        "direcao_criativa": resposta_direcao,
    }

    caminho_saida = salvar_output(nome_artistico, resultado_final)

    print(f"\n✅ Processo finalizado!")
    print(f"💾 Arquivo gerado: {caminho_saida}")
    print(f"\n📋 Resumo:")
    print(f"   - Estratégia: {'✓' if isinstance(resposta_estrategia, dict) else '⚠ texto puro'}")
    print(f"   - Roteiro:    {'✓' if isinstance(resposta_roteiro, dict) else '⚠ texto puro'}")
    print(f"   - Anúncios:   {'✓' if isinstance(resposta_ads, dict) else '⚠ texto puro'}")
    print(f"   - Direção:    {'✓' if isinstance(resposta_direcao, dict) else '⚠ texto puro'}")


if __name__ == "__main__":
    main()
