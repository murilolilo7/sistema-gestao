"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Pencil, Settings, Tag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function AppShell({ children }) {
  const [session, setSession] = useState(undefined);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeTemp, setNomeTemp] = useState("");
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

  function iniciarEdicaoNome() {
    setNomeTemp(session.user.user_metadata?.nome_completo || "");
    setEditandoNome(true);
  }

  async function salvarNome() {
    if (!nomeTemp.trim()) {
      setEditandoNome(false);
      return;
    }
    const { data, error } = await supabase.auth.updateUser({
      data: { nome_completo: nomeTemp.trim() },
    });
    if (!error && data?.user) {
      setSession((s) => ({ ...s, user: data.user }));
    }
    setEditandoNome(false);
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

  const nomeExibido = session.user.user_metadata?.nome_completo || session.user.email;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <Link href="/" className="font-bold text-lg tracking-tight">
            MR7 <span className="text-emerald-400">Pré-Moldados</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/produtos" className="hover:text-emerald-400 transition">
              Produtos
            </Link>
            <Link href="/clientes" className="hover:text-emerald-400 transition">
              Clientes
            </Link>
            <Link href="/vendas" className="hover:text-emerald-400 transition">
              Vendas
            </Link>
            <Link href="/orcamentos" className="hover:text-emerald-400 transition">
              Orçamentos
            </Link>
            <Link href="/orcamentos-galpao" className="hover:text-emerald-400 transition">
              Orçamentos Galpão
            </Link>
            <span className="text-slate-600">|</span>

            {editandoNome ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nomeTemp}
                  onChange={(e) => setNomeTemp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && salvarNome()}
                  onBlur={salvarNome}
                  placeholder="Seu nome completo"
                  className="text-xs text-slate-900 rounded px-2 py-1 w-36"
                />
              </span>
            ) : (
              <button
                onClick={iniciarEdicaoNome}
                title="Clique para editar seu nome"
                className="hidden sm:flex items-center gap-1 text-slate-300 text-xs hover:text-white transition"
              >
                {nomeExibido}
                <Pencil size={12} />
              </button>
            )}

            <Link
              href="/precos"
              title="Preços"
              className="text-slate-300 hover:text-white transition"
            >
              <Tag size={16} />
            </Link>
            <Link
              href="/configuracoes"
              title="Configurações"
              className="text-slate-300 hover:text-white transition"
            >
              <Settings size={16} />
            </Link>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 text-xs font-medium"
            >
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 print:p-0 print:max-w-none">
        {children}
      </main>
      <footer className="text-center text-xs text-slate-400 py-4 print:hidden">
        Sistema de Gestão MR7 · Feito com Next.js + Supabase
      </footer>
    </div>
  );
}
