"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Users,
  Package,
  ShoppingCart,
  FileText,
  Warehouse,
  Tags,
  History,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Notificacoes, Confirmador } from "@/components/Ui";

// Estrutura do menu lateral: seções com ícones. Para adicionar uma nova
// tela no futuro, basta incluir uma linha aqui.
const MENU = [
  {
    titulo: null,
    itens: [{ href: "/", label: "Início", icone: Home }],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/clientes", label: "Clientes", icone: Users },
      { href: "/produtos", label: "Produtos", icone: Package },
    ],
  },
  {
    titulo: "Vendas",
    itens: [
      { href: "/vendas", label: "Vendas", icone: ShoppingCart },
      { href: "/orcamentos", label: "Orçamentos", icone: FileText },
      { href: "/orcamentos-galpao", label: "Orçamentos Galpão", icone: Warehouse },
      { href: "/relatorios", label: "Relatórios", icone: BarChart3 },
    ],
  },
  {
    titulo: "Preços",
    itens: [
      { href: "/precos", label: "Preços", icone: Tags },
      { href: "/historico-precos", label: "Histórico de Preços", icone: History },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/usuarios", label: "Usuários", icone: UserCog },
      { href: "/configuracoes", label: "Configurações", icone: Settings },
    ],
  },
];

function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return "";
  return nomeCompleto.trim().split(/\s+/)[0];
}

function iniciais(nomeCompleto, email) {
  const base = (nomeCompleto || email || "?").trim();
  const partes = base.split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function ItemMenu({ href, label, icone: Icone, ativo, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        ativo
          ? "bg-emerald-600 text-white font-medium shadow-sm"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <Icone size={17} className={ativo ? "text-white" : "text-slate-400"} />
      {label}
    </Link>
  );
}

function ConteudoSidebar({ pathname, aoNavegar, nomeExibido, iniciaisUsuario, onLogout }) {
  return (
    <div className="flex flex-col h-full">
      <Link
        href="/"
        onClick={aoNavegar}
        className="flex items-center gap-2 px-4 h-16 border-b border-slate-800 shrink-0"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600 text-white font-black text-sm">
          M7
        </span>
        <span className="font-bold text-white tracking-tight leading-tight">
          MR7 <span className="text-emerald-400">Pré-Moldados</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {MENU.map((secao, idx) => (
          <div key={idx}>
            {secao.titulo && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {secao.titulo}
              </p>
            )}
            <div className="space-y-0.5">
              {secao.itens.map((item) => (
                <ItemMenu
                  key={item.href}
                  {...item}
                  ativo={
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href + "/"))
                  }
                  onClick={aoNavegar}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-emerald-300 text-xs font-bold shrink-0">
            {iniciaisUsuario}
          </span>
          <span className="text-sm text-slate-300 truncate flex-1">{nomeExibido}</span>
          <button
            onClick={onLogout}
            title="Sair do sistema"
            className="text-slate-500 hover:text-red-400 transition shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const [session, setSession] = useState(undefined);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((evento, newSession) => {
      setSession(newSession);
      // Sessão expirada / logout em outra aba: avisa e manda pro login
      if (evento === "SIGNED_OUT" && window.location.pathname !== "/login") {
        try {
          window.dispatchEvent(
            new CustomEvent("ui:notificar", {
              detail: { texto: "Sua sessão expirou. Entre novamente.", tipo: "erro" },
            })
          );
        } catch (e) { /* ok */ }
      }
    });
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

  // Fecha o menu mobile ao trocar de página
  useEffect(() => {
    setMenuMobileAberto(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-slate-500 text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-emerald-600 animate-spin" />
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
  const iniciaisUsuario = iniciais(nomeCompleto, session.user.email);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* -------- Sidebar fixa (telas médias/grandes) -------- */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 bg-slate-900 flex-col z-40 print:hidden">
        <ConteudoSidebar
          pathname={pathname}
          nomeExibido={nomeExibido}
          iniciaisUsuario={iniciaisUsuario}
          onLogout={handleLogout}
        />
      </aside>

      {/* -------- Barra superior (celular) -------- */}
      <header className="md:hidden sticky top-0 z-40 bg-slate-900 text-white print:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs">
              M7
            </span>
            MR7 <span className="text-emerald-400">Pré-Moldados</span>
          </Link>
          <button
            onClick={() => setMenuMobileAberto((v) => !v)}
            className="text-slate-300 hover:text-white p-1"
            title="Menu"
          >
            {menuMobileAberto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* -------- Menu mobile (gaveta) -------- */}
      {menuMobileAberto && (
        <div className="md:hidden fixed inset-0 z-50 print:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuMobileAberto(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-slate-900 shadow-2xl">
            <button
              onClick={() => setMenuMobileAberto(false)}
              className="absolute top-4 right-3 text-slate-400 hover:text-white z-10"
              title="Fechar"
            >
              <X size={20} />
            </button>
            <ConteudoSidebar
              pathname={pathname}
              aoNavegar={() => setMenuMobileAberto(false)}
              nomeExibido={nomeExibido}
              iniciaisUsuario={iniciaisUsuario}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* -------- Conteúdo -------- */}
      <div className="md:pl-60 print:pl-0 flex flex-col min-h-screen">
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
          {children}
        </main>
        <footer className="text-center text-xs text-slate-400 py-4 print:hidden">
          Sistema de Gestão MR7 · Feito com Next.js + Supabase
        </footer>
      </div>
      {/* Avisos (toasts) e modal de confirmação — disponíveis em todas as telas */}
      <Notificacoes />
      <Confirmador />
    </div>
  );
}
