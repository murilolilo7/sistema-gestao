"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Inbox, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/* =====================================================================
   COMPONENTES VISUAIS COMPARTILHADOS DO SISTEMA
   - notificar(texto, tipo)  -> balão de aviso no canto (some sozinho)
   - confirmar({...})        -> modal de confirmação (retorna true/false)
   - <LinhasEsqueleto />     -> "esqueleto" animado enquanto carrega
   - <EstadoVazio />         -> tela vazia amigável
   Os componentes <Notificacoes/> e <Confirmador/> ficam montados no
   AppShell — as funções notificar() e confirmar() funcionam em
   qualquer tela sem precisar importar nada além deste arquivo.
   ===================================================================== */

// ---------------------- NOTIFICAÇÕES (toasts) ----------------------

export function notificar(texto, tipo = "sucesso") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ui:notificar", { detail: { texto, tipo } }));
}

export function Notificacoes() {
  const [avisos, setAvisos] = useState([]);

  useEffect(() => {
    let contador = 0;
    function aoNotificar(e) {
      const id = ++contador;
      setAvisos((atual) => [...atual, { id, ...e.detail }]);
      setTimeout(() => {
        setAvisos((atual) => atual.filter((a) => a.id !== id));
      }, 4000);
    }
    window.addEventListener("ui:notificar", aoNotificar);
    return () => window.removeEventListener("ui:notificar", aoNotificar);
  }, []);

  if (avisos.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 print:hidden">
      {avisos.map((a) => (
        <div
          key={a.id}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg bg-white ${
            a.tipo === "erro"
              ? "border-red-200 text-red-700"
              : "border-emerald-200 text-emerald-800"
          }`}
        >
          {a.tipo === "erro" ? (
            <XCircle size={18} className="text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          )}
          <span className="max-w-xs">{a.texto}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------- CONFIRMAÇÃO (modal) ----------------------

let resolverConfirmacao = null;

export function confirmar({
  titulo = "Tem certeza?",
  texto = "",
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  perigoso = false,
} = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    resolverConfirmacao = resolve;
    window.dispatchEvent(
      new CustomEvent("ui:confirmar", {
        detail: { titulo, texto, confirmarTexto, cancelarTexto, perigoso },
      })
    );
  });
}

export function Confirmador() {
  const [pedido, setPedido] = useState(null);

  useEffect(() => {
    function aoPedir(e) {
      setPedido(e.detail);
    }
    window.addEventListener("ui:confirmar", aoPedir);
    return () => window.removeEventListener("ui:confirmar", aoPedir);
  }, []);

  function responder(resposta) {
    setPedido(null);
    if (resolverConfirmacao) {
      resolverConfirmacao(resposta);
      resolverConfirmacao = null;
    }
  }

  if (!pedido) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={() => responder(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <span
            className={`shrink-0 p-2 rounded-full ${
              pedido.perigoso ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
            }`}
          >
            <AlertTriangle size={20} />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{pedido.titulo}</h3>
            {pedido.texto && (
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{pedido.texto}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => responder(false)}
            className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 transition"
          >
            {pedido.cancelarTexto}
          </button>
          <button
            type="button"
            onClick={() => responder(true)}
            className={`rounded-lg text-white text-sm font-medium px-4 py-2 transition ${
              pedido.perigoso
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {pedido.confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------- ESQUELETO DE CARREGAMENTO ----------------------

export function LinhasEsqueleto({ linhas = 4 }) {
  return (
    <div className="p-4 space-y-2.5">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-10 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 flex-1 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------- ESTADO VAZIO ----------------------

export function EstadoVazio({ icone: Icone = Inbox, titulo, texto, children }) {
  return (
    <div className="p-10 text-center">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
        <Icone size={22} />
      </span>
      <p className="font-medium text-slate-700">{titulo}</p>
      {texto && <p className="text-sm text-slate-400 mt-1">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ---------------------- PAGINAÇÃO ----------------------

export function usePaginacao(itens, porPagina = 20) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  // Se a lista encolher (ex: filtro), volta para uma página válida
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const itensPagina = itens.slice(inicio, inicio + porPagina);
  return {
    pagina: paginaAtual,
    setPagina,
    totalPaginas,
    itensPagina,
    total: itens.length,
    inicio,
    fim: inicio + itensPagina.length,
  };
}

export function ControlePaginacao({ pagina, setPagina, totalPaginas, total, inicio, fim }) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm">
      <p className="text-slate-500">
        Mostrando <b className="text-slate-700">{inicio + 1}</b>–
        <b className="text-slate-700">{fim}</b> de{" "}
        <b className="text-slate-700">{total}</b>
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="px-3 text-slate-500">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------- ORDENAÇÃO CLICÁVEL ----------------------

export function useOrdenacao() {
  const [campo, setCampo] = useState(null);
  const [asc, setAsc] = useState(true);

  function ordenar(novoCampo) {
    if (campo === novoCampo) {
      setAsc((v) => !v);
    } else {
      setCampo(novoCampo);
      setAsc(true);
    }
  }

  // Ordena a lista pelo campo escolhido: números como números,
  // textos por ordem alfabética (pt-BR), vazios sempre no fim.
  function aplicar(itens) {
    if (!campo) return itens;
    const copia = [...itens];
    copia.sort((a, b) => {
      const va = a?.[campo];
      const vb = b?.[campo];
      const vazioA = va === null || va === undefined || va === "";
      const vazioB = vb === null || vb === undefined || vb === "";
      if (vazioA && vazioB) return 0;
      if (vazioA) return 1;
      if (vazioB) return -1;
      const na = Number(va);
      const nb = Number(vb);
      let r;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        r = na - nb;
      } else {
        r = String(va).localeCompare(String(vb), "pt-BR", { sensitivity: "base" });
      }
      return asc ? r : -r;
    });
    return copia;
  }

  return { campo, asc, ordenar, aplicar };
}

export function ThOrdenavel({ campo, ordenacao, children, className }) {
  const ativo = ordenacao.campo === campo;
  return (
    <th className={className || "px-4 py-2 font-medium"}>
      <button
        type="button"
        onClick={() => ordenacao.ordenar(campo)}
        className="inline-flex items-center gap-0.5 hover:text-slate-900 select-none"
        title="Clique para ordenar"
      >
        {children}
        <span className="text-[9px] w-2">{ativo ? (ordenacao.asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

// ---------------------- ACESSO DE ADMINISTRADOR ----------------------

// Verifica se o usuário logado é administrador.
// Retorna: null (ainda verificando), true (admin) ou false (não é).
export function useSouAdmin() {
  const [souAdmin, setSouAdmin] = useState(null);
  useEffect(() => {
    let ativo = true;
    supabase
      .rpc("eh_admin")
      .then(({ data }) => {
        if (ativo) setSouAdmin(!!data);
      })
      .catch(() => {
        if (ativo) setSouAdmin(false);
      });
    return () => {
      ativo = false;
    };
  }, []);
  return souAdmin;
}

// Tela padrão exibida quando alguém sem permissão tenta abrir
// uma área exclusiva de administradores.
export function AcessoRestrito() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm max-w-lg mx-auto mt-8">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
        <Lock size={22} />
      </span>
      <p className="font-semibold text-slate-800">Acesso restrito</p>
      <p className="text-sm text-slate-500 mt-1">
        Esta área é exclusiva dos administradores do sistema. Se você precisa de
        acesso, fale com o responsável.
      </p>
    </div>
  );
}
