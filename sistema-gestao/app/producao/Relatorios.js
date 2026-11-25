"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { notificar } from "@/components/Ui";
import { lerNumero, paraTexto } from "@/app/engenharia/custo-pilar/campos";
import { SITUACOES, rotuloSetor, resumoMes, custoMaoObraMes, custoMensalFuncao } from "./regras";
import { hojeISO } from "./Lancamento";

const brl = (v) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: c });
const NOME_MES = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
const MES_CURTO = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};
const ultimoDia = (ym) => {
  const [a, m] = ym.split("-").map(Number);
  return new Date(a, m, 0).getDate();
};
function somarMeses(ym, n) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SELECT_DIA = "*, producao_presencas(*), producao_concretagem_pecas(*), producao_armacao(*)";

function buscarPeriodo(mesIni, mesFim) {
  return Promise.all([
    supabase
      .from("producao_dias")
      .select(SELECT_DIA)
      .gte("data", `${mesIni}-01`)
      .lte("data", `${mesFim}-${ultimoDia(mesFim)}`)
      .order("data"),
    supabase.from("producao_premio_mensal").select("*").gte("mes", `${mesIni}-01`).lte("mes", `${mesFim}-01`),
  ]);
}

export default function Relatorios({ pessoas, pecas, funcoes, setores, souAdmin, abrirDia }) {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden">
        <button onClick={() => setMes(somarMeses(mes, -1))} className={BOTAO_SEC}>
          ◀
        </button>
        <input
          type="month"
          value={mes}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <button onClick={() => setMes(somarMeses(mes, 1))} className={BOTAO_SEC}>
          ▶
        </button>
        <span className="text-sm font-medium text-slate-700 capitalize ml-1">{NOME_MES(mes)}</span>
        <button onClick={() => window.print()} className={`${BOTAO_SEC} ml-auto`}>
          🖨 Imprimir / PDF
        </button>
      </div>

      <RelatorioMes key={mes} mes={mes} pessoas={pessoas} pecas={pecas} setores={setores} abrirDia={abrirDia} />
      {souAdmin && <CustoMaoObra key={`custo:${mes}`} mesFinal={mes} pessoas={pessoas} pecas={pecas} funcoes={funcoes} />}
    </div>
  );
}

// ------------------------------------------------------------------ mês

function RelatorioMes({ mes, pessoas, pecas, setores, abrirDia }) {
  const [dias, setDias] = useState(null);
  const [premios, setPremios] = useState([]);

  function aplicar([d, p]) {
    if (d.error || p.error) notificar("Não foi possível carregar o mês: " + (d.error || p.error).message, "erro");
    setDias(d.data || []);
    setPremios(p.data || []);
  }
  useEffect(() => {
    let ativo = true;
    buscarPeriodo(mes, mes).then((r) => ativo && aplicar(r));
    return () => {
      ativo = false;
    };
  }, [mes]);

  if (dias === null) return <p className="text-sm text-slate-500">Carregando o mês...</p>;

  const resumo = resumoMes(dias, premios);
  // Meta de m³: só os dias que têm meta (os importados da planilha não têm)
  const diasComMeta = dias.filter((d) => Number(d.meta_m3) > 0);
  const metaMes = diasComMeta.reduce((s, d) => s + Number(d.meta_m3), 0);
  const m3NaMeta = diasComMeta.reduce((s, d) => s + (Number(d.m3_concretado) || 0), 0);
  const pctMetaMes = metaMes > 0 ? Math.round((m3NaMeta / metaMes) * 100) : null;
  const t = resumo.totais;
  const nomeDe = (id) => pessoas.find((p) => p.id === id)?.nome || `#${id}`;
  const setorDe = (id) => pessoas.find((p) => p.id === id)?.setor || "OUTRO";
  const pecaDe = (id) => pecas.find((p) => p.id === id)?.nome || `#${id}`;
  const linhas = [...resumo.linhas].sort(
    (a, b) => setorDe(a.colaborador_id).localeCompare(setorDe(b.colaborador_id)) || nomeDe(a.colaborador_id).localeCompare(nomeDe(b.colaborador_id))
  );

  async function salvarPremioMensal(colaboradorId, valor) {
    const { error } = await supabase.rpc("salvar_premio_mensal", {
      mes_input: `${mes}-01`,
      colaborador_input: colaboradorId,
      valor_input: valor,
    });
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar("Prêmio mensal salvo.");
    buscarPeriodo(mes, mes).then(aplicar);
  }

  if (dias.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nenhum dia lançado em <span className="capitalize">{NOME_MES(mes)}</span>.
      </div>
    );

  return (
    <div className="space-y-5">
      <h2 className="hidden print:block text-xl font-bold capitalize">Produção — {NOME_MES(mes)}</h2>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Cartao rotulo="Dias com produção" valor={t.diasComProducao} />
        <Cartao
          rotulo="m³ concretados"
          valor={num(t.m3, 1)}
          detalhe={
            (t.diasComProducao ? `${num(t.m3 / t.diasComProducao, 2)} m³ por dia` : "") +
            (pctMetaMes !== null
              ? ` · ${pctMetaMes}% da meta (${num(m3NaMeta, 1)} de ${num(metaMes, 1)} m³ em ${diasComMeta.length} ${diasComMeta.length === 1 ? "dia" : "dias"})`
              : "")
          }
        />
        <Cartao rotulo="Peças concretadas" valor={num(t.pecasConcretadas, 0)} />
        <Cartao rotulo="Peças armadas" valor={num(t.pecasArmadas, 0)} />
        <Cartao rotulo="Prêmios do mês" valor={brl(t.total)} destaque />
      </div>

      {/* ---------------- prêmios por pessoa ---------------- */}
      <Bloco
        titulo="Prêmios por pessoa (para a folha)"
        texto="Concretagem = prêmio do dia dividido pela equipe. Armação = peças que a pessoa armou × valor da peça. O prêmio mensal (resultado da meta) é digitado aqui."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-2 font-medium">Nome</th>
                <th className="py-2 px-2 font-medium">Setor</th>
                <th className="py-2 px-2 font-medium text-center" title="Dias trabalhados (P, M ou S)">
                  Dias
                </th>
                <th className="py-2 px-2 font-medium text-center">Meio dia</th>
                <th className="py-2 px-2 font-medium text-center">Faltas</th>
                <th className="py-2 px-2 font-medium text-right">Concretagem</th>
                <th className="py-2 px-2 font-medium text-right">Armação</th>
                <th className="py-2 px-2 font-medium text-right">Prêmio mensal</th>
                <th className="py-2 pl-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.colaborador_id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 font-medium text-slate-800">{nomeDe(l.colaborador_id)}</td>
                  <td className="py-1.5 px-2 text-slate-500">{rotuloSetor(setorDe(l.colaborador_id), setores)}</td>
                  <td className="py-1.5 px-2 text-center">{l.dias}</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">{l.meios || ""}</td>
                  <td className={`py-1.5 px-2 text-center ${l.faltas ? "text-rose-600 font-medium" : "text-slate-400"}`}>
                    {l.faltas || "0"}
                  </td>
                  <td className="py-1.5 px-2 text-right">{l.premioConcretagem ? brl(l.premioConcretagem) : ""}</td>
                  <td className="py-1.5 px-2 text-right">
                    {l.premioArmacao ? (
                      <>
                        {brl(l.premioArmacao)} <span className="text-[10px] text-slate-400">({num(l.pecasArmadas, 0)} pç)</span>
                      </>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <PremioMensal key={`${l.colaborador_id}:${l.premioMensal}`} linha={l} salvar={salvarPremioMensal} />
                  </td>
                  <td className="py-1.5 pl-2 text-right font-semibold">{brl(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t-2 border-slate-300">
                <td className="py-2 pr-2" colSpan={5}>
                  Total do mês
                </td>
                <td className="py-2 px-2 text-right">{brl(t.premioConcretagem)}</td>
                <td className="py-2 px-2 text-right">{brl(t.premioArmacao)}</td>
                <td className="py-2 px-2 text-right">{brl(t.premioMensal)}</td>
                <td className="py-2 pl-2 text-right">{brl(t.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Bloco>

      {/* ---------------- grade do mês ---------------- */}
      <Bloco
        titulo="Mês em grade (igual à planilha)"
        texto="Cada letra é o que foi lançado no dia. Letra com bolinha = trabalhou em outro setor naquele dia. Clique no número do dia para abrir o lançamento."
      >
        <GradeMes mes={mes} dias={dias} linhas={linhas} nomeDe={nomeDe} setorDe={setorDe} setores={setores} abrirDia={abrirDia} />
      </Bloco>

      {/* ---------------- peças ---------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Bloco titulo="Peças concretadas no mês">
          <ListaPecas mapa={resumo.porPecaConcretada} pecaDe={pecaDe} vazio="Nenhuma peça concretada lançada." />
        </Bloco>
        <Bloco titulo="Peças armadas no mês">
          <ListaPecas mapa={resumo.porPecaArmada} pecaDe={pecaDe} vazio="Nenhuma peça armada lançada." />
        </Bloco>
      </div>
    </div>
  );
}

function PremioMensal({ linha, salvar }) {
  const inicial = linha.premioMensal ? paraTexto(linha.premioMensal) : "";
  const [texto, setTexto] = useState(inicial);
  const mudou = texto.trim() !== inicial;
  const valor = texto.trim() ? lerNumero(texto) : 0;
  return (
    <span className="inline-flex items-center gap-1 print:hidden">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        inputMode="decimal"
        placeholder="0,00"
        className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm text-right"
      />
      {mudou && (
        <button
          onClick={() => salvar(linha.colaborador_id, valor)}
          disabled={valor === null || valor < 0}
          className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
        >
          Salvar
        </button>
      )}
    </span>
  );
}

function GradeMes({ mes, dias, linhas, nomeDe, setorDe, setores, abrirDia }) {
  const n = ultimoDia(mes);
  const porData = Object.fromEntries(dias.map((d) => [Number(d.data.slice(8, 10)), d]));
  const cor = Object.fromEntries(SITUACOES.map((s) => [s.id, s.cor]));
  const semana = (d) => new Date(`${mes}-${String(d).padStart(2, "0")}T12:00:00`).getDay();
  const nums = Array.from({ length: n }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white pr-2 text-left font-medium text-slate-500">Dia</th>
            {nums.map((d) => (
              <th
                key={d}
                className={`w-7 min-w-7 text-center font-medium ${semana(d) === 0 || semana(d) === 6 ? "bg-slate-100 text-slate-400" : "text-slate-600"}`}
              >
                <button onClick={() => abrirDia(`${mes}-${String(d).padStart(2, "0")}`)} className="hover:text-emerald-700 hover:underline print:no-underline">
                  {d}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="sticky left-0 bg-white pr-2 py-1 font-medium text-emerald-700 whitespace-nowrap">m³ do dia</td>
            {nums.map((d) => (
              <td key={d} className="text-center text-[10px] text-emerald-700 py-1">
                {porData[d]?.m3_concretado ? num(porData[d].m3_concretado, 1) : ""}
              </td>
            ))}
          </tr>
          {linhas.map((l) => (
            <tr key={l.colaborador_id} className="border-b border-slate-100">
              <td className="sticky left-0 bg-white pr-2 py-0.5 text-slate-700 whitespace-nowrap">{nomeDe(l.colaborador_id)}</td>
              {nums.map((d) => {
                const p = porData[d]?.producao_presencas?.find((x) => x.colaborador_id === l.colaborador_id);
                return (
                  <td key={d} className="text-center py-0.5">
                    {p && (
                      <span
                        className={`relative inline-flex w-5 h-5 items-center justify-center rounded text-[10px] font-bold ${cor[p.situacao]}`}
                        title={`${p.situacao} · ${rotuloSetor(p.setor, setores)}`}
                      >
                        {p.situacao}
                        {p.setor !== setorDe(l.colaborador_id) && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaPecas({ mapa, pecaDe, vazio }) {
  const itens = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  if (!itens.length) return <p className="text-sm text-slate-400">{vazio}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {itens.map(([id, q]) => (
          <tr key={id} className="border-b border-slate-100">
            <td className="py-1 text-slate-700">{pecaDe(id)}</td>
            <td className="py-1 text-right font-medium">{num(q, 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ custo (admin)

function montarMeses([d, p], mesIni) {
  if (d.error || p.error) notificar("Não foi possível carregar o custo: " + (d.error || p.error).message, "erro");
  const lista = [];
  for (let i = 0; i < 12; i++) {
    const ym = somarMeses(mesIni, i);
    const dias = (d.data || []).filter((x) => x.data.startsWith(ym));
    const pm = (p.data || []).filter((x) => x.mes.startsWith(ym));
    if (dias.length) lista.push({ ym, resumo: resumoMes(dias, pm) });
  }
  return lista;
}

function CustoMaoObra({ mesFinal, pessoas, pecas, funcoes }) {
  const [meses, setMeses] = useState(null);
  const mesIni = somarMeses(mesFinal, -11);

  useEffect(() => {
    let ativo = true;
    buscarPeriodo(mesIni, mesFinal).then((r) => ativo && setMeses(montarMeses(r, mesIni)));
    return () => {
      ativo = false;
    };
  }, [mesIni, mesFinal]);

  if (meses === null) return <p className="text-sm text-slate-500">Calculando o custo dos últimos 12 meses...</p>;

  const custoPessoa = (id) => {
    const p = pessoas.find((x) => x.id === id);
    const f = funcoes.find((x) => x.id === p?.funcao_id);
    return f ? custoMensalFuncao(f) : null;
  };
  const linhas = meses.map((m) => ({ ...m, custo: custoMaoObraMes(m.resumo, custoPessoa) }));
  const soma = (f) => linhas.reduce((s, l) => s + f(l), 0);
  const m3 = soma((l) => l.resumo.totais.m3);
  const custoConc = soma((l) => l.custo.concretagem.total);
  const custoArm = soma((l) => l.custo.armacao.total);
  const premioArm = soma((l) => l.resumo.totais.premioArmacao);
  const porM3 = m3 > 0 ? custoConc / m3 : null;
  const porReal = premioArm > 0 ? custoArm / premioArm : null;
  const maior = Math.max(1, ...linhas.map((l) => l.custo.concretagem.porM3 || 0));
  const semFuncao = Math.max(0, ...linhas.map((l) => l.custo.semFuncao));
  const pilar = pecas.find((p) => p.tipo === "PILAR_SEM_CONSOLO");

  return (
    <Bloco
      titulo="Custo real da mão de obra (últimos 12 meses) — só administrador"
      texto="O salário da função de cada pessoa (com encargos) é repartido entre os setores pelos dias em que ela foi marcada em cada um, e somado aos prêmios. Concretagem: custo ÷ m³ do mês. Armação: quanto custa cada R$ 1 de prêmio pago (salários + prêmios ÷ prêmios). Feriados e paradas entram sozinhos: o mês com menos produção fica mais caro."
    >
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-400">Sem lançamentos no período.</p>
      ) : (
        <>
          {semFuncao > 0 && (
            <p className="mb-2 text-xs text-amber-700">
              ⚠ {semFuncao} pessoa(s) sem função cadastrada ficaram fora da conta. Ajuste na aba Pessoas.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 font-medium">Mês</th>
                  <th className="py-2 px-2 font-medium text-center">Dias</th>
                  <th className="py-2 px-2 font-medium text-right">m³</th>
                  <th className="py-2 px-2 font-medium text-center">Equipe</th>
                  <th className="py-2 px-2 font-medium text-right">Salários + encargos</th>
                  <th className="py-2 px-2 font-medium text-right">Prêmios</th>
                  <th className="py-2 px-2 font-medium text-right">Concretagem R$/m³</th>
                  <th className="py-2 px-2 font-medium min-w-28" />
                  <th className="py-2 pl-2 font-medium text-right" title="Custo de cada R$ 1 de prêmio de armação">
                    Armação R$ por R$ 1
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.ym} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 capitalize">{MES_CURTO(l.ym)}</td>
                    <td className="py-1.5 px-2 text-center">{l.resumo.totais.diasComProducao}</td>
                    <td className="py-1.5 px-2 text-right">{num(l.resumo.totais.m3, 1)}</td>
                    <td className="py-1.5 px-2 text-center">{l.custo.concretagem.pessoas}</td>
                    <td className="py-1.5 px-2 text-right">{brl(l.custo.concretagem.salarios)}</td>
                    <td className="py-1.5 px-2 text-right">{brl(l.custo.concretagem.premios)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{brl(l.custo.concretagem.porM3)}</td>
                    <td className="py-1.5 px-2">
                      <div className="h-2.5 rounded bg-emerald-500" style={{ width: `${((l.custo.concretagem.porM3 || 0) / maior) * 100}%` }} />
                    </td>
                    <td className="py-1.5 pl-2 text-right">{l.custo.armacao.porReal === null ? "—" : num(l.custo.armacao.porReal, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t-2 border-slate-300">
                  <td className="py-2 pr-2" colSpan={2}>
                    {linhas.length} {linhas.length === 1 ? "mês" : "meses"}
                  </td>
                  <td className="py-2 px-2 text-right">{num(m3, 1)}</td>
                  <td />
                  <td className="py-2 px-2 text-right">{brl(soma((l) => l.custo.concretagem.salarios))}</td>
                  <td className="py-2 px-2 text-right">{brl(soma((l) => l.custo.concretagem.premios))}</td>
                  <td className="py-2 px-2 text-right text-emerald-700">{brl(porM3)}</td>
                  <td />
                  <td className="py-2 pl-2 text-right">{porReal === null ? "—" : num(porReal, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
              <b>Concretagem:</b> cada m³ custou em média <b>{brl(porM3)}</b> de mão de obra no período.
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
              <b>Armação:</b> cada R$ 1 de prêmio custou <b>{porReal === null ? "—" : brl(porReal)}</b>.
              {pilar && porReal !== null && (
                <>
                  {" "}
                  Ex.: pilar sem consolo ({brl(pilar.comissao)} de prêmio) ={" "}
                  <b>{brl(Number(pilar.comissao) * porReal)}</b> de mão de obra.
                </>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Salários = valores de hoje em Preços → Mão de obra. Estes números ainda não mudam nenhum preço; ligar no
            Custo real do pilar é um passo separado, com a sua aprovação.
          </p>
        </>
      )}
    </Bloco>
  );
}

// ------------------------------------------------------------------ pequenos

const BOTAO_SEC = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";

function Cartao({ rotulo, valor, detalhe, destaque }) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${destaque ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={`text-xl font-bold ${destaque ? "text-emerald-800" : "text-slate-800"}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-slate-500">{detalhe}</p>}
    </div>
  );
}

function Bloco({ titulo, texto, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm break-inside-avoid">
      <h3 className="font-semibold text-slate-800">{titulo}</h3>
      {texto && <p className="text-xs text-slate-500 mt-0.5 mb-3">{texto}</p>}
      {!texto && <div className="mb-2" />}
      {children}
    </section>
  );
}
