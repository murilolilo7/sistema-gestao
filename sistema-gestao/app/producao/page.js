"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, usePerfilProducao, AcessoRestrito, notificar, confirmar } from "@/components/Ui";
import Lancamento, { hojeISO } from "./Lancamento";
import Relatorios from "./Relatorios";
import { lerNumero, paraTexto } from "@/app/engenharia/custo-pilar/campos";
import {
  SETORES,
  rotuloSetor,
  nomeLimpo,
  nomeRepetido,
  nomeParecido,
  gerarTipo,
  custoMensalFuncao,
} from "./regras";

const ABAS = [
  { id: "lancar", rotulo: "Lançar o dia" },
  { id: "relatorios", rotulo: "Relatórios" },
  { id: "pessoas", rotulo: "Pessoas" },
  { id: "pecas", rotulo: "Peças e prêmios" },
];

const brl = (v) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function buscarTudo() {
  return Promise.all([
    supabase.from("producao_colaboradores").select("*").order("nome"),
    supabase.from("armacao_comissao").select("*").order("ordem"),
    supabase.from("mao_de_obra").select("id, funcao, salario_bruto, encargos_pct").order("funcao"),
  ]);
}

function ProducaoPage({ souAdmin }) {
  const [aba, setAba] = useState("lancar");
  const [dataDia, setDataDia] = useState(hojeISO());
  const [dados, setDados] = useState({ pessoas: [], pecas: [], funcoes: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  function aplicar([p, c, f]) {
    const falha = p.error || c.error || f.error;
    if (falha) setErro("Não foi possível carregar: " + falha.message);
    else setDados({ pessoas: p.data || [], pecas: c.data || [], funcoes: f.data || [] });
    setCarregando(false);
  }

  useEffect(() => {
    let ativo = true;
    buscarTudo().then((r) => ativo && aplicar(r));
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = () => buscarTudo().then(aplicar);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 print:hidden">Produção</h1>
      <p className="text-slate-500 mb-4 print:hidden">
        Aqui fica tudo o que a fábrica produz no dia: quem trabalhou, o concreto e as peças. É daqui que sai o prêmio de
        cada um e o custo real da mão de obra.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-5 print:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition ${
              aba === a.id
                ? "border-emerald-600 text-emerald-700 font-medium"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{erro}</div>
      )}

      {carregando ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : aba === "lancar" ? (
        <Lancamento pessoas={dados.pessoas} pecas={dados.pecas} data={dataDia} irParaData={setDataDia} />
      ) : aba === "relatorios" ? (
        <Relatorios
          pessoas={dados.pessoas}
          pecas={dados.pecas}
          funcoes={dados.funcoes}
          souAdmin={souAdmin}
          abrirDia={(d) => {
            setDataDia(d > hojeISO() ? hojeISO() : d);
            setAba("lancar");
          }}
        />
      ) : aba === "pessoas" ? (
        <AbaPessoas pessoas={dados.pessoas} funcoes={dados.funcoes} recarregar={recarregar} souAdmin={souAdmin} />
      ) : (
        <AbaPecas pecas={dados.pecas} recarregar={recarregar} souAdmin={souAdmin} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Pessoas

async function nomeLiberado(nome, pessoas, idIgnorar = null) {
  if (!nome) {
    notificar("Digite o nome da pessoa.", "erro");
    return false;
  }
  const igual = nomeRepetido(nome, pessoas, idIgnorar);
  if (igual) {
    notificar(`"${igual.nome}" já está cadastrado.`, "erro");
    return false;
  }
  const parecido = nomeParecido(nome, pessoas, idIgnorar);
  if (parecido) {
    return confirmar({
      titulo: "É a mesma pessoa?",
      texto: `Já existe "${parecido.nome}". Se for a mesma pessoa, cancele e use o cadastro que já existe — senão ela é contada duas vezes.`,
      confirmarTexto: "É outra pessoa, cadastrar",
    });
  }
  return true;
}

function AbaPessoas({ pessoas, funcoes, recarregar, souAdmin }) {
  const [novo, setNovo] = useState({ nome: "", funcao_id: "", setor: "CONCRETAGEM" });
  const [salvando, setSalvando] = useState(false);
  const [verInativos, setVerInativos] = useState(false);

  async function adicionar(e) {
    e.preventDefault();
    const nome = nomeLimpo(novo.nome);
    if (!novo.funcao_id) return notificar("Escolha a função da pessoa.", "erro");
    if (!(await nomeLiberado(nome, pessoas))) return;
    setSalvando(true);
    const { error } = await supabase
      .from("producao_colaboradores")
      .insert({ nome, funcao_id: Number(novo.funcao_id), setor: novo.setor });
    setSalvando(false);
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar(`${nome} cadastrado.`);
    setNovo({ nome: "", funcao_id: novo.funcao_id, setor: novo.setor });
    recarregar();
  }

  const inativos = pessoas.filter((p) => !p.ativo).length;

  return (
    <div className="space-y-5">
      <Explicacao>
        São as pessoas que o encarregado vai marcar no lançamento do dia. A <b>função</b> diz qual salário entra no
        custo (o valor vem de Preços → Mão de obra). O <b>setor</b> é onde a pessoa
        costuma trabalhar — no lançamento dá para marcar alguém em outro setor naquele dia.
        <br />
        Pessoa que saiu da empresa: clique em <b>Desativar</b>. Ela some do lançamento, mas o histórico dela continua.
      </Explicacao>

      <form onSubmit={adicionar} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-3">Cadastrar pessoa</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] items-end">
          <Campo rotulo="Nome (como a equipe chama)">
            <input
              value={novo.nome}
              onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              placeholder="Ex.: José Carlos"
              className={ESTILO_INPUT}
            />
          </Campo>
          <Campo rotulo="Função">
            <SelectFuncao valor={novo.funcao_id} funcoes={funcoes} aoMudar={(v) => setNovo({ ...novo, funcao_id: v })} />
          </Campo>
          <Campo rotulo="Setor">
            <SelectSetor valor={novo.setor} aoMudar={(v) => setNovo({ ...novo, setor: v })} />
          </Campo>
          <button
            disabled={salvando}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "+ Cadastrar"}
          </button>
        </div>
      </form>

      {SETORES.map((s) => {
        const doSetor = pessoas.filter((p) => p.setor === s.id && (verInativos || p.ativo));
        if (doSetor.length === 0 && s.id === "OUTRO") return null;
        const ativos = doSetor.filter((p) => p.ativo).length;
        return (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-medium text-slate-800">{s.rotulo}</p>
              <p className="text-xs text-slate-500">
                {ativos} {ativos === 1 ? "pessoa ativa" : "pessoas ativas"}
              </p>
            </div>
            {doSetor.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">Ninguém cadastrado neste setor.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Função</th>
                    <th className="px-2 py-2 font-medium">Setor</th>
                    {souAdmin && <th className="px-2 py-2 font-medium whitespace-nowrap">Custo da função/mês</th>}
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {doSetor.map((p) => (
                    <LinhaPessoa
                      key={`${p.id}:${p.nome}:${p.funcao_id}:${p.setor}:${p.ativo}`}
                      p={p}
                      pessoas={pessoas}
                      funcoes={funcoes}
                      recarregar={recarregar}
                      souAdmin={souAdmin}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {inativos > 0 && (
        <button onClick={() => setVerInativos((v) => !v)} className="text-sm text-slate-500 hover:text-slate-800 underline">
          {verInativos ? "Esconder" : "Mostrar"} {inativos} {inativos === 1 ? "pessoa desativada" : "pessoas desativadas"}
        </button>
      )}
    </div>
  );
}

function LinhaPessoa({ p, pessoas, funcoes, recarregar, souAdmin }) {
  const [rascunho, setRascunho] = useState({ nome: p.nome, funcao_id: String(p.funcao_id ?? ""), setor: p.setor });
  const [salvando, setSalvando] = useState(false);
  const mudou =
    nomeLimpo(rascunho.nome) !== p.nome || rascunho.funcao_id !== String(p.funcao_id ?? "") || rascunho.setor !== p.setor;
  const funcao = funcoes.find((f) => String(f.id) === rascunho.funcao_id);

  async function gravar(campos, aviso) {
    setSalvando(true);
    const { error } = await supabase.from("producao_colaboradores").update(campos).eq("id", p.id);
    setSalvando(false);
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar(aviso);
    recarregar();
  }

  async function salvar() {
    const nome = nomeLimpo(rascunho.nome);
    if (nome !== p.nome && !(await nomeLiberado(nome, pessoas, p.id))) return;
    if (!rascunho.funcao_id) return notificar("Escolha a função.", "erro");
    gravar({ nome, funcao_id: Number(rascunho.funcao_id), setor: rascunho.setor }, `${nome} atualizado.`);
  }

  async function alternarAtivo() {
    if (p.ativo) {
      const ok = await confirmar({
        titulo: `Desativar ${p.nome}?`,
        texto: "A pessoa sai da lista do lançamento do dia. O que ela já produziu continua no histórico. Dá para reativar depois.",
        confirmarTexto: "Desativar",
      });
      if (!ok) return;
    }
    gravar({ ativo: !p.ativo }, p.ativo ? `${p.nome} desativado.` : `${p.nome} reativado.`);
  }

  return (
    <tr className={`border-t border-slate-100 ${mudou ? "bg-amber-50/60" : ""} ${p.ativo ? "" : "opacity-50"}`}>
      <td className="px-4 py-1.5">
        <input
          value={rascunho.nome}
          onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
          className={`${ESTILO_INPUT} min-w-40`}
        />
      </td>
      <td className="px-2 py-1.5">
        <SelectFuncao valor={rascunho.funcao_id} funcoes={funcoes} aoMudar={(v) => setRascunho({ ...rascunho, funcao_id: v })} />
      </td>
      <td className="px-2 py-1.5">
        <SelectSetor valor={rascunho.setor} aoMudar={(v) => setRascunho({ ...rascunho, setor: v })} />
      </td>
      {souAdmin && (
        <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap" title="Salário da função + encargos">
          {brl(custoMensalFuncao(funcao))}
        </td>
      )}
      <td className="px-4 py-1.5 text-right whitespace-nowrap">
        {mudou ? (
          <span className="inline-flex gap-1">
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              onClick={() => setRascunho({ nome: p.nome, funcao_id: String(p.funcao_id ?? ""), setor: p.setor })}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Desfazer
            </button>
          </span>
        ) : (
          <button onClick={alternarAtivo} disabled={salvando} className="text-xs text-slate-500 hover:text-slate-900 underline">
            {p.ativo ? "Desativar" : "Reativar"}
          </button>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ Peças

function AbaPecas({ pecas, recarregar, souAdmin }) {
  const [nova, setNova] = useState({ nome: "", comissao: "", valor_concretagem: "" });
  const [salvando, setSalvando] = useState(false);
  const semConcretagem = pecas.filter((p) => p.ativo && (p.valor_concretagem === null || p.valor_concretagem === undefined));

  async function adicionar(e) {
    e.preventDefault();
    const nome = nomeLimpo(nova.nome);
    if (!nome) return notificar("Digite o nome da peça.", "erro");
    if (nomeRepetido(nome, pecas)) return notificar(`A peça "${nome}" já existe.`, "erro");
    const tipo = gerarTipo(nome);
    if (pecas.some((p) => p.tipo === tipo)) return notificar(`Já existe uma peça com esse nome.`, "erro");
    const comissao = lerNumero(nova.comissao);
    const concretagem = lerNumero(nova.valor_concretagem);
    if (comissao === null || comissao < 0) return notificar("Digite o prêmio da armação (pode ser 0).", "erro");
    if (concretagem !== null && concretagem < 0) return notificar("O prêmio da concretagem não pode ser negativo.", "erro");
    setSalvando(true);
    const ordem = Math.max(0, ...pecas.map((p) => p.ordem || 0)) + 1;
    const { error } = await supabase
      .from("armacao_comissao")
      .insert({ tipo, nome, comissao, valor_concretagem: concretagem, ordem });
    setSalvando(false);
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar(`Peça ${nome} cadastrada.`);
    setNova({ nome: "", comissao: "", valor_concretagem: "" });
    recarregar();
  }

  const visiveis = [...pecas].sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.ordem || 0) - (b.ordem || 0));

  return (
    <div className="space-y-5">
      <Explicacao>
        O prêmio do dia é a <b>soma das peças feitas × o valor de cada peça</b>. Cada peça tem um valor para a{" "}
        <b>armação</b> (quem fez a ferragem) e outro para a <b>concretagem</b>.
        <br />O valor da armação do <b>pilar sem consolo</b> também entra no Custo real do pilar (Engenharia). Toda
        alteração fica no Histórico de Preços.
      </Explicacao>

      {!souAdmin && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Só administrador altera os valores. Aqui você consulta o prêmio de cada peça.
        </div>
      )}

      {semConcretagem.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>{semConcretagem.length} peças ainda sem valor de concretagem.</b> Preencha a coluna &quot;Prêmio
          concretagem&quot; para o sistema calcular o prêmio da equipe.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2.5 font-medium">Peça</th>
              <th className="px-2 py-2.5 font-medium whitespace-nowrap">Prêmio armação (R$)</th>
              <th className="px-2 py-2.5 font-medium whitespace-nowrap">Prêmio concretagem (R$)</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <LinhaPeca
                key={`${p.id}:${p.nome}:${p.comissao}:${p.valor_concretagem}:${p.ativo}`}
                p={p}
                pecas={pecas}
                recarregar={recarregar}
                souAdmin={souAdmin}
              />
            ))}
          </tbody>
        </table>
      </div>

      {souAdmin && (
      <form onSubmit={adicionar} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-3">Cadastrar peça nova</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] items-end">
          <Campo rotulo="Nome da peça">
            <input
              value={nova.nome}
              onChange={(e) => setNova({ ...nova, nome: e.target.value })}
              placeholder="Ex.: Poste H"
              className={ESTILO_INPUT}
            />
          </Campo>
          <Campo rotulo="Prêmio armação (R$)">
            <input
              value={nova.comissao}
              onChange={(e) => setNova({ ...nova, comissao: e.target.value })}
              inputMode="decimal"
              placeholder="Ex.: 2,50"
              className={ESTILO_INPUT}
            />
          </Campo>
          <Campo rotulo="Prêmio concretagem (R$)">
            <input
              value={nova.valor_concretagem}
              onChange={(e) => setNova({ ...nova, valor_concretagem: e.target.value })}
              inputMode="decimal"
              placeholder="Se ainda não sabe, deixe vazio"
              className={ESTILO_INPUT}
            />
          </Campo>
          <button
            disabled={salvando}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "+ Cadastrar"}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}

function LinhaPeca({ p, pecas, recarregar, souAdmin }) {
  const original = { nome: p.nome, comissao: paraTexto(p.comissao), valor_concretagem: paraTexto(p.valor_concretagem) };
  const [rascunho, setRascunho] = useState(original);
  const [salvando, setSalvando] = useState(false);
  const mudou =
    nomeLimpo(rascunho.nome) !== original.nome ||
    rascunho.comissao.trim() !== original.comissao ||
    rascunho.valor_concretagem.trim() !== original.valor_concretagem;
  const semConcretagem = p.valor_concretagem === null || p.valor_concretagem === undefined;

  async function gravar(campos, aviso) {
    setSalvando(true);
    const { error } = await supabase.from("armacao_comissao").update(campos).eq("id", p.id);
    setSalvando(false);
    if (error) return notificar("Não foi possível salvar: " + error.message, "erro");
    notificar(aviso);
    recarregar();
  }

  async function salvar() {
    const nome = nomeLimpo(rascunho.nome);
    if (!nome) return notificar("Digite o nome da peça.", "erro");
    if (nomeRepetido(nome, pecas, p.id)) return notificar(`A peça "${nome}" já existe.`, "erro");
    const comissao = lerNumero(rascunho.comissao);
    const concretagem = lerNumero(rascunho.valor_concretagem);
    if (comissao === null || comissao < 0) return notificar("Prêmio da armação inválido (pode ser 0).", "erro");
    if (concretagem !== null && concretagem < 0) return notificar("O prêmio da concretagem não pode ser negativo.", "erro");
    const mudancaGrande =
      (Number(p.comissao) > 0 && Math.abs(comissao - Number(p.comissao)) / Number(p.comissao) > 0.5) || comissao > 30;
    if (mudancaGrande) {
      const ok = await confirmar({
        titulo: "Mudança grande no prêmio",
        texto: `O prêmio da armação de ${nome} vai de ${brl(p.comissao)} para ${brl(comissao)}. Confirma?`,
        confirmarTexto: "Salvar mesmo assim",
      });
      if (!ok) return;
    }
    gravar({ nome, comissao, valor_concretagem: concretagem }, `${nome} atualizada.`);
  }

  async function alternarAtivo() {
    if (p.ativo) {
      const ok = await confirmar({
        titulo: `Desativar ${p.nome}?`,
        texto: "A peça sai da lista do lançamento do dia. O que já foi lançado com ela continua no histórico.",
        confirmarTexto: "Desativar",
      });
      if (!ok) return;
    }
    gravar({ ativo: !p.ativo }, p.ativo ? `${p.nome} desativada.` : `${p.nome} reativada.`);
  }

  if (!souAdmin)
    return (
      <tr className={`border-t border-slate-100 ${p.ativo ? "" : "opacity-50"}`}>
        <td className="px-4 py-2 text-slate-700">{p.nome}</td>
        <td className="px-2 py-2">{brl(p.comissao)}</td>
        <td className="px-2 py-2">{semConcretagem ? <span className="text-amber-600">falta</span> : brl(p.valor_concretagem)}</td>
        <td />
      </tr>
    );

  return (
    <tr className={`border-t border-slate-100 ${mudou ? "bg-amber-50/60" : ""} ${p.ativo ? "" : "opacity-50"}`}>
      <td className="px-4 py-1.5">
        <input
          value={rascunho.nome}
          onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
          className={`${ESTILO_INPUT} min-w-44`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={rascunho.comissao}
          onChange={(e) => setRascunho({ ...rascunho, comissao: e.target.value })}
          inputMode="decimal"
          className={`${ESTILO_INPUT} w-24`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={rascunho.valor_concretagem}
          onChange={(e) => setRascunho({ ...rascunho, valor_concretagem: e.target.value })}
          inputMode="decimal"
          placeholder="falta"
          className={`${ESTILO_INPUT} w-24 ${semConcretagem && !mudou ? "border-amber-300 bg-amber-50 placeholder:text-amber-600" : ""}`}
        />
      </td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">
        {mudou ? (
          <span className="inline-flex gap-1">
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              onClick={() => setRascunho(original)}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Desfazer
            </button>
          </span>
        ) : (
          <button onClick={alternarAtivo} disabled={salvando} className="text-xs text-slate-500 hover:text-slate-900 underline">
            {p.ativo ? "Desativar" : "Reativar"}
          </button>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ peças pequenas

const ESTILO_INPUT =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function Explicacao({ children }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 leading-relaxed">
      {children}
    </div>
  );
}

function Campo({ rotulo, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{rotulo}</span>
      {children}
    </label>
  );
}

function SelectFuncao({ valor, funcoes, aoMudar }) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={ESTILO_INPUT}>
      <option value="">Escolha...</option>
      {funcoes.map((f) => (
        <option key={f.id} value={String(f.id)}>
          {f.funcao.charAt(0) + f.funcao.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}

function SelectSetor({ valor, aoMudar }) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={ESTILO_INPUT}>
      {SETORES.map((s) => (
        <option key={s.id} value={s.id}>
          {rotuloSetor(s.id)}
        </option>
      ))}
    </select>
  );
}

// Porteiro: administradores e quem tem a permissão "Lança produção" (tela Usuários).
export default function ProducaoPageProtegida() {
  const souAdmin = useSouAdmin();
  const perfil = usePerfilProducao();
  if (souAdmin === null || perfil === null) return null;
  if (!souAdmin && !perfil.pode) return <AcessoRestrito />;
  return <ProducaoPage souAdmin={souAdmin} />;
}
