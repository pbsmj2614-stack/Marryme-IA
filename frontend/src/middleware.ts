import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Renova o token de sessão — obrigatório para @supabase/ssr funcionar
  // Promise.race: cookie corrompido lança exceção; timeout de 5s evita que o
  // Vercel Edge mate a requisição com 504 se o Supabase travar sem jogar erro.
  let user = null;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("auth timeout")), 5000)
    );
    const { data } = await Promise.race([supabase.auth.getUser(), timeout]);
    user = data.user;
  } catch {
    // Cookie inválido ou Supabase lento — trata como não autenticado
  }

  // Redireciona para /login se não autenticado (exceto a própria /login)
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    // Rotas de API retornam 401 JSON — nunca redirecionar fetch/XHR para /login
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware em todas as rotas exceto:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico
     * - imagens públicas
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
