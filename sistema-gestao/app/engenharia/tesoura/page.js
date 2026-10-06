"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, AlertTriangle } from "lucide-react";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";
import { calcularTesoura, TELHAS, alturaNoMeio } from "./calculo";
import { usePrecosTesoura, custoTesoura } from "./precos";
import GABARITO from "./gabarito.json";

// =====================================================================
// LABORATÓRIO DA TESOURA — só para testes. Não grava nada e não muda os
// orçamentos: mostra concreto, aço e custo pelo cálculo novo e compara com
// as tesouras reais dos projetos de fabricação.
// =====================================================================

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const ler = (v) => Number(String(v ?? "").replace(",", "."));
const card = "rounded-xl border border-slate-200 bg-white p-5";
const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";

export default function LaboratorioTesouraProtegido() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <LaboratorioTesoura />;
}

function LaboratorioTesoura() {
  const [vao, setVao] = useState("15");
  const [modulacao, setModulacao] = useState("5");
  const [telha, setTelha] = useState("fibro5");
  const [alturaManual, setAlturaManual] = useState("");
  const precos = usePrecosTesoura();
  const espessura = Number(precos?.param?.tesoura_espessura) > 0 ? Number(precos.param.tesoura_espessura) : 0.2;

  const r = useMemo(() => {
    if (!ler(vao) || !ler(modulacao)) return null;
    return calcularTesoura(
      { vao: ler(vao), modulacao: ler(modulacao), telha, alturaMeio: ler(alturaManual) || undefined },
      { espessura }
    );
  }, [vao, modulacao, telha, alturaManual, espessura]);
  const custo = useMemo(() => custoTesoura(r, precos), [r, precos]);

  const parecidas = useMemo(() => {
    if (!ler(vao)) return [];
    return [...GABARITO].sort((a, b) => Math.abs(a.v - ler(vao)) - Math.abs(b.v - ler(vao))).slice(0, 6);
  }, [vao]);

  return (
    <div>
      <Link href="/engenharia" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
        <ArrowLeft size={15} /> Voltar para Engenharia
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
        <FlaskConical size={22} className="text-violet-600" /> Laboratório da tesoura
      </h1>
      <p className="text-sm text-slate-500 mb-5">
        Teste do cálculo novo da tesoura (formato real + carga). Não grava nada e não muda os orçamentos.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className={card + " space-y-3"}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Vão (m)</label>
              <input value={vao} onChange={(e) => setVao(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Modulação (m)</label>
              <input value={modulacao} onChange={(e) => setModulacao(e.target.value)} className={campo} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Telha</label>
            <select value={telha} onChange={(e) => setTelha(e.target.value)} className={campo}>
              {Object.entries(TELHAS).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Altura no meio (m) — vazio = padrão da fábrica</label>
            <input
              value={alturaManual}
              placeholder={ler(vao) ? num(alturaNoMeio(ler(vao)).altura) : ""}
              onChange={(e) => setAlturaManual(e.target.value)}
              className={campo}
            />
          </div>
          <p className="text-xs text-slate-500">
            Espessura: <b>{num(espessura)} m</b> (muda em Engenharia → Custos complementares).
          </p>
        </div>

        <div className="space-y-5">
          {r && (
            <div className={card}>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Resultado</p>
              <div className="grid gap-2 sm:grid-cols-4 text-sm">
                <Info rotulo="Altura no meio" valor={`${num(r.alturaMeio)} m`} />
                <Info rotulo="Concreto" valor={`${num(r.volume, 3)} m³`} />
                <Info rotulo="Momento no meio (cálculo)" valor={`${num(r.Md, 0)} kN·m`} />
                <Info rotulo="Aço necessário embaixo" valor={`${num(r.asNecessaria)} cm²`} />
              </div>
              {r.inferior && (
                <p className="mt-2 text-xs text-slate-600">
                  Barra de baixo: <b>{r.inferior.descricao}</b> ({num(r.inferior.area)} cm²) — usa{" "}
                  <b>{num(r.aproveitamento, 0)}%</b>
                </p>
              )}
              {r.avisos.map((a) => (
                <p key={a} className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a}
                </p>
              ))}

              <table className="mt-4 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1 pr-2">Aço</th>
                    <th className="py-1 pr-2 text-right">Metros</th>
                    <th className="py-1 pr-2 text-right">kg</th>
                    <th className="py-1 text-right">R$</th>
                  </tr>
                </thead>
                <tbody>
                  {(custo?.linhasAco || r.linhas).map((l) => (
                    <tr key={l.descricao} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{l.descricao}</td>
                      <td className="py-1 pr-2 text-right">{num(l.metros, 1)}</td>
                      <td className="py-1 pr-2 text-right">{num(l.kg, 1)}</td>
                      <td className="py-1 text-right">{l.rs !== undefined ? moeda(l.rs) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="pt-1">Aço total</td>
                    <td />
                    <td className="pt-1 text-right">{num(r.kgAco, 1)}</td>
                    <td className="pt-1 text-right">{custo ? moeda(custo.aco) : "—"}</td>
                  </tr>
                </tbody>
              </table>

              {custo && (
                <table className="mt-4 w-full text-xs">
                  <tbody>
                    {custo.completo.linhas.map((l) => (
                      <tr key={l.rotulo} className="border-b border-slate-100">
                        <td className="py-1 pr-2">
                          {l.rotulo}
                          {!l.informado && <span className="ml-1 text-[10px] text-amber-600">(a preencher: {l.dica})</span>}
                          {l.rotulo === "Mão de obra" && custo.maoDeObra.origem && (
                            <span className="ml-1 text-[10px] text-slate-400">— da receita {custo.maoDeObra.origem}</span>
                          )}
                        </td>
                        <td className="py-1 text-right">{moeda(l.valor)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-b">
                      <td className="py-1">Custo completo da tesoura</td>
                      <td className="py-1 text-right">{moeda(custo.completo.custo)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1">Preço calculado {custo.completo.preco ? `(BDI ${num(custo.completo.bdiPct, 1)}%)` : ""}</td>
                      <td className="py-1 text-right">
                        {custo.completo.preco ? moeda(custo.completo.preco) : <span className="text-amber-700 font-normal">preencha o BDI na Engenharia</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className={card}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Tesouras reais parecidas</p>
            <p className="text-xs text-slate-500 mb-3">Do gabarito lido das pastas de fabricação.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="py-1 pr-2">Projeto</th>
                  <th className="py-1 pr-2 text-right">Vão</th>
                  <th className="py-1 pr-2 text-right">Altura</th>
                  <th className="py-1 pr-2">Barra de baixo</th>
                  <th className="py-1 pr-2 text-right">Aço real</th>
                  <th className="py-1 text-right">Cálculo daria</th>
                </tr>
              </thead>
              <tbody>
                {parecidas.map((g) => {
                  const c = calcularTesoura({ vao: g.v, modulacao: g.m || 5.5, telha, alturaMeio: (g.h + 5) / 100 }, { espessura });
                  return (
                    <tr key={g.p + g.v} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{g.p}</td>
                      <td className="py-1.5 pr-2 text-right">{num(g.v)} m</td>
                      <td className="py-1.5 pr-2 text-right">{num((g.h + 5) / 100)} m</td>
                      <td className="py-1.5 pr-2">
                        {g.inf} <span className="text-slate-400">→ {c.inferior?.descricao}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{num(g.kg, 0)} kg</td>
                      <td className="py-1.5 text-right">{num(c.kgAco, 0)} kg</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ rotulo, valor }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] text-slate-500">{rotulo}</p>
      <p className="font-semibold text-slate-800">{valor}</p>
    </div>
  );
}
