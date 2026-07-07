"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Settings, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const GRUPO_CADASTROS = [
  { href: "/clientes", label: "Clientes" },
  { href: "/produtos", label: "Produtos" },
];

const GRUPO_VENDAS = [
  { href: "/vendas", label: "Vendas" },
  { href: "/orcamentos", label: "Orçamentos" },
  { href: "/orcamentos-galpao", label: "Orçamentos Galpão" },
];

const GRUPO_CONFIG = [
  { href: "/precos", label: "Preços" },
  { href: "/historico-precos", label: "Histórico de Preços" },
  { href: "/configuracoes", label: "Configurações" },
];

function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return "";
  return nomeCompleto.trim().split(/\s+/)[0];
}

function MenuSuspenso({ rotulo, icone, itens, aberto, onAlternar, onFechar, alinhamento = "left" }) {
  const pathname = usePathname();
  return (
    <div className="relative">
      <button
        onClick={onAlternar}
        title={typeof rotulo === "string" ? rotulo : undefined}
        className="flex items-center gap-1 text-slate-300 hover:text-white transition text-sm"
      >
        {icone}
        {typeof rotulo === "string" && rotulo}
        <ChevronDown size={12} className={`transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div
          className={`absolute top-full ${alinhamento === "right" ? "right-0" : "left-0"} mt-2 min-w-[180px] rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-50`}
        >
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onFechar}
              className={`block px-4 py-2 text-sm transition ${
                pathname === item.href
                  ? "bg-emerald-50 text-emerald-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const [session, setSession] = useState(undefined);
  const [menuAberto, setMenuAberto] = useState(null); // null | 'cadastros' | 'vendas' | 'config'
  const navRef = useRef(null);
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

  // Fecha o menu suspenso ao clicar fora dele.
  useEffect(() => {
    function aoClicarFora(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setMenuAberto(null);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  // O menu já fecha explicitamente ao clicar em cada link (onFechar) e
  // ao clicar fora dele — não precisa de um efeito extra por rota.

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

  const nomeCompleto = session.user.user_metadata?.nome_completo;
  const nomeExibido = primeiroNome(nomeCompleto) || session.user.email;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <Link href="/" className="font-bold text-lg tracking-tight">
            MR7 <span className="text-emerald-400">Pré-Moldados</span>
          </Link>
          <nav ref={navRef} className="flex items-center gap-4 text-sm">
            <MenuSuspenso
              rotulo="Cadastros"
              itens={GRUPO_CADASTROS}
              aberto={menuAberto === "cadastros"}
              onAlternar={() => setMenuAberto((m) => (m === "cadastros" ? null : "cadastros"))}
              onFechar={() => setMenuAberto(null)}
            />
            <MenuSuspenso
              rotulo="Vendas"
              itens={GRUPO_VENDAS}
              aberto={menuAberto === "vendas"}
              onAlternar={() => setMenuAberto((m) => (m === "vendas" ? null : "vendas"))}
              onFechar={() => setMenuAberto(null)}
            />
            <span className="text-slate-600">|</span>

            <span className="hidden sm:inline text-slate-300 text-xs">{nomeExibido}</span>

            <Link
              href="/usuarios"
              title="Usuários"
              className="text-slate-300 hover:text-white transition"
            >
              <Users size={16} />
            </Link>
            <MenuSuspenso
              rotulo={null}
              icone={<Settings size={16} />}
              itens={GRUPO_CONFIG}
              aberto={menuAberto === "config"}
              onAlternar={() => setMenuAberto((m) => (m === "config" ? null : "config"))}
              onFechar={() => setMenuAberto(null)}
              alinhamento="right"
            />
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
