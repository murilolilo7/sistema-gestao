"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar } from "@/components/Ui";
import { pecasComPrecoDesatualizado } from "./receita";

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Aviso no topo do Cálculo de peças: o preço gravado de uma peça não muda
// sozinho quando o aço, o cimento ou um salário mudam — só o custo da receita.
// Aqui aparecem as peças em que os dois se separaram, para atualizar de uma
// vez, vendo antes o que muda. Orçamentos já salvos não são tocados.
export default function PrecosDesatualizados({ composicoes, onSalvo }) {
  const lista = useMemo(() => pecasComPrecoDesatualizado(composicoes), [composicoes]);
  const [desmarcadas, setDesmarcadas] = useState(() => new Set());
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const selecionadas = lista.filter((p) => !desmarcadas.has(p.id));

  function alternar(id) {
    setDesmarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function atualizar() {
    if (selecionadas.length === 0) return;
    const ok = await confirmar({
      titulo: `Atualizar ${selecionadas.length} preço(s)?`,
      texto:
        "O preço de cada peça marcada passa a ser o da receita (custo × (1 + BDI)). " +
        "Vale para os próximos orçamentos; os já salvos não mudam.",
      confirmarTexto: "Atualizar",
    });
    if (!ok) return;
    setSalvando(true);
    const erros = [];
    for (const p of selecionadas) {
      const { error } = await supabase
        .from("composicoes_galpao")
        .update({ preco: p.precoNovo, custo: p.custo })
        .eq("id", p.id);
      if (error) erros.push(`${p.nome}: ${error.message}`);
    }
    setSalvando(false);
    if (erros.length > 0) notificar("Alguns preços não foram atualizados: " + erros.join(" · "), "erro");
    else notificar(`${selecionadas.length} preço(s) atualizado(s) pela receita.`);
    setDesmarcadas(new Set());
    onSalvo();
  }

  if (lista.length === 0) {
    return (
      <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <CheckCircle2 size={14} /> Todos os preços estão de acordo com as receitas.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <AlertTriangle size={16} />
          {lista.length} peça{lista.length > 1 ? "s" : ""} com preço diferente da receita
        </p>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="text-xs font-medium text-amber-900 underline"
        >
          {aberto ? "Esconder lista" : "Ver lista"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-amber-900/80">
        O preço gravado não muda sozinho quando o preço do aço, do cimento ou da mão de obra muda. Confira e
        atualize: vale para os próximos orçamentos; os já salvos não mudam.
      </p>
      {aberto && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-amber-200 text-left text-amber-900">
                  <th className="py-1 pr-2 font-medium">Atualizar</th>
                  <th className="py-1 pr-2 font-medium">Peça</th>
                  <th className="py-1 pr-2 text-right font-medium">Preço hoje</th>
                  <th className="py-1 pr-2 text-right font-medium">Pela receita</th>
                  <th className="py-1 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-amber-100">
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={!desmarcadas.has(p.id)}
                        onChange={() => alternar(p.id)}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="py-1 pr-2 text-slate-800">
                      {p.nome}
                      {p.unidade === "M2" ? " (por m²)" : ""}
                    </td>
                    <td className="py-1 pr-2 text-right">{moeda(p.precoAtual)}</td>
                    <td className="py-1 pr-2 text-right font-medium">{moeda(p.precoNovo)}</td>
                    <td className={`py-1 text-right ${p.diferenca > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {p.diferenca > 0 ? "+" : ""}
                      {moeda(p.diferenca)} ({p.diferenca > 0 ? "+" : ""}
                      {((p.diferenca / (p.precoAtual || 1)) * 100).toFixed(1).replace(".", ",")}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={atualizar}
            disabled={salvando || selecionadas.length === 0}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            {salvando ? "Atualizando..." : `Atualizar as marcadas (${selecionadas.length})`}
          </button>
        </>
      )}
    </div>
  );
}
