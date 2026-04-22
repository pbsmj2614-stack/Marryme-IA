/**
 * Extrai mensagem de erro de uma chamada a Supabase Edge Function.
 *
 * O objeto FunctionsHttpError do SDK inclui um campo `context` que é o
 * Response HTTP original, ainda não consumido. Esta função lê esse body
 * para retornar a mensagem real do servidor.
 */
export async function extractFunctionError(
  error: { message?: string; [key: string]: unknown },
  fallback = "Erro inesperado"
): Promise<string> {
  const msg = error.message ?? fallback;
  const ctx = error.context;

  if (ctx instanceof Response) {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: string; message?: string };
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      try {
        return (await (ctx as Response).clone().text()) || msg;
      } catch {
        /* ignora */
      }
    }
  }

  return msg;
}
