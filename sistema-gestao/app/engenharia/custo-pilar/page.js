"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, History, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito, notificar, confirmar, LinhasEsqueleto } from "@/components/Ui";
import { BLOCOS, TODOS_CAMPOS, validar, paraTexto, lerNumero } from "./campos";

// =====================================================================
// CUSTO REAL DO PILAR — todos os números que formam o custo do pilar, com
// explicação, para o Murilo atualizar quando precisar. O pilar de exemplo
// no alto mostra a conta inteira; ao digitar um valor, a tela mostra o
// efeito antes de salvar. Cada alteração fica no histórico.
// A conta é a do banco (custo_pilar_real) — a mesma que o orçamento vai
// usar quando o modo for trocado para "REAL".
// =====================================================================

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const inputCls = "w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

const NIVEIS = [
  { v: "", r: "Automático (pela altura e largura)" },
  { v: "ESBELTO", r: "Esbelto" },
  { v: "PESADO", r: "Pesado" },
  { v: "COM_LAJE", r: "Com laje" },
];

export default function CustoPilarProtegido() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <CustoPilar />;
}

function CustoPilar() {
  const [param, setParam] = useState(null);
  const [funcoes, setFuncoes] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [acos, setAcos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);

  // Pilar de exemplo
  const [pe, setPe] = useState("5");
  const [vao, setVao] = useState("12");
  const [comLaje, setComLaje] = useState(false);
  const [nivel, setNivel] = useState("");
  const [conta, setConta] = useState(null);

  const exemplo = useCallback(
    (ajustes) =>
      supabase.rpc("custo_pilar_real", {
        pe_direito_input: lerNumero(pe) || 0,
        vao_input: lerNumero(vao) || 0,
        com_laje_input: comLaje,
        ...(nivel ? { nivel_input: nivel } : {}),
        ...(ajustes ? { ajustes } : {}),
      }),
    [pe, vao, comLaje, nivel]
  );

  function buscarTudo() {
    return Promise.all([
      supabase.from("parametros_engenharia").select("*").order("id").limit(1),
      supabase.from("mao_de_obra").select("id, funcao, salario_bruto, encargos_pct, base_horas_mes, valor_hora").order("funcao"),
      supabase.from("armacao_comissao").select("*").order("ordem"),
      supabase.from("insumos").select("id, nome, valor_unitario, kg_por_metro, bitola_mm").ilike("nome", "AÇO %").order("bitola_mm"),
      supabase
        .from("historico_alteracoes_precos")
        .select("*")
        .in("tabela", ["parametros_engenharia", "armacao_comissao"])
        .order("criado_em", { ascending: false })
        .limit(25),
    ]);
  }
  function aplicar([rp, rf, rc, ra, rh]) {
    setParam(rp.data?.[0] || null);
    setFuncoes(rf.data || []);
    setComissoes(rc.data || []);
    setAcos(ra.data || []);
    setHistorico(rh.data || []);
    setCarregando(false);
  }
  async function carregar() {
    aplicar(await buscarTudo());
  }
  useEffect(() => {
    let ativo = true;
    buscarTudo().then((r) => ativo && aplicar(r));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    if (!(lerNumero(pe) > 0)) return;
    exemplo().then(({ data }) => ativo && setConta(data));
    return () => {
      ativo = false;
    };
  }, [exemplo, pe, param, comissoes]);

  async function salvarParametro(campo, valor) {
    const { error } = await supabase.from("parametros_engenharia").update({ [campo]: valor }).eq("id", param.id);
    if (error) {
      notificar("Não foi possível salvar: " + error.message, "erro");
      return false;
    }
    notificar("Salvo.");
    await carregar();
    return true;
  }

  async function salvarComissao(id, valor) {
    const { error } = await supabase.from("armacao_comissao").update({ comissao: valor }).eq("id", id);
    if (error) {
      notificar("Não foi possível salvar: " + error.message, "erro");
      return false;
    }
    notificar("Comissão salva.");
    await carregar();
    return true;
  }

  if (carregando) {
    return (
      <div className={card}>
        <LinhasEsqueleto linhas={8} />
      </div>
    );
  }
  if (!param) return <p className="text-sm text-rose-700">Parâmetros da Engenharia não encontrados.</p>;

  const modoReal = param.modo_calculo_pilar === "REAL";
  const funcaoDe = (id) => funcoes.find((f) => Number(f.id) === Number(id));

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/engenharia" className="text-slate-500 hover:text-slate-800">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Custo real do pilar</h1>
          <p className="text-sm text-slate-500">
            Todos os números que formam o custo do pilar. Altere quando precisar: a tela mostra o efeito antes de salvar.
          </p>
        </div>
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          modoReal ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {modoReal ? (
          <>O orçamento está usando este cálculo real.</>
        ) : (
          <>
            <b>O orçamento ainda usa o preço pelo m³</b> ({moeda(param.valor_m3_armado)} por m³). Este cálculo real está
            pronto para conferir, mas só passa a valer quando for ligado — mexer aqui hoje não muda nenhum orçamento.
          </>
        )}
      </div>

      {/* ---------- PILAR DE EXEMPLO: A CONTA INTEIRA ---------- */}
      <div className={card}>
        <p className="text-sm font-semibold text-slate-800 mb-1">Pilar de exemplo — a conta inteira</p>
        <p className="text-xs text-slate-500 mb-3">
          Escolha um pilar para ver de onde sai cada real. É a mesma conta que o orçamento vai usar.
        </p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Campo rotulo="Pé-direito livre (m)">
            <input value={pe} onChange={(e) => setPe(e.target.value)} className={inputCls} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Largura do galpão (m)">
            <input value={vao} onChange={(e) => setVao(e.target.value)} className={inputCls} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Nível de ferragem">
            <select value={nivel} onChange={(e) => setNivel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
              {NIVEIS.map((n) => (
                <option key={n.v} value={n.v}>
                  {n.r}
                </option>
              ))}
            </select>
          </Campo>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-1.5">
            <input type="checkbox" checked={comLaje} onChange={(e) => setComLaje(e.target.checked)} /> Com laje (fundação maior)
          </label>
        </div>
        {conta?.erro ? (
          <p className="text-sm text-rose-700">{conta.erro}</p>
        ) : conta ? (
          <Conta conta={conta} />
        ) : (
          <LinhasEsqueleto linhas={5} />
        )}
      </div>

      {/* ---------- BLOCOS DE PARÂMETROS ---------- */}
      {BLOCOS.map((b) => (
        <div key={b.id} className={card}>
          <p className="text-sm font-semibold text-slate-800">{b.titulo}</p>
          <p className="text-xs text-slate-600 mt-1 mb-4 leading-relaxed">{b.resumo}</p>

          {b.id === "aco" && <TabelaAco acos={acos} />}
          {b.id === "concreto" && conta?.concreto && (
            <Informativo>
              Custo do m³ pelo traço de hoje: <b>{moeda(conta.concreto.custo_m3)}</b>. Para mudar, altere o traço em{" "}
              <b>Engenharia → Traço do concreto</b> ou o preço dos materiais em{" "}
              <Link href="/precos" className="underline">
                Preços → Insumos
              </Link>
              .
            </Informativo>
          )}
          {b.id === "estribo" && conta?.aco?.itens?.find((i) => i.tipo === "ESTRIBO") && (
            <Informativo>
              No pilar de exemplo ({num(conta.secao_largura_m)} × {num(conta.secao_altura_m)} m), cada estribo fica com{" "}
              <b>{num(conta.aco.itens.find((i) => i.tipo === "ESTRIBO").comprimento_unitario, 3)} m</b>.
            </Informativo>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {b.campos.map((def) => (
              <CampoParametro
                key={`${def.campo}:${param[def.campo]}`}
                def={def}
                valorSalvo={param[def.campo]}
                precoSalvo={conta?.preco}
                exemplo={exemplo}
                salvar={(v) => salvarParametro(def.campo, v)}
              />
            ))}
            {b.funcao && (
              <CampoFuncao
                key={`${b.funcao.campo}:${param[b.funcao.campo]}`}
                rotulo={b.funcao.rotulo}
                funcoes={funcoes}
                valorSalvo={param[b.funcao.campo]}
                salvar={(v) => salvarParametro(b.funcao.campo, v)}
              />
            )}
          </div>

          {b.funcao && funcaoDe(param[b.funcao.campo]) && (
            <Informativo>
              {(() => {
                const f = funcaoDe(param[b.funcao.campo]);
                const mes = Number(f.valor_hora) * Number(f.base_horas_mes);
                return (
                  <>
                    {f.funcao}: salário {moeda(f.salario_bruto)} + {num(f.encargos_pct, 0)}% de encargos ={" "}
                    <b>{moeda(mes)} por mês</b> ÷ {paraTexto(param.dias_producao_mes)} dias ={" "}
                    <b>{moeda(mes / (Number(param.dias_producao_mes) || 1))} por dia</b>. Salários em{" "}
                    <Link href="/precos" className="underline">
                      Preços → Mão de obra
                    </Link>
                    .
                  </>
                );
              })()}
            </Informativo>
          )}

          {b.tabelaComissao && <TabelaComissao comissoes={comissoes} salvar={salvarComissao} param={param} />}
        </div>
      ))}

      {/* ---------- OPERACIONAL JÁ CADASTRADO ---------- */}
      <div className={card}>
        <p className="text-sm font-semibold text-slate-800">8. Operacional (fôrma, energia)</p>
        <p className="text-xs text-slate-600 mt-1 mb-3 leading-relaxed">
          Custos que hoje estão dentro do BDI. Quando forem preenchidos em <b>Engenharia → aba Testes → Custos complementares</b>,
          entram aqui como linha do custo — e o BDI pode ser reduzido na mesma medida.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5">
            Fôrma e desmoldante por pilar: <b>{conta?.operacional?.forma ? moeda(conta.operacional.forma) : "ainda não informado"}</b>
          </span>
          <span className="rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5">
            Energia no pilar de exemplo: <b>{conta?.operacional?.energia ? moeda(conta.operacional.energia) : "ainda não informado"}</b>
          </span>
        </div>
      </div>

      <Historico registros={historico} funcoes={funcoes} />
    </div>
  );
}

function Campo({ rotulo, children }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1">{rotulo}</label>
      {children}
    </div>
  );
}

function Informativo({ children }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-900">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ---------- A conta do pilar de exemplo ----------
function Conta({ conta }) {
  const linhas = [
    {
      rotulo: "Concreto",
      conta: `${num(conta.volume_m3, 3)} m³ × ${moeda(conta.concreto.custo_m3)}`,
      valor: conta.concreto.custo,
    },
    {
      rotulo: "Perda de concreto",
      conta: `${num(conta.concreto.perda_pct, 1)}% do concreto`,
      valor: conta.concreto.perda,
    },
    {
      rotulo: "Aço",
      conta: `${num(conta.aco.peso_kg, 1)} kg (detalhe por bitola abaixo)`,
      valor: conta.aco.custo,
    },
    { rotulo: "Perda de aço", conta: `${num(conta.aco.perda_pct, 1)}% do aço`, valor: conta.aco.perda },
    {
      rotulo: "Armação (soldador)",
      conta: `${num(conta.armacao.tempo_dias, 3)} dia × ${moeda(conta.armacao.custo_dia)} + comissão ${moeda(conta.armacao.comissao_peca)}`,
      valor: conta.armacao.custo,
    },
    {
      rotulo: "Fôrma, concretagem e desforma",
      conta: `${num(conta.volume_m3, 3)} m³ × ${moeda(conta.concretagem.custo_m3)} por m³`,
      valor: conta.concretagem.custo,
    },
  ];
  if (conta.operacional?.forma) linhas.push({ rotulo: "Fôrma e desmoldante", conta: "Custos complementares", valor: conta.operacional.forma });
  if (conta.operacional?.energia) linhas.push({ rotulo: "Energia", conta: "Custos complementares", valor: conta.operacional.energia });

  const diff = conta.preco_m3_hoje > 0 ? conta.preco / conta.preco_m3_hoje - 1 : null;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Pilar {num(conta.secao_largura_m)} × {num(conta.secao_altura_m)} m, {num(conta.comprimento_total_m)} m de comprimento (
        {num(conta.pe_direito_livre)} m livre + {num(conta.fundacao_m)} m de fundação)
        {conta.nivel ? `, nível ${conta.nivel}` : ""}. Consolo à parte (é peça separada no orçamento).
      </p>
      {conta.avisos?.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} /> {conta.avisos.join(" ")}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 text-slate-700">{l.rotulo}</td>
                <td className="py-1.5 pr-3 text-xs text-slate-500">{l.conta}</td>
                <td className="py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">{moeda(l.valor)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-200">
              <td className="py-2 font-semibold text-slate-800">Custo de fabricação</td>
              <td />
              <td className="py-2 text-right font-semibold text-slate-900">{moeda(conta.custo_total)}</td>
            </tr>
            <tr>
              <td className="py-2 font-semibold text-emerald-800">Preço do pilar</td>
              <td className="py-2 text-xs text-slate-500">custo × (1 + BDI de {num(conta.bdi_pct, 1)}%)</td>
              <td className="py-2 text-right text-lg font-bold text-emerald-700">{moeda(conta.preco)}</td>
            </tr>
            <tr>
              <td className="py-1 text-xs text-slate-500">Hoje, pelo m³</td>
              <td className="py-1 text-xs text-slate-500">
                {diff !== null && `cálculo real fica ${diff >= 0 ? "+" : ""}${num(diff * 100, 0)}% em relação a hoje`}
              </td>
              <td className="py-1 text-right text-xs text-slate-500">{moeda(conta.preco_m3_hoje)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <p className="text-xs font-medium text-slate-600 mb-1">Aço bitola por bitola</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1 pr-2">Barra</th>
              <th className="py-1 pr-2 text-right">Qtd</th>
              <th className="py-1 pr-2 text-right">Cada (m)</th>
              <th className="py-1 pr-2">Sobra da barra</th>
              <th className="py-1 pr-2 text-right">Cobrado cada (m)</th>
              <th className="py-1 pr-2 text-right">Metros</th>
              <th className="py-1 pr-2 text-right">kg</th>
              <th className="py-1 pr-2 text-right">R$/kg</th>
              <th className="py-1 text-right">R$</th>
            </tr>
          </thead>
          <tbody>
            {conta.aco.itens.map((i, k) => (
              <tr key={k} className="border-b border-slate-100">
                <td className="py-1 pr-2 text-slate-700">
                  {i.tipo === "ESTRIBO" ? "Estribo" : i.tipo === "FIXA" ? "Puxador" : "Barra"} Ø{num(i.bitola_mm, 1).replace(",0", "")}
                </td>
                <td className="py-1 pr-2 text-right">{num(i.quantidade, 0)}</td>
                <td className="py-1 pr-2 text-right">{num(i.comprimento_unitario, 3)}</td>
                <td className="py-1 pr-2 text-slate-500">
                  {i.sobra_m === null || i.sobra_m === undefined
                    ? i.tipo === "ESTRIBO"
                      ? "rolo (sem sobra)"
                      : "—"
                    : `${num(i.sobra_m)} m ${Number(i.comprimento_cobrado) > Number(i.comprimento_unitario) + 0.001 && !i.emendas ? "(sucata, cobrada)" : "(volta ao estoque)"}`}
                  {i.emendas > 0 ? ` · ${i.emendas} emenda(s) por solda` : ""}
                </td>
                <td className="py-1 pr-2 text-right">{num(i.comprimento_cobrado, 3)}</td>
                <td className="py-1 pr-2 text-right">{num(i.metros)}</td>
                <td className="py-1 pr-2 text-right">{num(i.peso_kg)}</td>
                <td className="py-1 pr-2 text-right">{num(i.preco_kg)}</td>
                <td className="py-1 text-right font-medium">{moeda(i.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Um campo editável com explicação, prévia e trava ----------
function CampoParametro({ def, valorSalvo, precoSalvo, exemplo, salvar }) {
  // O componente é recriado (key) quando o valor salvo muda, então o texto
  // sempre começa do valor salvo.
  const [texto, setTexto] = useState(paraTexto(valorSalvo));
  // Prévia guardada junto com o texto que a gerou: só aparece se ainda for o mesmo texto
  const [previa, setPrevia] = useState({ texto: null, preco: null });
  const [salvando, setSalvando] = useState(false);
  const temp = useRef(null);

  const mudou = texto.trim() !== paraTexto(valorSalvo);
  const v = validar(def, texto);

  useEffect(() => {
    clearTimeout(temp.current);
    if (!mudou || !v.ok) return;
    const deste = texto;
    temp.current = setTimeout(async () => {
      const { data } = await exemplo({ [def.campo]: v.valor });
      setPrevia({ texto: deste, preco: data?.preco ?? null });
    }, 400);
    return () => clearTimeout(temp.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, mudou]);
  const precoPrevia = previa.texto === texto ? previa.preco : null;

  async function aoSalvar() {
    if (!v.ok) return;
    if (v.aviso) {
      const ok = await confirmar({ titulo: "Valor fora do normal", texto: v.aviso, confirmarTexto: "Salvar mesmo assim" });
      if (!ok) return;
    }
    setSalvando(true);
    await salvar(v.valor);
    setSalvando(false);
  }

  return (
    <div className={`rounded-lg border p-3 ${mudou ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
      <label className="block text-sm font-medium text-slate-800">{def.rotulo}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mudou && aoSalvar()}
          inputMode="decimal"
          className={inputCls}
        />
        <span className="text-xs text-slate-500">{def.unidade}</span>
        {mudou && (
          <>
            <button
              onClick={aoSalvar}
              disabled={!v.ok || salvando}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button onClick={() => setTexto(paraTexto(valorSalvo))} className="text-xs text-slate-500 underline">
              desfazer
            </button>
          </>
        )}
      </div>
      {mudou && !v.ok && <p className="mt-1 text-xs text-rose-700">{v.erro}</p>}
      {mudou && v.ok && v.aviso && <p className="mt-1 text-xs text-amber-700">⚠ {v.aviso.replace(" Confirma?", "")}</p>}
      {mudou && v.ok && precoPrevia !== null && precoSalvo !== undefined && (
        <p className="mt-1 text-xs text-slate-700">
          Pilar de exemplo: {moeda(precoSalvo)} → <b>{moeda(precoPrevia)}</b>
          {precoSalvo > 0 && ` (${precoPrevia >= precoSalvo ? "+" : ""}${num((precoPrevia / precoSalvo - 1) * 100, 1)}%)`}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        <b>Exemplo:</b> {def.exemplo} {def.unidade} · <b>De onde veio:</b> {def.fonte}
      </p>
    </div>
  );
}

function CampoFuncao({ rotulo, funcoes, valorSalvo, salvar }) {
  const [sel, setSel] = useState(String(valorSalvo ?? ""));
  const mudou = sel !== String(valorSalvo ?? "");
  return (
    <div className={`rounded-lg border p-3 ${mudou ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
      <label className="block text-sm font-medium text-slate-800">{rotulo}</label>
      <div className="mt-1 flex items-center gap-2">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
          {funcoes.map((f) => (
            <option key={f.id} value={String(f.id)}>
              {f.funcao}
            </option>
          ))}
        </select>
        {mudou && (
          <button
            onClick={() => salvar(Number(sel))}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            <Save size={13} /> Salvar
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">O salário com encargos desta função é o custo do dia de trabalho.</p>
    </div>
  );
}

function TabelaAco({ acos }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <p className="text-xs text-slate-600 mb-1">
        Preço e peso de cada bitola (só leitura aqui). Para atualizar o preço do aço, use{" "}
        <Link href="/precos" className="underline font-medium">
          Preços → Insumos
        </Link>{" "}
        — o pilar acompanha na hora.
      </p>
      <table className="text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pr-4 py-1">Bitola</th>
            <th className="pr-4 py-1 text-right">Peso (kg/m)</th>
            <th className="py-1 text-right">Preço (R$/kg)</th>
          </tr>
        </thead>
        <tbody>
          {acos.map((a) => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="pr-4 py-1">{a.nome}</td>
              <td className="pr-4 py-1 text-right">{num(a.kg_por_metro, 3)}</td>
              <td className="py-1 text-right">{num(a.valor_unitario)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaComissao({ comissoes, salvar, param }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="text-xs font-medium text-slate-700 mb-1">Comissão de armação por peça</p>
      <p className="text-[11px] text-slate-500 mb-2">
        A comissão paga ao armador por peça. Ela também mede o tempo: peça com comissão maior leva mais tempo.
        Tempo = comissão ÷ {paraTexto(param.armacao_comissao_dia)} (média que um armador faz por dia).
      </p>
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pr-4 py-1">Peça</th>
            <th className="pr-4 py-1">Comissão (R$)</th>
            <th className="py-1">Tempo (dia de armador)</th>
          </tr>
        </thead>
        <tbody>
          {comissoes.map((c) => (
            <LinhaComissao key={`${c.id}:${c.comissao}`} c={c} salvar={salvar} porDia={Number(param.armacao_comissao_dia) || 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaComissao({ c, salvar, porDia }) {
  const [texto, setTexto] = useState(paraTexto(c.comissao));
  const mudou = texto.trim() !== paraTexto(c.comissao);
  const valor = lerNumero(texto);
  async function aoSalvar() {
    if (valor === null || valor < 0) return;
    if (valor > 30) {
      const ok = await confirmar({
        titulo: "Valor fora do normal",
        texto: `Comissão de ${paraTexto(valor)} reais para ${c.nome} está fora do normal (0 a 30). Confirma?`,
        confirmarTexto: "Salvar mesmo assim",
      });
      if (!ok) return;
    }
    await salvar(c.id, valor);
  }
  return (
    <tr className={`border-t border-slate-100 ${mudou ? "bg-amber-50/50" : ""}`}>
      <td className="pr-4 py-1 text-slate-700">{c.nome}</td>
      <td className="pr-4 py-1">
        <div className="flex items-center gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
          {mudou && (
            <button onClick={aoSalvar} disabled={valor === null || valor < 0} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50">
              Salvar
            </button>
          )}
        </div>
      </td>
      <td className="py-1 text-xs text-slate-500">{porDia > 0 && valor !== null ? `${num(valor / porDia, 2)} dia` : "—"}</td>
    </tr>
  );
}

// ---------- Histórico de alterações ----------
const ROTULOS_HIST = Object.fromEntries(TODOS_CAMPOS.map((c) => [c.campo, `${c.rotulo} (${c.unidade})`]));
Object.assign(ROTULOS_HIST, {
  comissao: "Comissão (R$)",
  armacao_funcao_id: "Função da armação",
  concretagem_funcao_id: "Função da concretagem",
  modo_calculo_pilar: "Modo de cálculo do pilar",
  valor_m3_armado: "Valor do m³ armado (R$)",
});

function Historico({ registros, funcoes }) {
  const nomeFuncao = (id) => funcoes.find((f) => Number(f.id) === Number(id))?.funcao ?? id;
  const linhas = registros.flatMap((r) => {
    const a = r.dados_antigos || {};
    const n = r.dados_novos || {};
    return Object.keys(n)
      .filter((k) => !["id", "created_at"].includes(k) && String(a[k] ?? "") !== String(n[k] ?? ""))
      .map((k) => {
        const fmt = (v) => (k.endsWith("_funcao_id") ? nomeFuncao(v) : paraTexto(v) || "—");
        return {
          id: `${r.id}-${k}`,
          quando: new Date(r.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
          quem: r.nome_usuario || "Sistema",
          item: r.tabela === "armacao_comissao" ? `Comissão — ${r.nome_item}` : ROTULOS_HIST[k] || k,
          de: fmt(a[k]),
          para: fmt(n[k]),
        };
      });
  });
  return (
    <div className={card}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
        <History size={16} /> Histórico de alterações
      </p>
      {linhas.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1 pr-3">Quando</th>
                <th className="py-1 pr-3">Quem</th>
                <th className="py-1 pr-3">O que</th>
                <th className="py-1 pr-3">Antes</th>
                <th className="py-1">Depois</th>
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, 40).map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1 pr-3 whitespace-nowrap">{l.quando}</td>
                  <td className="py-1 pr-3">{l.quem}</td>
                  <td className="py-1 pr-3">{l.item}</td>
                  <td className="py-1 pr-3 text-slate-500">{l.de}</td>
                  <td className="py-1 font-medium">{l.para}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
