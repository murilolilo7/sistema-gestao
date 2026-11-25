"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar } from "@/components/Ui";
import { lerNumero, paraTexto } from "@/app/engenharia/custo-pilar/campos";
import { SETORES, SITUACOES, rotuloSetor, dividirPremio, avisosDoDia, percentualMeta, resumoMes } from "./regras";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, c = 2) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: c });

export function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function somarDias(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dataPorExtenso(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function buscarDia(data) {
  return supabase
    .from("producao_dias")
    .select("*, producao_presencas(*), producao_concretagem_pecas(*), producao_armacao(*)")
    .eq("data", data)
    .maybeSingle();
}

export default function Lancamento({ pessoas, pecas, setores = SETORES, parametros, data, irParaData }) {
  const [sujo, setSujo] = useState(false);

  async function trocar(nova) {
    if (!nova || nova === data) return;
    if (sujo) {
      const ok = await confirmar({
        titulo: "Sair sem salvar?",
        texto: "Este dia tem alterações que ainda não foram salvas. Se trocar de dia, elas se perdem.",
        confirmarTexto: "Trocar sem salvar",
        perigoso: true,
      });
      if (!ok) return;
    }
    setSujo(false);
    irParaData(nova);
  }

  const hoje = hojeISO();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <button onClick={() => trocar(somarDias(data, -1))} className={BOTAO_SEC} title="Dia anterior">
          ◀
        </button>
        <input
          type="date"
          value={data}
          max={hoje}
          onChange={(e) => trocar(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <button
          onClick={() => trocar(somarDias(data, 1))}
          disabled={data >= hoje}
          className={BOTAO_SEC}
          title="Próximo dia"
        >
          ▶
        </button>
        {data !== hoje && (
          <button onClick={() => trocar(hoje)} className={BOTAO_SEC}>
            Hoje
          </button>
        )}
        <span className="text-sm font-medium text-slate-700 capitalize ml-1">{dataPorExtenso(data)}</span>
        {sujo && <span className="ml-auto text-xs font-medium text-amber-700">● alterações não salvas</span>}
      </div>

      <DiaLancamento
        key={data}
        data={data}
        pessoas={pessoas}
        pecas={pecas}
        setores={setores}
        parametros={parametros}
        aoSujar={setSujo}
      />
    </div>
  );
}

// Mês do dia (sem o próprio dia) para o acumulado de cada pessoa
function buscarMes(data) {
  const ini = `${data.slice(0, 7)}-01`;
  return supabase
    .from("producao_dias")
    .select("*, producao_presencas(*), producao_concretagem_pecas(*), producao_armacao(*)")
    .gte("data", ini)
    .lte("data", data)
    .neq("data", data);
}

function estadoInicial(dia, parametros) {
  const pres = {};
  const conc = {};
  const arm = {};
  for (const p of dia?.producao_presencas || []) pres[p.colaborador_id] = { situacao: p.situacao, setor: p.setor };
  for (const c of dia?.producao_concretagem_pecas || []) conc[c.peca_id] = paraTexto(c.quantidade);
  for (const a of dia?.producao_armacao || []) arm[`${a.colaborador_id}:${a.peca_id}`] = paraTexto(a.quantidade);
  // Meta de m³: dia novo já vem com a meta padrão (10); dia antigo (importado) sem meta fica vazio.
  const meta = dia ? paraTexto(dia.meta_m3) : paraTexto(parametros?.meta_m3_padrao ?? META_PADRAO);
  // Prêmio da concretagem, igual à planilha: valor FIXO do dia dividido pela equipe
  // (padrão R$ 140). Dia salvo sem valor fixo = soma das peças × valor.
  const informado = dia?.premio_concretagem_informado;
  const modoConc = !dia || (informado !== null && informado !== undefined) ? "FIXO" : "PECAS";
  const premioFixo = paraTexto(
    informado !== null && informado !== undefined ? informado : parametros?.premio_concretagem_dia ?? PREMIO_PADRAO
  );
  return { m3: paraTexto(dia?.m3_concretado), meta, modoConc, premioFixo, obs: dia?.observacao || "", pres, conc, arm };
}

const META_PADRAO = 10;
const PREMIO_PADRAO = 140;

function DiaLancamento({ data, pessoas, pecas, setores, parametros, aoSujar }) {
  const [dia, setDia] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [r, setR] = useState(estadoInicial(null, parametros));
  const [mesAntes, setMesAntes] = useState([]);
  const [visao, setVisao] = useState("ambos"); // dia | mes | ambos
  const [salvando, setSalvando] = useState(false);
  const [verOutros, setVerOutros] = useState(false);

  function aplicar({ data: d, error }) {
    if (error) notificar("Não foi possível carregar o dia: " + error.message, "erro");
    setDia(d || null);
    setR(estadoInicial(d, parametros));
    setCarregando(false);
  }

  useEffect(() => {
    let ativo = true;
    buscarDia(data).then((res) => ativo && aplicar(res));
    buscarMes(data).then(({ data: d }) => ativo && setMesAntes(d || []));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function mudar(fn) {
    setR((atual) => fn(atual));
    aoSujar(true);
  }

  // valores salvos no dia (mudança de prêmio depois não muda o passado)
  const valorConcSalvo = Object.fromEntries((dia?.producao_concretagem_pecas || []).map((c) => [c.peca_id, Number(c.valor_unit)]));
  const valorArmSalvo = Object.fromEntries(
    (dia?.producao_armacao || []).map((a) => [`${a.colaborador_id}:${a.peca_id}`, Number(a.valor_unit)])
  );
  const valorConc = (p) => valorConcSalvo[p.id] ?? (p.valor_concretagem === null ? null : Number(p.valor_concretagem));
  const valorArm = (pessoaId, p) => valorArmSalvo[`${pessoaId}:${p.id}`] ?? Number(p.comissao || 0);

  const pessoasDoDia = pessoas.filter((p) => p.ativo || r.pres[p.id]);
  const pecasDoDia = pecas.filter(
    (p) => p.ativo || r.conc[p.id] || Object.keys(r.arm).some((k) => k.endsWith(`:${p.id}`) && r.arm[k])
  );

  // listas para conta e para salvar
  const presencas = Object.entries(r.pres).map(([id, v]) => ({ colaborador_id: Number(id), ...v }));
  const concretagem = Object.entries(r.conc)
    .map(([id, q]) => ({ peca_id: Number(id), quantidade: lerNumero(q) }))
    .filter((x) => x.quantidade > 0);
  const armacao = Object.entries(r.arm)
    .map(([k, q]) => {
      const [c, p] = k.split(":").map(Number);
      return { colaborador_id: c, peca_id: p, quantidade: lerNumero(q) };
    })
    .filter((x) => {
      const v = r.pres[x.colaborador_id];
      return x.quantidade > 0 && v?.setor === "ARMACAO" && (v.situacao === "P" || v.situacao === "M");
    });

  const fixo = r.modoConc === "FIXO";
  const somaPecas = concretagem.reduce((s, x) => {
    const p = pecas.find((pp) => pp.id === x.peca_id);
    return s + x.quantidade * (p ? valorConc(p) || 0 : 0);
  }, 0);
  const premioConc = fixo ? lerNumero(r.premioFixo) || 0 : somaPecas;
  const equipe = presencas.filter((p) => p.setor === "CONCRETAGEM");
  const partes = dividirPremio(premioConc, equipe.map((p) => p.situacao));
  const parteDe = Object.fromEntries(equipe.map((p, i) => [p.colaborador_id, partes[i]]));

  const armadores = pessoasDoDia.filter(
    (p) => r.pres[p.id]?.setor === "ARMACAO" && (r.pres[p.id]?.situacao === "P" || r.pres[p.id]?.situacao === "M")
  );
  const avisos = avisosDoDia({ m3: lerNumero(r.m3), presencas, concretagem, armacao, pecas, premioFixo: fixo });
  if (fixo && !(premioConc > 0) && equipe.some((e) => e.situacao === "P" || e.situacao === "M"))
    avisos.push("O prêmio fixo da concretagem do dia está zerado.");

  // Prêmio de cada um: hoje (o que está na tela) e acumulado no mês (dias já salvos + hoje)
  const premioArmDe = (id) =>
    armacao
      .filter((x) => x.colaborador_id === id)
      .reduce((s, x) => {
        const p = pecas.find((pp) => pp.id === x.peca_id);
        return s + x.quantidade * (p ? valorArm(id, p) : 0);
      }, 0);
  const mesLinhas = new Map(resumoMes(mesAntes).linhas.map((l) => [l.colaborador_id, l]));
  const idsPremio = new Set([
    ...equipe.map((e) => e.colaborador_id),
    ...armacao.map((a) => a.colaborador_id),
    ...mesLinhas.keys(),
  ]);
  const premiosPessoa = [...idsPremio]
    .map((id) => {
      const hojeConc = parteDe[id] || 0;
      const hojeArm = premioArmDe(id);
      const m = mesLinhas.get(id);
      return {
        id,
        nome: pessoas.find((p) => p.id === id)?.nome || `#${id}`,
        hojeConc,
        hojeArm,
        hoje: hojeConc + hojeArm,
        mesConc: (m?.premioConcretagem || 0) + hojeConc,
        mesArm: (m?.premioArmacao || 0) + hojeArm,
      };
    })
    .map((x) => ({ ...x, mes: x.mesConc + x.mesArm }))
    .filter((x) => x.hoje > 0 || x.mes > 0)
    .sort((a, b) => b.mes - a.mes || a.nome.localeCompare(b.nome));

  function marcar(p, situacao) {
    mudar((a) => {
      const pres = { ...a.pres };
      if (pres[p.id]?.situacao === situacao) delete pres[p.id];
      else pres[p.id] = { situacao, setor: pres[p.id]?.setor || p.setor };
      return { ...a, pres };
    });
  }
  function setorDoDia(p, setor) {
    mudar((a) => ({ ...a, pres: { ...a.pres, [p.id]: { ...a.pres[p.id], setor } } }));
  }
  function marcarTodos(lista, situacao) {
    mudar((a) => {
      const pres = { ...a.pres };
      for (const p of lista) {
        if (situacao) pres[p.id] = { situacao, setor: pres[p.id]?.setor || p.setor };
        else delete pres[p.id];
      }
      return { ...a, pres };
    });
  }

  async function salvar() {
    const m3 = lerNumero(r.m3);
    if (r.m3.trim() && (m3 === null || m3 < 0)) return notificar("O m³ do dia não é um número válido.", "erro");
    const meta = lerNumero(r.meta);
    if (r.meta.trim() && (meta === null || meta < 0)) return notificar("A meta de m³ não é um número válido.", "erro");
    const valorFixo = lerNumero(r.premioFixo);
    if (fixo && (valorFixo === null || valorFixo < 0))
      return notificar("O prêmio fixo da concretagem não é um número válido.", "erro");
    const qtdRuim =
      Object.values(r.conc).some((q) => q.trim() && !(lerNumero(q) >= 0)) ||
      Object.values(r.arm).some((q) => q.trim() && !(lerNumero(q) >= 0));
    if (qtdRuim) return notificar("Tem quantidade de peça que não é número. Confira os campos.", "erro");
    if (avisos.length) {
      const ok = await confirmar({
        titulo: "Conferir antes de salvar",
        texto: avisos.map((a) => "• " + a).join("\n") + "\n\nSalvar assim mesmo?",
        confirmarTexto: "Salvar assim mesmo",
      });
      if (!ok) return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_dia_producao", {
      payload: {
        data,
        m3: m3 === null ? "" : m3,
        meta: meta === null ? "" : meta,
        premio_fixo: fixo ? valorFixo : "",
        observacao: r.obs,
        presencas,
        concretagem,
        armacao,
      },
    });
    setSalvando(false);
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar("Dia salvo.");
    aoSujar(false);
    buscarDia(data).then(aplicar);
    buscarMes(data).then(({ data: d }) => setMesAntes(d || []));
  }

  async function apagar() {
    const ok = await confirmar({
      titulo: "Apagar o lançamento deste dia?",
      texto: "Some tudo deste dia: presenças, m³ e peças. Não dá para desfazer.",
      confirmarTexto: "Apagar o dia",
      perigoso: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("producao_dias").delete().eq("id", dia.id);
    if (error) return notificar("Não foi possível apagar: " + error.message, "erro");
    notificar("Lançamento apagado.");
    aoSujar(false);
    buscarDia(data).then(aplicar);
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando o dia...</p>;

  const marcados = presencas.filter((p) => p.situacao === "P" || p.situacao === "M").length;
  // setores do cadastro + algum que só exista na pessoa (segurança)
  const todosSetores = [
    ...setores,
    ...[...new Set(pessoasDoDia.map((p) => p.setor))]
      .filter((id) => !setores.some((s) => s.id === id))
      .map((id) => ({ id, rotulo: rotuloSetor(id, setores) })),
  ];
  const grupos = todosSetores.map((s) => ({ ...s, lista: pessoasDoDia.filter((p) => p.setor === s.id) })).filter(
    (g) => g.lista.length
  );
  const pctMeta = percentualMeta(lerNumero(r.m3), lerNumero(r.meta));

  return (
    <div className="space-y-4 pb-20">
      <p className="text-xs text-slate-500">
        {dia
          ? dia.origem === "PLANILHA" && !dia.atualizado_por_nome
            ? "Dia do histórico, lançado antes do sistema."
            : `Último salvamento: ${dia.atualizado_por_nome || "—"} em ${new Date(dia.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
          : "Este dia ainda não foi lançado."}
      </p>

      {/* ---------------- 1. Quem trabalhou ---------------- */}
      <Secao
        numero="1"
        titulo="Quem trabalhou hoje"
        resumo={`${marcados} ${marcados === 1 ? "pessoa trabalhando" : "pessoas trabalhando"}`}
      >
        <p className="text-xs text-slate-500 mb-3">
          Toque na letra: <b>P</b> dia inteiro · <b>M</b> meio dia · <b>S</b> trabalhou sem prêmio · <b>F</b> falta. Tocar
          de novo desmarca. Se a pessoa trabalhou em outro setor hoje, troque o setor ao lado do nome.
        </p>
        <div className="space-y-4">
          {grupos.map((g) => {
            const escondido = g.id === "OUTRO" && !verOutros && !g.lista.some((p) => r.pres[p.id]);
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-medium text-slate-700">{g.rotulo}</p>
                  {escondido ? (
                    <button onClick={() => setVerOutros(true)} className="text-xs text-slate-500 underline">
                      mostrar {g.lista.length}
                    </button>
                  ) : (
                    <>
                      <button onClick={() => marcarTodos(g.lista, "P")} className="text-xs text-emerald-700 underline">
                        todos P
                      </button>
                      <button onClick={() => marcarTodos(g.lista, null)} className="text-xs text-slate-500 underline">
                        limpar
                      </button>
                    </>
                  )}
                </div>
                {!escondido && (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.lista.map((p) => {
                      const v = r.pres[p.id];
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${v ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50"}`}
                        >
                          <span className={`flex-1 text-sm truncate ${v ? "text-slate-900" : "text-slate-500"}`}>
                            {p.nome}
                            {!p.ativo && <span className="text-[10px] text-slate-400"> (desativado)</span>}
                          </span>
                          {v && (
                            <select
                              value={v.setor}
                              onChange={(e) => setorDoDia(p, e.target.value)}
                              className="rounded border border-slate-300 px-1 py-0.5 text-xs text-slate-600"
                              title="Setor em que trabalhou hoje"
                            >
                              {todosSetores
                                .filter((s) => s.ativo !== false || s.id === v.setor)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.rotulo}
                                  </option>
                                ))}
                            </select>
                          )}
                          <div className="flex gap-1">
                            {SITUACOES.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => marcar(p, s.id)}
                                title={s.rotulo}
                                className={`w-8 h-8 rounded-md border text-sm font-bold transition ${
                                  v?.situacao === s.id ? s.cor : "border-slate-300 bg-white text-slate-400 hover:text-slate-700"
                                }`}
                              >
                                {s.curto}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Secao>

      {/* ---------------- 2. Concretagem ---------------- */}
      <Secao
        numero="2"
        titulo="Concretagem"
        resumo={`prêmio do dia ${brl(premioConc)}${pctMeta !== null ? ` · ${pctMeta}% da meta` : ""}`}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex flex-wrap items-end gap-4 mb-2">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">m³ concretado no dia</span>
                <input
                  value={r.m3}
                  onChange={(e) => mudar((a) => ({ ...a, m3: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Ex.: 7,85"
                  className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-base font-medium"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Meta do dia (m³)</span>
                <input
                  value={r.meta}
                  onChange={(e) => mudar((a) => ({ ...a, meta: e.target.value }))}
                  inputMode="decimal"
                  placeholder="sem meta"
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-base"
                />
              </label>
            </div>
            {pctMeta !== null && (
              <div className="mb-4">
                <div className="h-2.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pctMeta >= 100 ? "bg-emerald-500" : pctMeta >= 80 ? "bg-amber-400" : "bg-rose-400"}`}
                    style={{ width: `${Math.min(100, pctMeta)}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs font-medium ${pctMeta >= 100 ? "text-emerald-700" : pctMeta >= 80 ? "text-amber-700" : "text-rose-700"}`}>
                  {num(lerNumero(r.m3) || 0)} de {num(lerNumero(r.meta))} m³ — {pctMeta}% da meta
                  {pctMeta >= 100 ? " ✓ meta batida" : ` (faltam ${num(Math.max(0, lerNumero(r.meta) - (lerNumero(r.m3) || 0)))} m³)`}
                </p>
              </div>
            )}
            <div className="mb-4 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Prêmio da concretagem do dia</p>
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-1.5">
                <input
                  type="radio"
                  checked={fixo}
                  onChange={() => mudar((a) => ({ ...a, modoConc: "FIXO" }))}
                  className="accent-emerald-600"
                />
                Valor fixo do dia:
                <input
                  value={r.premioFixo}
                  onChange={(e) => mudar((a) => ({ ...a, modoConc: "FIXO", premioFixo: e.target.value }))}
                  inputMode="decimal"
                  className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-500">R$</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={!fixo}
                  onChange={() => mudar((a) => ({ ...a, modoConc: "PECAS" }))}
                  className="accent-emerald-600"
                />
                Soma das peças × valor de cada uma ({brl(somaPecas)})
              </label>
            </div>
            <p className="text-sm font-medium text-slate-700 mb-1">
              Peças concretadas {fixo && <span className="font-normal text-xs text-slate-500">(só para controle)</span>}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">Peça</th>
                  <th className="py-1 font-medium">Qtd.</th>
                  <th className="py-1 font-medium text-right">Valor</th>
                  <th className="py-1 font-medium text-right">Prêmio</th>
                </tr>
              </thead>
              <tbody>
                {pecasDoDia.map((p) => {
                  const q = lerNumero(r.conc[p.id]) || 0;
                  const v = valorConc(p);
                  return (
                    <tr key={p.id} className={`border-t border-slate-100 ${q > 0 ? "bg-emerald-50/50" : ""}`}>
                      <td className="py-1 pr-2 text-slate-700">{p.nome}</td>
                      <td className="py-1 pr-2">
                        <input
                          value={r.conc[p.id] || ""}
                          onChange={(e) => mudar((a) => ({ ...a, conc: { ...a.conc, [p.id]: e.target.value } }))}
                          inputMode="decimal"
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="py-1 text-right text-xs text-slate-500">
                        {v === null ? <span className="text-amber-600">sem valor</span> : brl(v)}
                      </td>
                      <td className="py-1 text-right">{q > 0 ? brl(q * (v || 0)) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 self-start">
            <p className="text-sm font-medium text-slate-700 mb-1">Divisão do prêmio da concretagem</p>
            <p className="text-xs text-slate-500 mb-2">
              {fixo ? (
                <>Prêmio fixo do dia = {brl(premioConc)}.</>
              ) : (
                <>Soma das peças concretadas × valor de cada uma = {brl(premioConc)}.</>
              )}{" "}
              Dividido entre a equipe do dia; quem fez meio dia recebe metade da parte.
            </p>
            {equipe.length === 0 ? (
              <p className="text-xs text-slate-400">Ninguém marcado na concretagem.</p>
            ) : (
              <ul className="text-sm space-y-0.5">
                {equipe.map((e) => {
                  const p = pessoas.find((pp) => pp.id === e.colaborador_id);
                  return (
                    <li key={e.colaborador_id} className="flex justify-between gap-2">
                      <span className="text-slate-700">
                        {p?.nome} <span className="text-xs text-slate-400">({e.situacao})</span>
                      </span>
                      <span className="font-medium">{brl(parteDe[e.colaborador_id])}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Secao>

      {/* ---------------- 3. Armação ---------------- */}
      <Secao
        numero="3"
        titulo="Armação (ferragem)"
        resumo={`prêmio do dia ${brl(armacao.reduce((s, a) => {
          const p = pecas.find((pp) => pp.id === a.peca_id);
          return s + a.quantidade * (p ? valorArm(a.colaborador_id, p) : 0);
        }, 0))}`}
      >
        {armadores.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ninguém marcado na armação hoje. Marque os armadores em <b>1. Quem trabalhou hoje</b> (setor Armação) para
            lançar as peças de cada um.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-xs text-slate-500 mb-2">Digite quantas peças de cada tipo cada armador fez hoje.</p>
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 pr-3 font-medium">Peça</th>
                  <th className="py-1 pr-3 font-medium text-right">Valor</th>
                  {armadores.map((a) => (
                    <th key={a.id} className="py-1 px-1 font-medium text-center min-w-20">
                      {a.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pecasDoDia.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-1 pr-3 text-slate-700 whitespace-nowrap">{p.nome}</td>
                    <td className="py-1 pr-3 text-right text-xs text-slate-500">{brl(p.comissao)}</td>
                    {armadores.map((a) => {
                      const k = `${a.id}:${p.id}`;
                      return (
                        <td key={a.id} className="py-1 px-1 text-center">
                          <input
                            value={r.arm[k] || ""}
                            onChange={(e) => mudar((x) => ({ ...x, arm: { ...x.arm, [k]: e.target.value } }))}
                            inputMode="decimal"
                            className={`w-14 rounded border px-2 py-1 text-sm text-center ${lerNumero(r.arm[k]) > 0 ? "border-emerald-400 bg-emerald-50" : "border-slate-300"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-medium">
                  <td className="py-1.5 pr-3" colSpan={2}>
                    Prêmio do armador
                  </td>
                  {armadores.map((a) => (
                    <td key={a.id} className="py-1.5 px-1 text-center">
                      {brl(
                        armacao
                          .filter((x) => x.colaborador_id === a.id)
                          .reduce((s, x) => {
                            const p = pecas.find((pp) => pp.id === x.peca_id);
                            return s + x.quantidade * (p ? valorArm(a.id, p) : 0);
                          }, 0)
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {/* ---------------- 4. Prêmio de cada um ---------------- */}
      <Secao
        numero="4"
        titulo="Prêmio de cada um"
        resumo={`hoje ${brl(premiosPessoa.reduce((s, x) => s + x.hoje, 0))} · no mês ${brl(premiosPessoa.reduce((s, x) => s + x.mes, 0))}`}
      >
        <div className="flex flex-wrap items-center gap-1 mb-3">
          {[
            ["dia", "Do dia"],
            ["mes", "Acumulado no mês"],
            ["ambos", "Os dois"],
          ].map(([id, rot]) => (
            <button
              key={id}
              onClick={() => setVisao(id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                visao === id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {rot}
            </button>
          ))}
          <span className="text-[11px] text-slate-500 ml-2">
            Concretagem + armação. O mês soma os dias já salvos até este dia, mais o que está na tela. O prêmio mensal da
            meta entra no relatório do mês.
          </span>
        </div>
        {premiosPessoa.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum prêmio ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2 font-medium">Nome</th>
                  {visao !== "mes" && (
                    <>
                      <th className="py-1.5 px-2 font-medium text-right">Concretagem hoje</th>
                      <th className="py-1.5 px-2 font-medium text-right">Armação hoje</th>
                      <th className="py-1.5 px-2 font-medium text-right">Total hoje</th>
                    </>
                  )}
                  {visao !== "dia" && (
                    <>
                      <th className="py-1.5 px-2 font-medium text-right">Concretagem no mês</th>
                      <th className="py-1.5 px-2 font-medium text-right">Armação no mês</th>
                      <th className="py-1.5 px-2 font-medium text-right">Total no mês</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {premiosPessoa.map((x) => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-700">{x.nome}</td>
                    {visao !== "mes" && (
                      <>
                        <td className="py-1.5 px-2 text-right">{x.hojeConc ? brl(x.hojeConc) : "—"}</td>
                        <td className="py-1.5 px-2 text-right">{x.hojeArm ? brl(x.hojeArm) : "—"}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{brl(x.hoje)}</td>
                      </>
                    )}
                    {visao !== "dia" && (
                      <>
                        <td className="py-1.5 px-2 text-right">{x.mesConc ? brl(x.mesConc) : "—"}</td>
                        <td className="py-1.5 px-2 text-right">{x.mesArm ? brl(x.mesArm) : "—"}</td>
                        <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">{brl(x.mes)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {/* ---------------- 5. Observação ---------------- */}
      <Secao numero="5" titulo="Observação do dia (opcional)">
        <textarea
          value={r.obs}
          onChange={(e) => mudar((a) => ({ ...a, obs: e.target.value }))}
          rows={2}
          placeholder="Ex.: chuva parou a concretagem às 14h; betoneira quebrada..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Secao>

      {/* ---------------- barra de salvar ---------------- */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar dia"}
          </button>
          {avisos.length > 0 ? (
            <span className="text-xs text-amber-700">⚠ {avisos[0]}{avisos.length > 1 ? ` (+${avisos.length - 1})` : ""}</span>
          ) : (
            <span className="text-xs text-emerald-700">✓ Nada faltando</span>
          )}
          {dia && (
            <button onClick={apagar} className="ml-auto text-xs text-rose-600 hover:text-rose-800 underline">
              Apagar este dia
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        m³ {num(lerNumero(r.m3))} · {concretagem.reduce((s, x) => s + x.quantidade, 0)} peças concretadas ·{" "}
        {armacao.reduce((s, x) => s + x.quantidade, 0)} peças armadas
      </p>
    </div>
  );
}

const BOTAO_SEC =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed";

function Secao({ numero, titulo, resumo, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-slate-800">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs mr-2">
            {numero}
          </span>
          {titulo}
        </h2>
        {resumo && <span className="text-sm text-slate-500">{resumo}</span>}
      </div>
      {children}
    </section>
  );
}
