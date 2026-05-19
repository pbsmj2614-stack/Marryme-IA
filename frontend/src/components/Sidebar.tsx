"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, GitBranch, CalendarDays, BarChart2, Plus } from "lucide-react";

const NAV = [
  { href: "/", label: "Prestadores", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
];

export default function Sidebar() {
  const pathname = usePathname();

  if (pathname?.startsWith("/login")) return null;

  return (
    <aside className="w-56 shrink-0 sticky top-0 h-screen flex flex-col bg-white border-r border-border z-20">
      {/* ── Brand ── */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center text-white text-xs font-bold shrink-0 group-hover:bg-brand-800 transition">
            MM
          </span>
          <div className="min-w-0">
            <p className="font-bold text-brand-900 text-sm leading-tight">MarryMe</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Gestão de clientes</p>
          </div>
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-100 text-brand-700"
                  : "text-muted-foreground hover:bg-rose-50 hover:text-brand-700"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${active ? "text-brand-600" : "text-muted-foreground"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── Novo prestador ── */}
      <div className="px-3 pb-5">
        <Link
          href="/novo"
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo prestador
        </Link>
      </div>
    </aside>
  );
}
