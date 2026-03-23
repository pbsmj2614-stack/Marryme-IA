import os
import json
import time
from dotenv import load_dotenv
import google.generativeai as genai

# 🔐 Carregar variáveis de ambiente
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    print("❌ Erro: GOOGLE_API_KEY não encontrada no arquivo .env")
    exit()

genai.configure(api_key=api_key)

# 🤖 Função para chamar a IA com Auto-Detecção de Modelo


def gerar_resposta(prompt):
    try:
        # 1. Lista os modelos disponíveis para sua chave para evitar o Erro 404
        modelos_disponiveis = [m.name for m in genai.list_models()
                               if 'generateContent' in m.supported_generation_methods]

        # 2. Define a ordem de prioridade para o teste da MarryMe
        if "models/gemini-1.5-flash" in modelos_disponiveis:
            modelo_nome = "models/gemini-1.5-flash"
        elif "models/gemini-1.5-pro" in modelos_disponiveis:
            modelo_nome = "models/gemini-1.5-pro"
        elif "models/gemini-pro" in modelos_disponiveis:
            modelo_nome = "models/gemini-pro"
        elif modelos_disponiveis:
            modelo_nome = modelos_disponiveis[0]
        else:
            return {"erro": "Nenhum modelo de geração de conteúdo encontrado nesta conta."}

        model = genai.GenerativeModel(modelo_nome)

        print(f"... Usando modelo: {modelo_nome} ...")
        response = model.generate_content(prompt)

        if not response or not response.text:
            return {"erro": "A IA retornou uma resposta vazia ou bloqueada."}

        texto = response.text

        # 🔧 Limpeza de JSON (pega o que está entre as crases)
        if "```json" in texto:
            texto = texto.split("```json")[1].split("```")[0].strip()
        elif "```" in texto:
            texto = texto.split("```")[1].split("```")[0].strip()

        # Tenta validar se é um JSON, se não for, retorna o texto puro
        try:
            return json.loads(texto)
        except:
            return texto.strip()

    except Exception as e:
        print(f"❌ Erro crítico na API: {e}")
        return {"erro": str(e)}


# 📂 Carregar cliente manual
def carregar_cliente():
    caminho = "data/cliente.json"
    if not os.path.exists(caminho):
        print(f"❌ Erro: Arquivo {caminho} não encontrado.")
        exit()
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)


# 📂 Carregar prompt
def carregar_prompt(caminho):
    if not os.path.exists(caminho):
        print(f"❌ Erro: Arquivo de prompt {caminho} não encontrado.")
        return ""
    with open(caminho, "r", encoding="utf-8") as f:
        return f.read()


# 💾 Salvar output
def salvar_output(nome_cliente, dados):
    if not os.path.exists("outputs"):
        os.makedirs("outputs")

    nome_limpo = str(nome_cliente).replace(' ', '_').lower()
    nome_arquivo = f"outputs/{nome_limpo}.json"

    with open(nome_arquivo, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Processo finalizado!")
    print(f"💾 Arquivo gerado: {nome_arquivo}")


# 🚀 MAIN
def main():
    print("🚀 Iniciando Processador MarryMe v1.0 (Modo de Teste)\n")

    cliente = carregar_cliente()
    nome_artistico = cliente.get("nome_artistico", "cliente_teste")

    # --- PASSO 1: ESTRATÉGIA ---
    print("Step 1/3: Extraindo Estratégia da Entrevista...")
    prompt_estrategia = carregar_prompt("prompts/prompt_estrategia.txt")
    prompt_estrategia = prompt_estrategia.replace(
        "{{JSON_CLIENTE}}", json.dumps(cliente, ensure_ascii=False)
    )
    resposta_estrategia = gerar_resposta(prompt_estrategia)

    time.sleep(5)  # Delay para evitar limite de quota do plano grátis

    # --- PASSO 2: ROTEIRO ---
    print("Step 2/3: Gerando Roteiro Personalizado...")
    prompt_roteiro = carregar_prompt("prompts/prompt_roteiro.txt")

    # Prepara a estratégia para o próximo prompt (seja dict ou string)
    est_data = json.dumps(resposta_estrategia, ensure_ascii=False) if isinstance(
        resposta_estrategia, dict) else resposta_estrategia

    prompt_roteiro = prompt_roteiro.replace("{{JSON_ESTRATEGICO}}", est_data)
    resposta_roteiro = gerar_resposta(prompt_roteiro)

    time.sleep(5)

    # --- PASSO 3: ANÚNCIOS ---
    print("Step 3/3: Criando CTAs para Ads...")
    prompt_ads = carregar_prompt("prompts/prompt_ads.txt")
    prompt_ads = prompt_ads.replace("{{JSON_ESTRATEGICO}}", est_data)
    resposta_ads = gerar_resposta(prompt_ads)

    # 💾 Compilar e Salvar tudo
    resultado_final = {
        "cliente": cliente,
        "analise_estrategica": resposta_estrategia,
        "roteiro_sugerido": resposta_roteiro,
        "copy_anuncios": resposta_ads
    }

    salvar_output(nome_artistico, resultado_final)


if __name__ == "__main__":
    main()
