"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  admin: "bg-red-900/40 text-red-300",
  cs_senior: "bg-brand-700 text-brand-400",
  cs_junior: "bg-white/10 text-white/60",
  viewer: "bg-white/5 text-white/40",
};

function UserAvatar({ email }: { email: string }) {
  const initials = email.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-mm-lilac text-brand-900 text-xs font-semibold select-none"
    >
      {initials}
    </span>
  );
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter();
  const { role } = useRole();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-brand-800 border-b border-brand-700 sticky top-0 z-10">
      <div className="px-4 h-12 flex items-center justify-end gap-3">
        {user && (
          <>
            <div className="flex items-center gap-2">
              <UserAvatar email={user.email ?? "?"} />
              <span className="text-xs text-white/60 hidden sm:block max-w-[160px] truncate">
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
                className="text-xs text-white/40 hover:text-white/80 transition hidden sm:block"
              >
                Admin
              </Link>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Sair
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
