"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fatorSalario, resumoArmacao } from "../engenharia/armacao";

// Mão de obra de armação de todas as peças do orçamento. SÓ MOSTRA: não muda
// nenhum item nem o preço. O custo-hora vem do cadastro de mão de obra.
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 0) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

export default function MaoDeObraArmacao({ itens, subtotal }) {
  const [aberto, setAberto] = useState(true);
  const [armador, setArmador] = useState(undefined);

  useEffect(() => {
    supabase
      .from("mao_de_obra")
      .select("valor_hora, base_horas_mes")
      .eq("funcao", "ARMADOR")
      .limit(1)
      .then(({ data }) => setArmador(data?.[0] || null));
  }, []);

  const resumo = useMemo(
    () => (armador ? resumoArmacao(itens, fatorSalario(armador.valor_hora, armador.base_horas_mes)) : null),
    [itens, armador]
  );

  if (armador !== undefined && !armador) {
    return (
      <p className="mb-3 text-xs text-amber-700">
        Mão de obra de armação: não foi possível ler o custo do armador no cadastro.
      </p>
    );
  }
  if (!resumo || resumo.linhas.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/50">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <FlaskConical size={16} /> Mão de obra de armação — só conferência, em teste
        </span>
        <ChevronDown size={16} className={`text-violet-700 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="px-3 pb-3">
          <p className="mb-2 text-[11px] text-violet-800/80">
            Não muda nada no orçamento. Salário com encargos da equipe + prêmio por peça, pela produção de
            jul–out/2026. O valor é o mesmo para qualquer tamanho de peça. Laje em painéis de 7,43 m².
          </p>
          <div className="overflow-x-auto rounded-lg border border-violet-200 bg-white">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-1.5 font-medium">Peça</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qtd.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Por peça</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumo.linhas.map((l) => (
                  <tr key={l.tipo} className="border-b border-slate-100">
                    <td className="px-2 py-1">{l.rotulo}</td>
                    <td className="px-2 py-1 text-right">{num(l.pecas, Number.isInteger(l.pecas) ? 0 : 1)}</td>
                    <td className="px-2 py-1 text-right">{moeda(l.porPeca)}</td>
                    <td className="px-2 py-1 text-right">{moeda(l.total)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1.5" colSpan={3}>
                    Armação do orçamento
                    {subtotal > 0 && (
                      <span className="ml-1 font-normal text-slate-500">
                        ({num((resumo.total / subtotal) * 100, 1)}% do subtotal das peças)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">{moeda(resumo.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
