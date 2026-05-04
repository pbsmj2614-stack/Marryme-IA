"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  user?: User | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  cs_senior: "CS Sênior",
  cs_junior: "CS",
  viewer: "Viewer",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  cs_senior: "bg-brand-100 text-brand-700",
  cs_junior: "bg-gray-100 text-gray-600",
  viewer: "bg-gray-100 text-gray-400",
};

const NAV_LINKS = [
  { href: "/", label: "Prestadores" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/daily", label: "Daily" },
];

function UserAvatar({ email }: { email: string }) {
  const initials = email.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-semibold select-none"
    >
      {initials}
    </span>
  );
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useRole();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-brand-700 text-lg tracking-tight">
          MarryMe
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm px-3 py-1.5 rounded-lg transition ${
                  active
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-gray-600 hover:text-brand-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </Link>
            );
          })}

          <Button asChild size="sm" className="ml-1">
            <Link href="/novo">+ Novo</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <div className="flex items-center gap-2">
                <UserAvatar email={user.email ?? "?"} />
                <span className="text-xs text-gray-500 hidden sm:block max-w-[140px] truncate">
                  {user.email}
                </span>
                {role && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline-block ${
                      ROLE_COLOR[role] ?? ROLE_COLOR.cs_junior
                    }`}
                  >
                    {ROLE_LABEL[role] ?? role}
                  </span>
                )}
              </div>

              {role === "admin" && (
                <Link
                  href="/admin/logs"
                  className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:block"
                >
                  Admin
                </Link>
              )}

              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
