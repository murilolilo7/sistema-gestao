"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";
import {
  calcularPilarForma4,
  pesoAcoPilar,
  detalharAcoPilar,
  SECOES,
  TERRENOS,
  PARAMETROS_PADRAO,
} from "./calculo";
import { V0_POR_UF, velocidadeBasica } from "./vento";
import MUNICIPIOS from "./municipios.json";
import { BarraAproveitamento } from "../../orcamentos-galpao/ComparacaoPilarForma4";
import GABARITO from "./gabarito.json";

// =====================================================================
// LABORATÓRIO DO PILAR (FORMA 4) — só para testes.
// Não grava nada no banco e não muda o orçamento: lê preços (aço, concreto,
// mão de obra) para mostrar quanto o pilar custaria, e compara o aço
// calculado com os projetos reais de fabricação.
// =====================================================================

const moeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const ler = (v) => Number(String(v ?? "").replace(",", "."));

const cardClasse = "rounded-xl border border-slate-200 bg-white p-5";
const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";

export default function LaboratorioPilarProtegido() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <LaboratorioPilar />;
}

function LaboratorioPilar() {
  const [uf, setUf] = useState("AL");
  const [municipio, setMunicipio] = useState("Maceió");
  const [v0Manual, setV0Manual] = useState("");
  const [terreno, setTerreno] = useState("cidade");
  const [secao, setSecao] = useState("40x25");
  const [altura, setAltura] = useState("8,5");
  const [vao, setVao] = useState("15");
  const [modulacao, setModulacao] = useState("5");
  const [laje, setLaje] = useState("0");

  const [precos, setPrecos] = useState(null);
  const [fundacao, setFundacao] = useState(null);

  // Preços de hoje (só leitura): aço por bitola, m³ de concreto, valor do m³ armado
  useEffect(() => {
    (async () => {
      const [{ data: acos }, { data: concreto }, { data: param }] = await Promise.all([
        supabase.from("insumos").select("nome, valor_unitario").ilike("nome", "AÇO %"),
        supabase.rpc("custo_m3_concreto"),
        supabase.from("parametros_engenharia").select("valor_m3_armado").order("id").limit(1),
      ]);
      const porBitola = {};
      for (const a of acos || []) {
        const d = Number(a.nome.replace(/[^\d.]/g, ""));
        porBitola[d] = Number(a.valor_unitario) || 0;
      }
      setPrecos({
        aco: porBitola,
        concreto: Number(concreto) || 0,
        m3Armado: Number(param?.[0]?.valor_m3_armado) || 3000,
      });
    })();
  }, []);

  const alturaN = ler(altura);
  const comLaje = laje !== "0";

  // Fundação pela regra do sistema (só leitura)
  useEffect(() => {
    if (!alturaN) return;
    supabase
      .rpc("profundidade_fundacao", { pe_direito: alturaN, com_laje: comLaje })
      .then(({ data }) => setFundacao(Number(data) || null));
  }, [alturaN, comLaje]);

  const vento = velocidadeBasica(uf, municipio);
  const V0 = ler(v0Manual) || vento.v0;

  const resultado = useMemo(() => {
    if (!alturaN || !ler(vao) || !ler(modulacao)) return null;
    return calcularPilarForma4({
      altura: alturaN,
      vao: ler(vao),
      modulacao: ler(modulacao),
      V0,
      terreno,
      // Sempre com paredes: o galpão pronto, fechado, é o caso que mais
      // carrega o pilar (regra do Murilo, 2026-10-02).
      fechado: true,
      secao,
      laje: comLaje ? { carga: Number(laje) } : null,
    });
  }, [alturaN, vao, modulacao, V0, terreno, secao, laje, comLaje]);

  const S = SECOES[secao];
  const comprimento = fundacao ? alturaN + fundacao : null;
  const volume = comprimento ? S.b * S.h * comprimento : null;
  const kgAco = resultado && comprimento ? pesoAcoPilar(resultado, comprimento) : null;

  // Custo de material: concreto + aço (cada barra pelo preço da sua bitola)
  const custo = useMemo(() => {
    if (!precos || !resultado?.armacao || !volume) return null;
    const linhas = detalharAcoPilar(resultado, comprimento) || [];
    const rsAco = linhas.reduce((s, l) => s + l.kg * (precos.aco[l.bitola] || 0), 0);
    const rsConcreto = volume * precos.concreto;
    return { rsAco, rsConcreto, material: rsAco + rsConcreto, precoHoje: volume * precos.m3Armado };
  }, [precos, resultado, volume, comprimento]);

  // Projetos reais parecidos (mesma seção e mesma condição de laje)
  const parecidos = useMemo(() => {
    if (!alturaN || !ler(vao)) return [];
    return GABARITO.filter((g) => g.s === secao && g.l === comLaje)
      .map((g) => ({ ...g, dist: Math.abs(g.h - alturaN) + Math.abs(g.v - ler(vao)) / 3 }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);
  }, [secao, comLaje, alturaN, vao]);

  const municipiosUf = MUNICIPIOS[uf] || [];

  return (
    <div>
      <Link
        href="/engenharia"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft size={15} /> Voltar para Engenharia
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
        <FlaskConical size={22} className="text-violet-600" /> Laboratório do pilar
      </h1>
      <p className="text-sm text-slate-500 mb-5">
        Teste do cálculo pelo vento e pela laje (Forma 4). Não grava nada e não muda os orçamentos —
        serve para comparar com os projetos reais antes de decidir.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* ---------------- ENTRADA ---------------- */}
        <div className={cardClasse + " space-y-4"}>
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Estado</label>
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setMunicipio((MUNICIPIOS[e.target.value] || [])[0]?.[0] || "");
                  setV0Manual("");
                }}
                className={campo}
              >
                {Object.keys(MUNICIPIOS).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Município</label>
              <input
                list="lista-municipios"
                value={municipio}
                onChange={(e) => {
                  setMunicipio(e.target.value);
                  setV0Manual("");
                }}
                className={campo}
              />
              <datalist id="lista-municipios">
                {municipiosUf.map(([n]) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Vento básico V0 (m/s)</label>
            <div className="flex items-center gap-2">
              <input
                value={v0Manual}
                placeholder={String(vento.v0)}
                onChange={(e) => setV0Manual(e.target.value)}
                className={campo + " w-24"}
              />
              <span className={`text-xs ${vento.conferido ? "text-emerald-700" : "text-amber-700"}`}>
                {vento.conferido
                  ? `${vento.v0} m/s — conferido para ${uf}`
                  : `${vento.v0} m/s — a conferir no mapa da norma${V0_POR_UF[uf]?.obs ? ` (${V0_POR_UF[uf].obs})` : ""}`}
              </span>
            </div>
          </div>

          <div>
            <p className="block text-xs text-slate-500 mb-1">Ao redor do terreno</p>
            <div className="flex gap-2">
              {Object.entries(TERRENOS).map(([k, t]) => (
                <label
                  key={k}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                    terreno === k ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={terreno === k}
                    onChange={() => setTerreno(k)}
                  />
                  {t.rotulo}
                </label>
              ))}
            </div>
          </div>


          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Seção do pilar</label>
              <select value={secao} onChange={(e) => setSecao(e.target.value)} className={campo}>
                {Object.keys(SECOES).map((s) => (
                  <option key={s} value={s}>
                    {s.replace("x", " x ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Laje apoiada no pilar</label>
              <select value={laje} onChange={(e) => setLaje(e.target.value)} className={campo}>
                <option value="0">Sem laje</option>
                <option value="300">Laje 300 kg/m²</option>
                <option value="500">Laje 500 kg/m²</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Altura do chão ao topo (m)</label>
              <input value={altura} onChange={(e) => setAltura(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Vão / largura (m)</label>
              <input value={vao} onChange={(e) => setVao(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Modulação (m)</label>
              <input value={modulacao} onChange={(e) => setModulacao(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fundação (regra do sistema)</label>
              <p className="px-1 py-2 text-sm text-slate-700">{fundacao ? `${num(fundacao)} m` : "—"}</p>
            </div>
          </div>
        </div>

        {/* ---------------- RESULTADO ---------------- */}
        <div className="space-y-5">
          {resultado && (
            <div className={cardClasse}>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Resultado</p>
              {resultado.armacao ? (
                <p className="text-2xl font-bold text-slate-900">
                  {resultado.armacao.descricao.replaceAll(".", ",")}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    + estribo ø5 c/15 · pilar {secao.replace("x", " x ")}
                  </span>
                </p>
              ) : (
                <p className="text-lg font-semibold text-rose-700">A seção {secao} não atende esse pilar.</p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-4 text-sm">
                <Info rotulo="Pressão do vento" valor={`${num(resultado.q, 2)} kN/m²`} />
                <Info rotulo="Força no pilar (cálculo)" valor={`${num(resultado.Nd, 0)} kN`} />
                <Info rotulo="Momento no pé (cálculo)" valor={`${num(resultado.Md, 0)} kN·m`} />
                <Info
                  rotulo="Aço necessário por face"
                  valor={resultado.asFace !== null ? `${num(resultado.asFace)} cm²` : "—"}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Momento = vento {num(resultado.Mw, 0)} kN·m
                {resultado.Mlaje ? ` + laje no consolo ${num(resultado.Mlaje, 0)} kN·m` : ""} (característicos) ·
                2ª ordem {num(resultado.M2d, 0)} kN·m
              </p>

              {resultado.armacao && <BarraAproveitamento r={resultado} />}

              {resultado.avisos.map((a) => (
                <p key={a} className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a}
                </p>
              ))}

              {custo && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500 mb-2">
                    Pilar de {num(comprimento)} m ({num(alturaN)} m + {num(fundacao)} m de fundação) ·{" "}
                    {num(volume, 3)} m³ · {num(kgAco, 1)} kg de aço ({num(kgAco / volume, 0)} kg/m³)
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Concreto <b>{moeda(custo.rsConcreto)}</b>
                    </span>
                    <span>+ Aço <b>{moeda(custo.rsAco)}</b></span>
                    <span>
                      = Material <b>{moeda(custo.material)}</b>
                    </span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-600">
                      Preço hoje pelo m³ armado: <b>{moeda(custo.precoHoje)}</b>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Sem mão de obra, forma, consolos e BDI — é só para comparar o peso do aço entre os casos.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Projetos reais parecidos</p>
            <p className="text-xs text-slate-500 mb-3">
              Mesma seção, {comLaje ? "com laje" : "sem laje"}, altura e vão mais próximos — do gabarito
              lido das pastas de fabricação.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-1 pr-2">Projeto</th>
                    <th className="py-1 pr-2">Pilar</th>
                    <th className="py-1 pr-2 text-right">Altura</th>
                    <th className="py-1 pr-2 text-right">Vão</th>
                    <th className="py-1 pr-2">Armação do projeto</th>
                    <th className="py-1">Cálculo daria</th>
                  </tr>
                </thead>
                <tbody>
                  {parecidos.map((g) => {
                    const r = calcularPilarForma4({
                      altura: g.h,
                      vao: g.v,
                      modulacao: g.m || 5.5,
                      V0,
                      terreno,
                      fechado: true,
                      secao: g.s,
                      laje: g.l ? { carga: 300 } : null,
                    });
                    const igual = r.armacao?.descricao === g.a;
                    return (
                      <tr key={g.p + g.id + g.h} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2">{g.p}</td>
                        <td className="py-1.5 pr-2 text-slate-500">{g.id}</td>
                        <td className="py-1.5 pr-2 text-right">{num(g.h)} m</td>
                        <td className="py-1.5 pr-2 text-right">{num(g.v, 1)} m</td>
                        <td className="py-1.5 pr-2 font-medium">{g.a.replaceAll(".", ",")}</td>
                        <td className={`py-1.5 ${igual ? "text-emerald-700" : "text-slate-600"}`}>
                          {r.armacao ? r.armacao.descricao.replaceAll(".", ",") : "não atende"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <details className={cardClasse + " text-xs text-slate-500"}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Hipóteses usadas</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                Concreto {PARAMETROS_PADRAO.fck} MPa, aço CA-50, coeficientes 1,4 / 1,4 / 1,15 (NBR 6118).
              </li>
              <li>
                Vento NBR 6123: S1 = S3 = 1; campo aberto = categoria II, cidade = categoria III; paredes
                fechadas com coeficiente 1,2 (0,7 + 0,5), dividido entre os dois pilares do pórtico.
              </li>
              <li>
                Laje: {PARAMETROS_PADRAO.cargaPermanenteLaje} kN/m² de peso próprio + a carga escolhida, apoiada
                em vigas que vencem a largura; consolo a {num(PARAMETROS_PADRAO.excentricidadeConsolo)} m do eixo;{" "}
                {Math.round(PARAMETROS_PADRAO.fatorMomentoLaje * 100)}% desse momento chega ao pé (a tesoura amarra
                os topos).
              </li>
              <li>2ª ordem simplificada (P-Δ) com rigidez reduzida a {Math.round(PARAMETROS_PADRAO.fatorRigidez * 100)}%.</li>
              <li>
                Calibrado com 200 pilares dos projetos: na mediana, o cálculo dá o mesmo aço dos projetos. Pilares
                altos (acima de ~8,5 m) costumam sair com mais aço no cálculo do que nos projetos — ponto para o
                engenheiro.
              </li>
              <li>É pré-dimensionamento para orçamento. Não substitui o projeto do engenheiro.</li>
            </ul>
          </details>
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
