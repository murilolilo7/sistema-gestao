"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  calcularPilarForma4,
  detalharAcoPilar,
  SECOES,
  TERRENOS,
} from "../engenharia/pilar-forma4/calculo";
import { V0_POR_UF, velocidadeBasica } from "../engenharia/pilar-forma4/vento";
import MUNICIPIOS from "../engenharia/pilar-forma4/municipios.json";
import { custoCompletoPilar } from "../engenharia/custos-complementares";

// =====================================================================
// COMPARAÇÃO — pilar pelo cálculo novo (Forma 4) x pilar de hoje (tabela).
// SÓ MOSTRA: não muda quantidade, nome nem preço de nenhum item. O preço do
// orçamento continua saindo do jeito atual (R$/m³ armado).
// Município e terreno ficam só na tela (não são gravados no orçamento
// enquanto o cálculo novo estiver em teste).
// =====================================================================

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 0) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const bitolaDoInsumo = (nome) => Number(String(nome || "").replace(/[^\d.]/g, ""));
const fmtBitola = (d) => `ø${String(d).replace(".", ",")}`;

// Aço de hoje (vem do calcular_pilar, já com kg e R$) no mesmo formato do novo
function acoDeHoje(d) {
  return (d.aco || []).map((a) => {
    const bitola = bitolaDoInsumo(a.insumo);
    let descricao;
    if (a.tipo === "ESTRIBO") descricao = `Estribo ${fmtBitola(bitola)} c/15 (${num(a.quantidade)} un)`;
    else if (a.tipo === "FIXA") descricao = `Alça de içamento ${num(a.quantidade)} ${fmtBitola(bitola)}`;
    else descricao = `${num(a.quantidade)} ${fmtBitola(bitola)}`;
    return { tipo: a.tipo, descricao, kg: Number(a.peso_kg) || 0, rs: Number(a.custo) || 0 };
  });
}

const ORDEM = { LONGITUDINAL: 0, ESTRIBO: 1, FIXA: 2 };

export default function ComparacaoPilarForma4({ pilares, vao, modulacao, cargaLaje }) {
  const [aberto, setAberto] = useState(true);
  const [uf, setUf] = useState("AL");
  const [municipio, setMunicipio] = useState("");
  const [terreno, setTerreno] = useState("cidade");
  const [precoAco, setPrecoAco] = useState(null);
  const [param, setParam] = useState(null); // custos complementares (Engenharia)

  // Preço do aço por bitola (só leitura)
  useEffect(() => {
    supabase
      .from("insumos")
      .select("nome, valor_unitario")
      .ilike("nome", "AÇO %")
      .then(({ data }) => {
        const p = {};
        for (const a of data || []) p[bitolaDoInsumo(a.nome)] = Number(a.valor_unitario) || 0;
        setPrecoAco(p);
      });
    supabase
      .from("parametros_engenharia")
      .select("*")
      .order("id")
      .limit(1)
      .then(({ data }) => setParam(data?.[0] || {}));
  }, []);

  const vento = velocidadeBasica(uf, municipio);

  const cartoes = useMemo(() => {
    if (!precoAco || !param || !vao || !modulacao) return [];
    return pilares
      .filter((p) => p.dados && !p.dados.erro)
      .map((p) => {
        const d = p.dados;
        const secaoReal = `${Math.round(Number(d.secao_altura_m) * 100)}x${Math.round(Number(d.secao_largura_m) * 100)}`;
        const secao = SECOES[secaoReal] ? secaoReal : "40x25";
        const altura = Number(d.pe_direito_livre);
        const comprimento = Number(d.comprimento_total_m);
        const r = calcularPilarForma4({
          altura,
          vao,
          modulacao,
          V0: vento.v0,
          terreno,
          fechado: true,
          secao,
          laje: p.comLaje ? { carga: cargaLaje } : null,
        });

        const hoje = acoDeHoje(d).sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo]);
        const novo = (detalharAcoPilar(r, comprimento) || []).map((l) => ({
          ...l,
          rs: l.kg * (precoAco[l.bitola] || 0),
        }));
        const concreto = Number(d.custo_concreto) || 0;
        const maoDeObra = Number(d.custo_mao_de_obra) || 0;
        const acoHoje = hoje.reduce((s, l) => s + l.rs, 0);
        const acoNovo = novo.reduce((s, l) => s + l.rs, 0);
        const kgHoje = hoje.reduce((s, l) => s + l.kg, 0);
        const kgNovo = novo.reduce((s, l) => s + l.kg, 0);
        const volume = Number(d.volume_m3) || Number(d.secao_altura_m) * Number(d.secao_largura_m) * comprimento;
        // Custo completo (perdas, forma, energia, consolos e BDI da Engenharia)
        const mo = d.mao_de_obra || {};
        const baseCompleto = {
          concreto,
          maoDeObra,
          volume,
          comLaje: p.comLaje,
          custoM3Concreto: Number(d.custo_m3_concreto) || 0,
          precoAcoKg: precoAco[16] || 0,
          custoHoraEquipe: Number(mo.horas_por_pessoa) > 0 ? Number(mo.custo) / Number(mo.horas_por_pessoa) : 0,
        };
        const completoHoje = custoCompletoPilar({ ...baseCompleto, aco: acoHoje }, param);
        const completoNovo = r.armacao ? custoCompletoPilar({ ...baseCompleto, aco: acoNovo }, param) : null;
        return {
          ...p,
          secao,
          altura,
          comprimento,
          fundacao: Number(d.fundacao_m) || comprimento - altura,
          volume,
          r,
          hoje,
          novo,
          concreto,
          maoDeObra,
          acoHoje,
          acoNovo,
          kgHoje,
          kgNovo,
          completoHoje,
          completoNovo,
          custoHoje: completoHoje.custo,
          custoNovo: completoNovo ? completoNovo.custo : null,
          precoOrcamento: Number(d.custo_total) || 0,
        };
      });
  }, [pilares, precoAco, param, vao, modulacao, cargaLaje, vento.v0, terreno]);

  if (cartoes.length === 0) return null;

  const difTotal = cartoes.reduce(
    (s, c) => (c.custoNovo !== null ? s + (c.custoNovo - c.custoHoje) * c.qtd : s),
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
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-violet-800/80">
            Não muda nada no orçamento: o preço do pilar continua pelo valor do m³. Aqui aparece a
            ferragem de hoje (tabela do sistema) ao lado da que o cálculo pelo vento pede, item a item.
          </p>

          {/* -------- Local da obra -------- */}
          <div className="flex flex-wrap items-end gap-2 text-xs">
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
            <div>
              <label className="block text-slate-500 mb-0.5">Ao redor do terreno</label>
              <div className="flex gap-1">
                {Object.entries(TERRENOS).map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTerreno(k)}
                    className={`rounded border px-2 py-1 ${
                      terreno === k
                        ? "border-violet-400 bg-violet-100 text-violet-900 font-medium"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <span className={vento.conferido ? "text-emerald-700" : "text-amber-700"}>
              Vento básico {vento.v0} m/s{vento.conferido ? "" : " (a conferir)"}
              {!vento.conferido && V0_POR_UF[uf]?.obs ? ` — ${V0_POR_UF[uf].obs}` : ""}
            </span>
          </div>

          {/* -------- Um cartão por tipo de pilar -------- */}
          {cartoes.map((c) => (
            <div key={c.rotulo} className="rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-800">
                {c.rotulo}{" "}
                <span className="font-normal text-slate-500">
                  — {c.qtd} pç · {c.secao.replace("x", " x ")} · {num(c.comprimento, 2)} m ({num(c.altura, 2)} m +{" "}
                  {num(c.fundacao, 2)} m de fundação) · {num(c.volume, 3)} m³
                </span>
              </p>

              {/* Por que o cálculo pede essa ferragem — muda com terreno/município
                  mesmo quando a armação escolhida continua a mesma */}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <Chip rotulo="Pressão do vento" valor={`${num(c.r.q, 2)} kN/m²`} />
                <Chip rotulo="Momento no pé" valor={`${num(c.r.Md, 0)} kN·m`} />
                <Chip rotulo="Força no pilar" valor={`${num(c.r.Nd, 0)} kN`} />
                <Chip
                  rotulo="Aço necessário"
                  valor={c.r.asFace !== null ? `${num(c.r.asFace, 2)} cm²/face` : "—"}
                />
              </div>
              {c.r.armacao && <BarraAproveitamento r={c.r} />}
              {c.r.avisos.map((a) => (
                <p key={a} className="mt-1 text-[11px] text-amber-700">
                  ⚠ {a}
                </p>
              ))}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ListaAco titulo="Hoje (tabela do sistema)" linhas={c.hoje} kg={c.kgHoje} rs={c.acoHoje} />
                <ListaAco
                  titulo="Cálculo novo (vento + laje)"
                  linhas={c.novo}
                  kg={c.kgNovo}
                  rs={c.acoNovo}
                  destaque
                  vazio={!c.r.armacao ? "A seção não atende — precisa de seção maior." : null}
                />
              </div>

              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1 pr-2">Custo por pilar</th>
                    <th className="py-1 pr-2 text-right">Hoje</th>
                    <th className="py-1 pr-2 text-right">Cálculo novo</th>
                    <th className="py-1 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {c.completoHoje.linhas.map((l, i) => (
                    <LinhaCusto
                      key={l.rotulo}
                      rotulo={l.rotulo}
                      hoje={l.valor}
                      novo={c.completoNovo ? c.completoNovo.linhas[i].valor : null}
                      faltando={!l.informado ? l.dica : null}
                    />
                  ))}
                  <LinhaCusto rotulo="Custo completo do pilar" hoje={c.custoHoje} novo={c.custoNovo} negrito />
                  {c.completoHoje.preco !== null ? (
                    <LinhaCusto
                      rotulo={`Preço calculado (BDI ${num(c.completoHoje.bdiPct, 1)}%)`}
                      hoje={c.completoHoje.preco}
                      novo={c.completoNovo ? c.completoNovo.preco : null}
                      negrito
                    />
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-1 text-[11px] text-amber-700">
                        Preço calculado aparece quando despesas fixas, faturamento, imposto e lucro forem
                        preenchidos na Engenharia de custos.
                      </td>
                    </tr>
                  )}
                  <LinhaCusto
                    rotulo={`Custo completo × ${c.qtd} pilares`}
                    hoje={c.custoHoje * c.qtd}
                    novo={c.custoNovo !== null ? c.custoNovo * c.qtd : null}
                    negrito
                  />
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Preço do pilar no orçamento (continua valendo, pelo m³): <b>{moeda(c.precoOrcamento)}</b> por peça
                {c.completoNovo?.preco ? (
                  <>
                    {" "}· pelo cálculo novo com BDI sairia <b>{moeda(c.completoNovo.preco)}</b> (
                    <span className={c.completoNovo.preco > c.precoOrcamento ? "text-rose-700" : "text-emerald-700"}>
                      {c.completoNovo.preco > c.precoOrcamento ? "+" : ""}
                      {moeda(c.completoNovo.preco - c.precoOrcamento)}
                    </span>
                    )
                  </>
                ) : null}
                .
              </p>
            </div>
          ))}

          <p className="text-[11px] text-slate-500">
            Custo completo = concreto + aço + mão de obra + os custos complementares já preenchidos na
            Engenharia de custos (perdas, forma, energia, consolos). No orçamento
            todo, o cálculo novo daria{" "}
            <b className={difTotal > 0 ? "text-rose-700" : "text-emerald-700"}>
              {difTotal > 0 ? "+" : ""}
              {moeda(difTotal)}
            </b>{" "}
            de custo nos pilares.
          </p>
        </div>
      )}
    </div>
  );
}

// Quanto da armação escolhida o pilar usa. Passou de 100%, o cálculo sobe
// para o próximo degrau (a armação seguinte da fábrica).
export function BarraAproveitamento({ r }) {
  const p = Math.min(100, Math.max(0, r.aproveitamento || 0));
  const cor = p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const desc = (a) => a.descricao.replaceAll(".", ",");
  return (
    <div className="mt-2 text-[11px] text-slate-600">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">
          Usa <b>{num(r.aproveitamento, 0)}%</b> da {desc(r.armacao)} ({num(r.asFace, 2)} de{" "}
          {num(r.armacao.area / 2, 2)} cm²/face)
        </span>
        <div className="h-2 flex-1 min-w-[80px] rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full ${cor}`} style={{ width: `${p}%` }} />
        </div>
      </div>
      {r.proximaArmacao && (
        <p className="mt-0.5 text-slate-400">
          Acima de 100% passa para {desc(r.proximaArmacao)} ({num(r.proximaArmacao.area / 2, 2)} cm²/face).
        </p>
      )}
    </div>
  );
}

function Chip({ rotulo, valor }) {
  return (
    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5">
      <span className="text-slate-500">{rotulo}: </span>
      <b className="text-slate-800">{valor}</b>
    </span>
  );
}

function ListaAco({ titulo, linhas, kg, rs, destaque, vazio }) {
  return (
    <div className={`rounded border p-2 ${destaque ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-xs font-semibold mb-1 ${destaque ? "text-violet-900" : "text-slate-700"}`}>{titulo}</p>
      {vazio ? (
        <p className="text-xs text-rose-700">{vazio}</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-b border-slate-200/70">
                <td className="py-0.5 pr-2">{l.descricao}</td>
                <td className="py-0.5 pr-2 text-right whitespace-nowrap">{num(l.kg, 1)} kg</td>
                <td className="py-0.5 text-right whitespace-nowrap">{moeda(l.rs)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-1 pr-2">Aço total</td>
              <td className="pt-1 pr-2 text-right whitespace-nowrap">{num(kg, 1)} kg</td>
              <td className="pt-1 text-right whitespace-nowrap">{moeda(rs)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function LinhaCusto({ rotulo, hoje, novo, negrito, faltando }) {
  const dif = novo !== null && novo !== undefined ? novo - hoje : null;
  return (
    <tr className={`border-b border-slate-100 ${negrito ? "font-semibold" : ""}`}>
      <td className="py-1 pr-2">
        {rotulo}
        {faltando && <span className="ml-1 text-[10px] text-amber-600">(a preencher: {faltando})</span>}
      </td>
      <td className="py-1 pr-2 text-right">{moeda(hoje)}</td>
      <td className="py-1 pr-2 text-right">{novo !== null && novo !== undefined ? moeda(novo) : "—"}</td>
      <td
        className={`py-1 text-right ${
          dif === null || Math.abs(dif) < 0.005 ? "text-slate-400" : dif > 0 ? "text-rose-700" : "text-emerald-700"
        }`}
      >
        {dif === null ? "—" : Math.abs(dif) < 0.005 ? "igual" : `${dif > 0 ? "+" : ""}${moeda(dif)}`}
      </td>
    </tr>
  );
}
