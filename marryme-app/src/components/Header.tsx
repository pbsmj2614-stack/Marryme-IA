"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface HeaderProps {
  user?: User | null;
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter();

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

        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-600 hover:text-brand-600 transition">
            Prestadores
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-brand-600 transition">
            Dashboard BI
          </Link>
          <Link href="/pipeline" className="text-sm text-gray-600 hover:text-brand-600 transition">
            Pipeline
          </Link>
          <Link href="/daily" className="text-sm text-gray-600 hover:text-brand-600 transition">
            Daily
          </Link>
          <Link
            href="/novo"
            className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition font-medium"
          >
            + Novo
          </Link>
          {user && (
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800 transition"
            >
              Sair
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
