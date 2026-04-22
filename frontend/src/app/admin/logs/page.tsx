import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { PageHeader } from "@/components/ui";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

interface ActivityLog {
  id: string;
  user_email: string | null;
  entity_type: string | null;
  entity_nome: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_BADGE: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  approve: "bg-purple-100 text-purple-700",
  generate: "bg-brand-100 text-brand-700",
};

export default async function AdminLogsPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verifica role via RPC (SECURITY DEFINER)
  const { data: roleData } = await supabase.rpc("fn_get_my_role");
  if (roleData !== "admin") redirect("/");

  // Admin client para leitura irrestrita de activity_log
  const admin = createAdminClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  const { data: logs } = await admin
    .from("activity_log")
    .select("id, user_email, entity_type, entity_nome, action, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (logs ?? []) as ActivityLog[];

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Logs de Atividade" subtitle={`${rows.length} registros mais recentes`} />

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Data
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Usuário
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Ação
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Entidade
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                  Nome
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    Nenhum log registrado ainda.
                  </td>
                </tr>
              ) : (
                rows.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 truncate max-w-[160px]">
                      {log.user_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_BADGE[log.action] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.entity_type ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700 hidden lg:table-cell">
                      {log.entity_nome ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
