import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente para uso no browser (componentes client-side)
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
