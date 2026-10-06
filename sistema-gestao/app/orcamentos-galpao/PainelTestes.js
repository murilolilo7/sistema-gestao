"use client";

import { useSyncExternalStore } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";

// Agrupa as comparações do cálculo novo (em teste) num botão só, fechado por
// padrão, para a tela do orçamento ficar limpa. Lembra aberto/fechado no
// navegador (no servidor começa sempre fechado — sem diferença na hidratação).
const CHAVE = "orcamento-galpao-testes-aberto";
const EVENTO = "painel-testes-mudou";

function lerAberto() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}
function assinar(aviso) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}

export default function PainelTestes({ children }) {
  const aberto = useSyncExternalStore(assinar, lerAberto, () => false);
  function alternar() {
    try {
      localStorage.setItem(CHAVE, aberto ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
  }
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={alternar}
        className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
      >
        <FlaskConical size={14} /> {aberto ? "Esconder o" : "Comparar com o"} cálculo novo (teste)
        <ChevronDown size={14} className={`transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && <div className="mt-2">{children}</div>}
    </div>
  );
}
