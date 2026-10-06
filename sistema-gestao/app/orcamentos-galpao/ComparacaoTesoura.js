"use client";

import { useMemo, useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { papelDoItem } from "./calculos";
import { calcularTesoura, TELHAS } from "../engenharia/tesoura/calculo";
import { usePrecosTesoura, custoTesoura } from "../engenharia/tesoura/precos";

// =====================================================================
// COMPARAÇÃO — tesoura pelo cálculo novo x preço que está no orçamento.
// SÓ MOSTRA: não muda nenhum item. O preço continua do jeito atual
// (referência proporcional ao metro).
// =====================================================================

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

// Vão da tesoura a partir do nome do item ("TESOURA 16M", "Tesoura 14,5M de vão livre…")
export function vaoDoNome(nome) {
  const m = String(nome || "").match(/(\d+(?:[.,]\d+)?)\s*M\b/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

export function telhaDoNome(nome) {
  const n = String(nome || "").toUpperCase();
  if (n.includes("SANDU")) return "sanduiche";
  if (n.includes("METÁL") || n.includes("METAL") || n.includes("ZINC") || n.includes("TERMO")) return "metalica";
  if (/6\s*MM/.test(n)) return "fibro6";
  return "fibro5";
}

export default function ComparacaoTesoura({ itens, modulacao, telhaNome }) {
  const [aberto, setAberto] = useState(true);
  const precos = usePrecosTesoura();
  const telha = telhaDoNome(telhaNome);
  const espessura = Number(precos?.param?.tesoura_espessura) > 0 ? Number(precos.param.tesoura_espessura) : 0.2;

  const tipos = useMemo(() => {
    const grupos = new Map();
    for (const i of itens) {
      if (papelDoItem(i) !== "TESOURA") continue;
      const vao = vaoDoNome(i.nome);
      if (!vao) continue;
      const g = grupos.get(vao) || { vao, qtd: 0, preco: Number(i.preco_unitario) || 0, nome: i.nome };
      g.qtd += Number(i.quantidade) || 0;
      grupos.set(vao, g);
    }
    return [...grupos.values()].sort((a, b) => a.vao - b.vao);
  }, [itens]);

  const cartoes = useMemo(() => {
    if (!precos || !modulacao) return [];
    return tipos.map((t) => {
      const r = calcularTesoura({ vao: t.vao, modulacao, telha }, { espessura });
      return { ...t, r, custo: custoTesoura(r, precos) };
    });
  }, [tipos, precos, modulacao, telha, espessura]);

  if (tipos.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/50">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <FlaskConical size={16} /> Tesoura pelo cálculo novo — só comparação, em teste
        </span>
        <ChevronDown size={16} className={`text-violet-700 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-violet-800/80">
            Não muda nada no orçamento. Telha considerada: <b>{TELHAS[telha].rotulo}</b> · modulação{" "}
            <b>{num(modulacao)} m</b> · espessura <b>{num(espessura)} m</b>.
          </p>
          {!precos && <p className="text-xs text-slate-500">Carregando preços…</p>}
          {cartoes.map((c) => {
            const preco = c.custo?.completo.preco;
            return (
              <div key={c.vao} className="rounded-lg border border-violet-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  Tesoura de {num(c.vao)} m{" "}
                  <span className="font-normal text-slate-500">
                    — {c.qtd} pç · altura no meio {num(c.r.alturaMeio)} m · {num(c.r.volume, 3)} m³ de concreto ·{" "}
                    {num(c.r.kgAco, 0)} kg de aço
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Barra de baixo <b>{c.r.inferior?.descricao ?? "—"}</b> (usa {num(c.r.aproveitamento, 0)}%) · momento{" "}
                  {num(c.r.Md, 0)} kN·m
                </p>
                {c.r.avisos.map((a) => (
                  <p key={a} className="text-[11px] text-amber-700">⚠ {a}</p>
                ))}
                {c.custo && (
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <table className="w-full text-xs">
                      <tbody>
                        {c.custo.linhasAco.map((l) => (
                          <tr key={l.descricao} className="border-b border-slate-100">
                            <td className="py-0.5 pr-2">{l.descricao}</td>
                            <td className="py-0.5 pr-2 text-right">{num(l.kg, 1)} kg</td>
                            <td className="py-0.5 text-right">{moeda(l.rs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="w-full text-xs">
                      <tbody>
                        {c.custo.completo.linhas.map((l) => (
                          <tr key={l.rotulo} className="border-b border-slate-100">
                            <td className="py-0.5 pr-2">
                              {l.rotulo}
                              {!l.informado && (
                                <span className="ml-1 text-[10px] text-amber-600">(a preencher: {l.dica})</span>
                              )}
                            </td>
                            <td className="py-0.5 text-right">{moeda(l.valor)}</td>
                          </tr>
                        ))}
                        <tr className="font-semibold">
                          <td className="py-1">Custo completo</td>
                          <td className="py-1 text-right">{moeda(c.custo.completo.custo)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-600">
                  Preço no orçamento (continua valendo): <b>{moeda(c.preco)}</b> por peça
                  {preco ? (
                    <>
                      {" "}· pelo cálculo novo com BDI sairia <b>{moeda(preco)}</b> (
                      <span className={preco > c.preco ? "text-rose-700" : "text-emerald-700"}>
                        {preco > c.preco ? "+" : ""}
                        {moeda(preco - c.preco)}
                      </span>
                      )
                    </>
                  ) : (
                    <span className="text-amber-700"> · preço com BDI aparece quando o BDI for preenchido na Engenharia</span>
                  )}
                  .
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
