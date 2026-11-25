"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { notificar } from "@/components/Ui";
import { lerNumero, paraTexto } from "@/app/engenharia/custo-pilar/campos";
import {
  SITUACOES,
  rotuloSetor,
  regraDoSetor,
  resumoMes,
  metaDoMes,
  metaBatida,
  bonusDoMes,
  custoMaoObraMes,
  custoMensalFuncao,
} from "./regras";
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

const SELECT_DIA = "*, producao_presencas(*), producao_concretagem_pecas(*), producao_armacao(*), producao_dia_tarefas(*)";

function buscarPeriodo(mesIni, mesFim) {
  return Promise.all([
    supabase
      .from("producao_dias")
      .select(SELECT_DIA)
      .gte("data", `${mesIni}-01`)
      .lte("data", `${mesFim}-${ultimoDia(mesFim)}`)
      .order("data"),
    supabase.from("producao_premio_mensal").select("*").gte("mes", `${mesIni}-01`).lte("mes", `${mesFim}-01`),
    supabase.from("producao_meta_mes").select("*").gte("mes", `${mesIni}-01`).lte("mes", `${mesFim}-01`),
  ]);
}

// O que vai no relatório (fica igual ao trocar de mês)
const CONTEUDOS = [
  { id: "resumo", rotulo: "Resumo do mês (m³, meta e totais)" },
  { id: "pessoas", rotulo: "Presença e prêmio de cada um" },
  { id: "pecas", rotulo: "Peças produzidas e equipe" },
  { id: "grade", rotulo: "Mês em grade (dia a dia)" },
];

export default function Relatorios({ pessoas, pecas, funcoes, setores, parametros, historicoBonus = [], tarefas = [], souAdmin, abrirDia }) {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [selecao, setSelecao] = useState({
    fora: [], // setores desmarcados
    conteudo: { resumo: true, pessoas: true, pecas: true, grade: true, custo: true },
    separar: false,
  });
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

      <RelatorioMes
        key={mes}
        mes={mes}
        pessoas={pessoas}
        pecas={pecas}
        setores={setores}
        parametros={parametros}
        historicoBonus={historicoBonus}
        tarefas={tarefas}
        selecao={selecao}
        setSelecao={setSelecao}
        souAdmin={souAdmin}
        abrirDia={abrirDia}
      />
      {souAdmin && selecao.conteudo.custo && (
        <div className="print:break-before-page">
          <CustoMaoObra
            key={`custo:${mes}`}
            mesFinal={mes}
            pessoas={pessoas}
            pecas={pecas}
            funcoes={funcoes}
            setores={setores}
            parametros={parametros}
            historicoBonus={historicoBonus}
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ mês

function RelatorioMes({ mes, pessoas, pecas, setores, parametros, historicoBonus, tarefas, selecao, setSelecao, souAdmin, abrirDia }) {
  const [dias, setDias] = useState(null);
  const [premios, setPremios] = useState([]);
  const [metaMensal, setMetaMensal] = useState(null);

  function aplicar([d, p, mm]) {
    if (d.error || p.error) notificar("Não foi possível carregar o mês: " + (d.error || p.error).message, "erro");
    setDias(d.data || []);
    setPremios(p.data || []);
    const linha = (mm?.data || [])[0];
    setMetaMensal(linha ? Number(linha.meta_m3) : null);
  }

  async function salvarMetaMensal(valor) {
    const { data: nome } = await supabase.rpc("nome_usuario_atual");
    const { error } = await supabase
      .from("producao_meta_mes")
      .upsert({ mes: `${mes}-01`, meta_m3: valor, atualizado_em: new Date().toISOString(), atualizado_por_nome: nome || null });
    if (error) return notificar("Não foi possível salvar a meta: " + error.message, "erro");
    notificar("Meta do mês salva.");
    setMetaMensal(valor);
  }
  useEffect(() => {
    let ativo = true;
    buscarPeriodo(mes, mes).then((r) => ativo && aplicar(r));
    return () => {
      ativo = false;
    };
  }, [mes]);

  if (dias === null) return <p className="text-sm text-slate-500">Carregando o mês...</p>;

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

  const metaMes = metaDoMes(dias, parametros?.meta_m3_padrao ?? 7, metaMensal ?? parametros?.meta_mensal_m3 ?? 140);
  const bonus = bonusDoMes(mes, historicoBonus, metaMes.batida);
  const resumo = resumoMes(dias, premios, setores, bonus);
  const setorDe = (id) => pessoas.find((p) => p.id === id)?.setor || "OUTRO";

  // setores que aparecem no mês (presença ou prêmio mensal), na ordem do cadastro
  const idsNoMes = new Set([
    ...dias.flatMap((d) => (d.producao_presencas || []).map((x) => x.setor)),
    ...resumo.linhas.filter((l) => l.premioMensal).map((l) => setorDe(l.colaborador_id)),
  ]);
  const setoresDoMes = [
    ...setores.filter((s) => idsNoMes.has(s.id)),
    ...[...idsNoMes].filter((id) => !setores.some((s) => s.id === id)).map((id) => ({ id, rotulo: rotuloSetor(id, setores), regra: regraDoSetor(id, setores) })),
  ];
  const escolhidos = setoresDoMes.filter((s) => !selecao.fora.includes(s.id));
  const grupos = selecao.separar ? escolhidos.map((s) => [s]) : escolhidos.length ? [escolhidos] : [];

  const props = {
    mes,
    dias,
    resumo,
    pessoas,
    pecas,
    setores,
    tarefas,
    parametros,
    metaMensal: metaMensal ?? parametros?.meta_mensal_m3 ?? 140,
    salvarMetaMensal,
    conteudo: selecao.conteudo,
    salvarPremioMensal,
    abrirDia,
  };

  return (
    <div className="space-y-5">
      <MontarRelatorio setoresDoMes={setoresDoMes} selecao={selecao} setSelecao={setSelecao} souAdmin={souAdmin} />
      {grupos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 print:hidden">
          Marque pelo menos um setor.
        </p>
      )}
      {grupos.map((g, i) => (
        <div key={g.map((s) => s.id).join("+")} className={i > 0 ? "print:break-before-page" : ""}>
          <RelatorioDosSetores {...props} grupo={g} titulo={selecao.separar || g.length < setoresDoMes.length ? g.map((s) => s.rotulo).join(", ") : ""} />
        </div>
      ))}
    </div>
  );
}

function MontarRelatorio({ setoresDoMes, selecao, setSelecao, souAdmin }) {
  const [aberto, setAberto] = useState(false);
  const marcarSetor = (id, sim) =>
    setSelecao((s) => ({ ...s, fora: sim ? s.fora.filter((x) => x !== id) : [...s.fora, id] }));
  const marcarConteudo = (id, sim) => setSelecao((s) => ({ ...s, conteudo: { ...s.conteudo, [id]: sim } }));
  const conteudos = souAdmin ? [...CONTEUDOS, { id: "custo", rotulo: "Custo da mão de obra (12 meses)" }] : CONTEUDOS;
  const marcados = setoresDoMes.filter((s) => !selecao.fora.includes(s.id)).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium text-slate-700">Montar relatório</span>
        <span className="text-xs text-slate-500">
          {marcados} de {setoresDoMes.length} setores{selecao.separar ? " · cada setor em uma folha" : ""} {aberto ? "▲" : "▼"}
        </span>
      </button>
      {aberto && (
        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Setores</p>
            {setoresDoMes.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!selecao.fora.includes(s.id)}
                  onChange={(e) => marcarSetor(s.id, e.target.checked)}
                  className="accent-emerald-600"
                />
                {s.rotulo}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-700 pt-1.5 border-t border-slate-100">
              <input
                type="checkbox"
                checked={selecao.separar}
                onChange={(e) => setSelecao((s) => ({ ...s, separar: e.target.checked }))}
                className="accent-emerald-600"
              />
              Cada setor em uma folha
            </label>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">O que mostrar e imprimir</p>
            {conteudos.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!selecao.conteudo[c.id]}
                  onChange={(e) => marcarConteudo(c.id, e.target.checked)}
                  className="accent-emerald-600"
                />
                {c.rotulo}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Um relatório (resumo, pessoas, peças, grade) só com a parte dos setores do grupo
function RelatorioDosSetores({
  mes,
  dias,
  resumo,
  pessoas,
  pecas,
  setores,
  tarefas = [],
  parametros,
  metaMensal,
  salvarMetaMensal,
  conteudo,
  grupo,
  titulo,
  salvarPremioMensal,
  abrirDia,
}) {
  const ids = grupo.map((s) => s.id);
  const regraDe = (id) => grupo.find((s) => s.id === id)?.regra || regraDoSetor(id, setores);
  const temConcretagem = ids.some((id) => regraDe(id) === "EQUIPE_META");
  const temArmacao = ids.some((id) => regraDe(id) === "POR_PECA");
  const colunasPremio = grupo.filter((s) => regraDe(s.id) !== "SEM");
  const nomeDe = (id) => pessoas.find((p) => p.id === id)?.nome || `#${id}`;
  const setorDe = (id) => pessoas.find((p) => p.id === id)?.setor || "OUTRO";
  const pecaDe = (id) => pecas.find((p) => p.id === id)?.nome || `#${id}`;
  const soma = (l, campo) => ids.reduce((s, id) => s + (l.porSetor[id]?.[campo] || 0), 0);
  // tarefa extra (ex.: Qualidade) feita por quem estava nesses setores
  const tarefaNoGrupo = (l, tid, campo) => ids.reduce((s, id) => s + (l.porSetor[id]?.tarefas?.[tid]?.[campo] || 0), 0);
  const idsTarefas = [
    ...new Set(
      resumo.linhas.flatMap((l) => ids.flatMap((id) => Object.keys(l.porSetor[id]?.tarefas || {}).map(Number)))
    ),
  ];
  const colunasTarefa = idsTarefas
    .map((id) => tarefas.find((t) => t.id === id) || { id, nome: `Tarefa #${id}`, ordem: 999 })
    .sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || a.id - b.id);

  // pessoas que trabalharam (ou faltaram) nesses setores; prêmio mensal fica no setor da pessoa
  const linhas = resumo.linhas
    .map((l) => {
      const mensal = ids.includes(setorDe(l.colaborador_id)) ? l.premioMensal : 0;
      const premios = Object.fromEntries(colunasPremio.map((s) => [s.id, l.porSetor[s.id]?.premio || 0]));
      const premiosTarefa = Object.fromEntries(colunasTarefa.map((t) => [t.id, tarefaNoGrupo(l, t.id, "valor")]));
      const diasTarefa = Object.fromEntries(colunasTarefa.map((t) => [t.id, tarefaNoGrupo(l, t.id, "dias")]));
      const totalPremios =
        Object.values(premios).reduce((a, b) => a + b, 0) + Object.values(premiosTarefa).reduce((a, b) => a + b, 0);
      return {
        ...l,
        diasG: soma(l, "dias"),
        meiosG: soma(l, "meios"),
        faltasG: soma(l, "faltas"),
        premios,
        premiosTarefa,
        diasTarefa,
        mensal,
        totalG: Math.round((totalPremios + mensal) * 100) / 100,
        aparece: ids.some((id) => l.porSetor[id]) || mensal > 0,
      };
    })
    .filter((l) => l.aparece)
    .sort(
      (a, b) =>
        setorDe(a.colaborador_id).localeCompare(setorDe(b.colaborador_id)) ||
        nomeDe(a.colaborador_id).localeCompare(nomeDe(b.colaborador_id))
    );
  const totalColuna = (id) => linhas.reduce((s, l) => s + (l.premios[id] || 0), 0);
  const totalTarefa = (id) => linhas.reduce((s, l) => s + (l.premiosTarefa[id] || 0), 0);
  const totalMensal = linhas.reduce((s, l) => s + l.mensal, 0);
  const totalGeral = linhas.reduce((s, l) => s + l.totalG, 0);
  const meta = metaDoMes(dias, parametros?.meta_m3_padrao ?? 7, metaMensal);
  const t = resumo.totais;

  return (
    <div className="space-y-5">
      <h2 className="hidden print:block text-xl font-bold capitalize">
        Produção — {NOME_MES(mes)}
        {titulo && <span className="normal-case"> — {titulo}</span>}
      </h2>
      {titulo && <h2 className="text-lg font-semibold text-slate-800 print:hidden">{titulo}</h2>}

      {conteudo.resumo && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Cartao rotulo="Dias com produção" valor={t.diasComProducao} />
          {temConcretagem && (
            <Cartao
              rotulo="m³ concretados"
              valor={num(t.m3, 1)}
              detalhe={t.diasComProducao ? `${num(t.m3 / t.diasComProducao, 2)} m³ por dia` : ""}
            />
          )}
          {temConcretagem && (
            <div className={`rounded-xl border p-3 shadow-sm ${meta.batida ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-xs text-slate-500">Meta do mês</p>
              <p className={`text-xl font-bold ${meta.batida ? "text-emerald-800" : "text-amber-800"}`}>
                {meta.pct === null ? "—" : `${meta.pct}%`} {meta.batida ? "✓" : ""}
              </p>
              <p className="text-[11px] text-slate-600">
                {num(meta.feito, 1)} de <MetaMensal key={metaMensal} valor={metaMensal} salvar={salvarMetaMensal} /> m³
                {meta.diasAbaixo ? ` · ${meta.diasAbaixo} ${meta.diasAbaixo === 1 ? "dia abaixo" : "dias abaixo"} da meta do dia` : ""}
              </p>
            </div>
          )}
          {temConcretagem && <Cartao rotulo="Peças concretadas" valor={num(t.pecasConcretadas, 0)} />}
          {temArmacao && <Cartao rotulo="Peças armadas" valor={num(t.pecasArmadas, 0)} />}
          <Cartao rotulo="Prêmios do mês" valor={brl(totalGeral)} destaque />
        </div>
      )}

      {conteudo.pessoas && (
        <Bloco titulo="Presença e prêmio de cada um">
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
                  {colunasPremio.map((s) => (
                    <th key={s.id} className="py-2 px-2 font-medium text-right">
                      {s.rotulo}
                    </th>
                  ))}
                  {colunasTarefa.map((t) => (
                    <th key={`t${t.id}`} className="py-2 px-2 font-medium text-right" title="Tarefa extra do dia">
                      {t.nome}
                    </th>
                  ))}
                  <th className="py-2 px-2 font-medium text-right">Prêmio mensal</th>
                  <th className="py-2 pl-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.colaborador_id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 font-medium text-slate-800">{nomeDe(l.colaborador_id)}</td>
                    <td className="py-1.5 px-2 text-slate-500">{rotuloSetor(setorDe(l.colaborador_id), setores)}</td>
                    <td className="py-1.5 px-2 text-center">{l.diasG}</td>
                    <td className="py-1.5 px-2 text-center text-slate-500">{l.meiosG || ""}</td>
                    <td className={`py-1.5 px-2 text-center ${l.faltasG ? "text-rose-600 font-medium" : "text-slate-400"}`}>
                      {l.faltasG || "0"}
                    </td>
                    {colunasPremio.map((s) => (
                      <td key={s.id} className="py-1.5 px-2 text-right">
                        {l.premios[s.id] ? brl(l.premios[s.id]) : ""}
                        {regraDe(s.id) === "POR_PECA" && l.porSetor[s.id]?.pecas ? (
                          <span className="text-[10px] text-slate-400"> ({num(l.porSetor[s.id].pecas, 0)} pç)</span>
                        ) : null}
                      </td>
                    ))}
                    {colunasTarefa.map((t) => (
                      <td key={`t${t.id}`} className="py-1.5 px-2 text-right">
                        {l.premiosTarefa[t.id] ? brl(l.premiosTarefa[t.id]) : ""}
                        {l.diasTarefa[t.id] ? (
                          <span className="text-[10px] text-slate-400">
                            {" "}
                            ({num(l.diasTarefa[t.id], 1)} {l.diasTarefa[t.id] === 1 ? "dia" : "dias"})
                          </span>
                        ) : null}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-right">
                      {ids.includes(setorDe(l.colaborador_id)) ? (
                        <PremioMensal key={`${l.colaborador_id}:${l.premioMensal}`} linha={l} salvar={salvarPremioMensal} />
                      ) : null}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-semibold">{brl(l.totalG)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t-2 border-slate-300">
                  <td className="py-2 pr-2" colSpan={5}>
                    Total do mês
                  </td>
                  {colunasPremio.map((s) => (
                    <td key={s.id} className="py-2 px-2 text-right">
                      {brl(totalColuna(s.id))}
                    </td>
                  ))}
                  {colunasTarefa.map((t) => (
                    <td key={`t${t.id}`} className="py-2 px-2 text-right">
                      {brl(totalTarefa(t.id))}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right">{brl(totalMensal)}</td>
                  <td className="py-2 pl-2 text-right">{brl(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Bloco>
      )}

      {conteudo.pecas && (temConcretagem || temArmacao) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {temConcretagem && (
            <Bloco titulo="Peças concretadas no mês">
              <ListaPecas mapa={resumo.porPecaConcretada} pecaDe={pecaDe} vazio="Nenhuma peça concretada lançada." />
              <EquipeDoSetor
                linhas={linhas.filter((l) => ids.some((id) => regraDe(id) === "EQUIPE_META" && l.porSetor[id]?.dias))}
                nomeDe={nomeDe}
                diasDe={(l) => ids.filter((id) => regraDe(id) === "EQUIPE_META").reduce((s, id) => s + (l.porSetor[id]?.dias || 0), 0)}
              />
            </Bloco>
          )}
          {temArmacao && (
            <Bloco titulo="Peças armadas no mês, por armador">
              <PecasPorArmador
                linhas={linhas.filter((l) => ids.some((id) => regraDe(id) === "POR_PECA" && l.porSetor[id]?.pecas))}
                nomeDe={nomeDe}
                pecaDe={pecaDe}
              />
            </Bloco>
          )}
        </div>
      )}

      {conteudo.grade && (
        <Bloco
          titulo="Mês em grade"
          texto="Cada letra é o que foi lançado no dia. Letra com bolinha = trabalhou em outro setor naquele dia. Clique no número do dia para abrir o lançamento."
        >
          <GradeMes
            mes={mes}
            dias={dias}
            linhas={linhas.filter((l) => ids.some((id) => l.porSetor[id]))}
            nomeDe={nomeDe}
            setorDe={setorDe}
            setores={setores}
            somenteSetores={ids}
            mostrarM3={temConcretagem}
            metaPadrao={parametros?.meta_m3_padrao ?? 7}
            abrirDia={abrirDia}
          />
        </Bloco>
      )}
    </div>
  );
}

function EquipeDoSetor({ linhas, nomeDe, diasDe }) {
  if (!linhas.length) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="text-xs font-medium text-slate-600 mb-1">Equipe</p>
      <p className="text-sm text-slate-700">
        {linhas
          .map((l) => `${nomeDe(l.colaborador_id)} (${diasDe(l)} ${diasDe(l) === 1 ? "dia" : "dias"})`)
          .join(" · ")}
      </p>
    </div>
  );
}

function PecasPorArmador({ linhas, nomeDe, pecaDe }) {
  const idsPecas = [...new Set(linhas.flatMap((l) => Object.keys(l.armadasPorPeca)))];
  if (!linhas.length || !idsPecas.length) return <p className="text-sm text-slate-400">Nenhuma peça armada lançada.</p>;
  const total = (pid) => linhas.reduce((s, l) => s + (l.armadasPorPeca[pid] || 0), 0);
  idsPecas.sort((a, b) => total(b) - total(a));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-1.5 pr-2 font-medium">Peça</th>
            {linhas.map((l) => (
              <th key={l.colaborador_id} className="py-1.5 px-1 font-medium text-center">
                {nomeDe(l.colaborador_id).split(" ").slice(0, 2).join(" ")}
              </th>
            ))}
            <th className="py-1.5 pl-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {idsPecas.map((pid) => (
            <tr key={pid} className="border-b border-slate-100">
              <td className="py-1 pr-2 text-slate-700">{pecaDe(Number(pid))}</td>
              {linhas.map((l) => (
                <td key={l.colaborador_id} className="py-1 px-1 text-center">
                  {l.armadasPorPeca[pid] ? num(l.armadasPorPeca[pid], 0) : ""}
                </td>
              ))}
              <td className="py-1 pl-2 text-right font-medium">{num(total(pid), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetaMensal({ valor, salvar }) {
  const inicial = paraTexto(valor);
  const [texto, setTexto] = useState(inicial);
  const mudou = texto.trim() !== inicial;
  const v = lerNumero(texto);
  return (
    <>
      <span className="hidden print:inline">{num(valor, 1)}</span>
      <span className="inline-flex items-center gap-1 print:hidden">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="decimal"
          title="Meta de m³ deste mês"
          className="w-14 rounded border border-slate-300 bg-white px-1 py-0 text-[11px] text-right"
        />
        {mudou && (
          <button
            onClick={() => salvar(v)}
            disabled={v === null || v < 0}
            className="rounded bg-emerald-600 px-1.5 py-0 text-[10px] text-white disabled:opacity-50"
          >
            Salvar
          </button>
        )}
      </span>
    </>
  );
}

// Prêmio mensal: vem sozinho da vaga do bônus (meta do mês batida) ou é
// digitado. Apagar o número digitado volta para o valor da vaga.
function PremioMensal({ linha, salvar }) {
  const digitado = linha.premioMensalOrigem === "DIGITADO";
  const inicial = digitado || linha.premioMensal ? paraTexto(linha.premioMensal) : "";
  const [texto, setTexto] = useState(inicial);
  const mudou = texto.trim() !== inicial;
  const valor = texto.trim() ? lerNumero(texto) : null;
  const vagas = linha.premioMensalOrigem === "VAGA" ? (linha.vagasBonus || []).join(", ") : "";
  return (
    <>
    {/* no papel sai o valor (o campo de digitar só existe na tela) */}
    <span className="hidden print:inline">
      {linha.premioMensal ? brl(linha.premioMensal) : ""}
      {vagas && <span className="text-[9px] text-slate-500"> ({vagas})</span>}
    </span>
    <span className="inline-flex items-center gap-1 print:hidden">
      {vagas && !mudou && <span className="text-[10px] text-amber-700" title="Bônus da meta do mês pela vaga">{vagas}</span>}
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
          disabled={texto.trim() !== "" && (valor === null || valor < 0)}
          className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
        >
          Salvar
        </button>
      )}
    </span>
    </>
  );
}

function GradeMes({ mes, dias, linhas, nomeDe, setorDe, setores, somenteSetores = null, mostrarM3 = true, metaPadrao = 7, abrirDia }) {
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
          {mostrarM3 && (
            <tr className="border-b border-slate-200">
              <td className="sticky left-0 bg-white pr-2 py-1 font-medium text-emerald-700 whitespace-nowrap">m³ do dia</td>
              {nums.map((d) => {
                const dd = porData[d];
                const metaDia = Number(dd?.meta_m3) > 0 ? Number(dd.meta_m3) : metaPadrao;
                const abaixo = dd?.m3_concretado && !metaBatida(dd.m3_concretado, metaDia);
                return (
                  <td
                    key={d}
                    className={`text-center text-[10px] py-1 ${abaixo ? "text-rose-600 font-semibold" : "text-emerald-700"}`}
                    title={abaixo ? `Abaixo da meta de ${num(metaDia, 1)} m³` : undefined}
                  >
                    {dd?.m3_concretado ? num(dd.m3_concretado, 1) : ""}
                  </td>
                );
              })}
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={l.colaborador_id} className="border-b border-slate-100">
              <td className="sticky left-0 bg-white pr-2 py-0.5 text-slate-700 whitespace-nowrap">{nomeDe(l.colaborador_id)}</td>
              {nums.map((d) => {
                const p = porData[d]?.producao_presencas?.find(
                  (x) => x.colaborador_id === l.colaborador_id && (!somenteSetores || somenteSetores.includes(x.setor))
                );
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

function montarMeses([d, p, mm], mesIni, setores, parametros, historicoBonus) {
  if (d.error || p.error) notificar("Não foi possível carregar o custo: " + (d.error || p.error).message, "erro");
  const lista = [];
  for (let i = 0; i < 12; i++) {
    const ym = somarMeses(mesIni, i);
    const dias = (d.data || []).filter((x) => x.data.startsWith(ym));
    const pm = (p.data || []).filter((x) => x.mes.startsWith(ym));
    const metaMensal = (mm?.data || []).find((x) => x.mes.startsWith(ym))?.meta_m3 ?? parametros?.meta_mensal_m3 ?? 140;
    const batida = metaDoMes(dias, parametros?.meta_m3_padrao ?? 7, Number(metaMensal)).batida;
    if (dias.length) lista.push({ ym, resumo: resumoMes(dias, pm, setores, bonusDoMes(ym, historicoBonus, batida)) });
  }
  return lista;
}

function CustoMaoObra({ mesFinal, pessoas, pecas, funcoes, setores, parametros, historicoBonus }) {
  const [meses, setMeses] = useState(null);
  const mesIni = somarMeses(mesFinal, -11);

  useEffect(() => {
    let ativo = true;
    buscarPeriodo(mesIni, mesFinal).then(
      (r) => ativo && setMeses(montarMeses(r, mesIni, setores, parametros, historicoBonus))
    );
    return () => {
      ativo = false;
    };
  }, [mesIni, mesFinal, setores, parametros, historicoBonus]);

  if (meses === null) return <p className="text-sm text-slate-500">Calculando o custo dos últimos 12 meses...</p>;

  const custoPessoa = (id) => {
    const p = pessoas.find((x) => x.id === id);
    const f = funcoes.find((x) => x.id === p?.funcao_id);
    return f ? custoMensalFuncao(f) : null;
  };
  const linhas = meses.map((m) => ({ ...m, custo: custoMaoObraMes(m.resumo, custoPessoa, setores) }));
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
      texto="O salário da função de cada pessoa (com encargos) é repartido entre os setores pelos dias em que ela foi marcada em cada um, e somado aos prêmios. Concretagem: custo ÷ m³ do mês, contando também quem está em setor sem divisão de prêmio (ex.: Supervisão, Montagem) e as tarefas extras do dia (ex.: Qualidade). Armação: quanto custa cada R$ 1 de prêmio pago (salários + prêmios ÷ prêmios). Feriados e paradas entram sozinhos: o mês com menos produção fica mais caro."
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
                  <th className="py-2 px-2 font-medium text-right" title="Já somado nos salários: quem trabalhou em setor sem divisão de prêmio (ex.: Supervisão, Montagem)">
                    dos quais outros setores
                  </th>
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
                    <td className="py-1.5 px-2 text-right text-slate-500">
                      {l.custo.concretagem.salariosOutros ? brl(l.custo.concretagem.salariosOutros) : "—"}
                    </td>
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
                  <td className="py-2 px-2 text-right text-slate-500">{brl(soma((l) => l.custo.concretagem.salariosOutros || 0))}</td>
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
