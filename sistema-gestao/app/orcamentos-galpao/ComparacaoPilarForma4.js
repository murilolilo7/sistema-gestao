"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { calcularPilarForma4, pesoAcoPilar, SECOES, TERRENOS } from "../engenharia/pilar-forma4/calculo";
import { V0_POR_UF, velocidadeBasica } from "../engenharia/pilar-forma4/vento";
import MUNICIPIOS from "../engenharia/pilar-forma4/municipios.json";

// =====================================================================
// COMPARAÇÃO — pilar pelo cálculo novo (Forma 4) x pilar de hoje.
// SÓ MOSTRA: não muda quantidade, nome nem preço de nenhum item. O preço do
// orçamento continua saindo do jeito atual (R$/m³ armado).
// Município e terreno ficam só na tela (não são gravados no orçamento
// enquanto o cálculo novo estiver em teste).
// =====================================================================

const KG_POR_M = { 5: 0.154, 10: 0.617, 12.5: 0.963, 16: 1.578, 20: 2.466 };
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 0) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

export default function ComparacaoPilarForma4({ pilares, vao, modulacao, cargaLaje }) {
  const [aberto, setAberto] = useState(true);
  const [uf, setUf] = useState("AL");
  const [municipio, setMunicipio] = useState("");
  const [terreno, setTerreno] = useState("cidade");
  const [precoAco, setPrecoAco] = useState(null);

  // Preço do aço por bitola (só leitura)
  useEffect(() => {
    supabase
      .from("insumos")
      .select("nome, valor_unitario")
      .ilike("nome", "AÇO %")
      .then(({ data }) => {
        const p = {};
        for (const a of data || []) p[Number(a.nome.replace(/[^\d.]/g, ""))] = Number(a.valor_unitario) || 0;
        setPrecoAco(p);
      });
  }, []);

  const vento = velocidadeBasica(uf, municipio);

  const linhas = useMemo(() => {
    if (!precoAco || !vao || !modulacao) return [];
    return pilares
      .filter((p) => p.dados && !p.dados.erro)
      .map((p) => {
        const d = p.dados;
        const secao = `${Math.round(Number(d.secao_altura_m) * 100)}x${Math.round(Number(d.secao_largura_m) * 100)}`;
        const altura = Number(d.pe_direito_livre);
        const comprimento = Number(d.comprimento_total_m);
        const r = calcularPilarForma4({
          altura,
          vao,
          modulacao,
          V0: vento.v0,
          terreno,
          fechado: true,
          secao: SECOES[secao] ? secao : "40x25",
          laje: p.comLaje ? { carga: cargaLaje } : null,
        });
        const kgNovo = pesoAcoPilar(r, comprimento);
        let rsAcoNovo = null;
        if (r.armacao) {
          const kgLong = r.armacao.barras.reduce((s, b) => s + b.n * (KG_POR_M[b.d] || 0) * comprimento, 0);
          const rsLong = r.armacao.barras.reduce(
            (s, b) => s + b.n * (KG_POR_M[b.d] || 0) * comprimento * (precoAco[b.d] || 0),
            0
          );
          rsAcoNovo = rsLong + Math.max(0, kgNovo - kgLong) * (precoAco[5] || 0);
        }
        const armacaoHoje = (d.aco || [])
          .filter((a) => a.tipo === "LONGITUDINAL")
          .map((a) => a.rotulo)
          .join(" + ")
          .replace(/ x /g, "")
          .replace(/Ø/g, "ø");
        const custoHoje = Number(d.custo_detalhado) || 0;
        const custoNovo =
          rsAcoNovo !== null
            ? (Number(d.custo_concreto) || 0) + rsAcoNovo + (Number(d.custo_mao_de_obra) || 0)
            : null;
        return {
          rotulo: p.rotulo,
          qtd: p.qtd,
          secao,
          altura,
          comprimento,
          r,
          armacaoHoje: armacaoHoje || "—",
          kgHoje: Number(d.peso_aco_kg) || 0,
          kgNovo,
          custoHoje,
          custoNovo,
          precoOrcamento: Number(d.custo_total) || 0,
        };
      });
  }, [pilares, precoAco, vao, modulacao, cargaLaje, vento.v0, terreno]);

  if (linhas.length === 0) return null;

  const difTotal = linhas.reduce(
    (s, l) => (l.custoNovo !== null ? s + (l.custoNovo - l.custoHoje) * l.qtd : s),
    0
  );

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/50">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <FlaskConical size={16} /> Pilar pelo cálculo novo (vento + laje) — só comparação, em teste
        </span>
        <ChevronDown size={16} className={`text-violet-700 transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-violet-800/80 mb-2">
            Não muda nada no orçamento: o preço do pilar continua pelo valor do m³. Aqui aparece a
            armação que o cálculo pelo vento pede e quanto o custo de fábrica mudaria.
          </p>

          <div className="mb-3 flex flex-wrap items-end gap-2 text-xs">
            <div>
              <label className="block text-slate-500 mb-0.5">Estado</label>
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setMunicipio("");
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1"
              >
                {Object.keys(MUNICIPIOS).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-0.5">Município da obra</label>
              <input
                list="municipios-comparacao"
                value={municipio}
                placeholder="(opcional)"
                onChange={(e) => setMunicipio(e.target.value)}
                className="w-44 rounded border border-slate-300 bg-white px-2 py-1"
              />
              <datalist id="municipios-comparacao">
                {(MUNICIPIOS[uf] || []).map(([n]) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-1">
              {Object.entries(TERRENOS).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTerreno(k)}
                  className={`rounded border px-2 py-1 ${
                    terreno === k ? "border-violet-400 bg-violet-100 text-violet-900" : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            <span className={vento.conferido ? "text-emerald-700" : "text-amber-700"}>
              Vento {vento.v0} m/s{vento.conferido ? "" : " (a conferir)"}
              {!vento.conferido && V0_POR_UF[uf]?.obs ? ` — ${V0_POR_UF[uf].obs}` : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-violet-200">
                  <th className="py-1 pr-2">Pilar</th>
                  <th className="py-1 pr-2">Armação hoje (tabela)</th>
                  <th className="py-1 pr-2">Cálculo novo</th>
                  <th className="py-1 pr-2 text-right">Aço hoje → novo</th>
                  <th className="py-1 pr-2 text-right">Custo de fábrica hoje → novo</th>
                  <th className="py-1 text-right">Preço no orçamento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.rotulo} className="border-b border-violet-100 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-slate-800">{l.rotulo}</span>
                      <span className="block text-slate-400">
                        {l.qtd} pç · {l.secao.replace("x", " x ")} · {num(l.comprimento, 2)} m
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-600">{l.armacaoHoje}</td>
                    <td className="py-1.5 pr-2">
                      {l.r.armacao ? (
                        <span className="font-semibold text-violet-900">
                          {l.r.armacao.descricao.replaceAll(".", ",")}
                        </span>
                      ) : (
                        <span className="font-semibold text-rose-700">seção não atende</span>
                      )}
                      {l.r.avisos.map((a) => (
                        <span key={a} className="block text-amber-700">
                          {a}
                        </span>
                      ))}
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {num(l.kgHoje, 0)} → <b>{l.kgNovo !== null ? num(l.kgNovo, 0) : "—"}</b> kg
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {moeda(l.custoHoje)} → <b>{l.custoNovo !== null ? moeda(l.custoNovo) : "—"}</b>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap text-slate-600">
                      {moeda(l.precoOrcamento)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Custo de fábrica = concreto + aço + mão de obra (sem forma, consolos e BDI). Diferença no
            orçamento todo pelo cálculo novo:{" "}
            <b className={difTotal > 0 ? "text-rose-700" : "text-emerald-700"}>
              {difTotal > 0 ? "+" : ""}
              {moeda(difTotal)}
            </b>{" "}
            de custo.
          </p>
        </div>
      )}
    </div>
  );
}
