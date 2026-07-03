"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AppShell({ children }) {
  const [session, setSession] = useState(undefined);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== "/login") {
      router.replace("/login");
    }
    if (session && pathname === "/login") {
      router.replace("/");
    }
  }, [session, pathname, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Carregando...
      </div>
    );
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <a href="/" className="font-bold text-lg tracking-tight">
            MR7 <span className="text-emerald-400">Pré-Moldados</span>
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/produtos" className="hover:text-emerald-400 transition">
              Produtos
            </a>
            <a href="/clientes" className="hover:text-emerald-400 transition">
              Clientes
            </a>
            <a href="/vendas" className="hover:text-emerald-400 transition">
              Vendas
            </a>
            <a href="/orcamentos" className="hover:text-emerald-400 transition">
              Orçamentos
            </a>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 text-xs hidden sm:inline">
              {session.user.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 text-xs font-medium"
            >
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="text-center text-xs text-slate-400 py-4">
        Sistema de Gestão MR7 · Feito com Next.js + Supabase
      </footer>
    </div>
  );
}
