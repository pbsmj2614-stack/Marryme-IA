/**
 * Tipos gerados automaticamente pelo Supabase CLI.
 * Execute `npm run db:types` para regenerar após mudanças no schema.
 *
 * Requer: SUPABASE_PROJECT_ID no ambiente e Supabase CLI instalado globalmente.
 *   npm install -g supabase
 *   npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Este arquivo será sobrescrito por `npm run db:types`.
// Tipos específicos do domínio ficam em src/lib/types.ts.
export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
  };
}
