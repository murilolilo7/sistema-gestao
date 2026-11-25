"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, usePerfilProducao, AcessoRestrito, notificar, confirmar } from "@/components/Ui";
import Lancamento, { hojeISO } from "./Lancamento";
import Relatorios from "./Relatorios";
import { lerNumero, paraTexto } from "@/app/engenharia/custo-pilar/campos";
import {
  SETORES,
  listaSetores,
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
    supabase.from("producao_setores").select("*").order("ordem"),
  ]);
}

function ProducaoPage({ souAdmin }) {
  const [aba, setAba] = useState("lancar");
  const [dataDia, setDataDia] = useState(hojeISO());
  const [dados, setDados] = useState({ pessoas: [], pecas: [], funcoes: [], setores: SETORES, setoresLinhas: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  function aplicar([p, c, f, st]) {
    const falha = p.error || c.error || f.error || st.error;
    if (falha) setErro("Não foi possível carregar: " + falha.message);
    else
      setDados({
        pessoas: p.data || [],
        pecas: c.data || [],
        funcoes: f.data || [],
        setores: listaSetores(st.data),
        setoresLinhas: st.data || [],
      });
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
        <Lancamento pessoas={dados.pessoas} pecas={dados.pecas} setores={dados.setores} data={dataDia} irParaData={setDataDia} />
      ) : aba === "relatorios" ? (
        <Relatorios
          pessoas={dados.pessoas}
          pecas={dados.pecas}
          funcoes={dados.funcoes}
          setores={dados.setores}
          souAdmin={souAdmin}
          abrirDia={(d) => {
            setDataDia(d > hojeISO() ? hojeISO() : d);
            setAba("lancar");
          }}
        />
      ) : aba === "pessoas" ? (
        <AbaPessoas
          pessoas={dados.pessoas}
          funcoes={dados.funcoes}
          setores={dados.setores}
          recarregar={recarregar}
          souAdmin={souAdmin}
        />
      ) : (
        <AbaPecas pecas={dados.pecas} recarregar={recarregar} />
      )}
    </div>
  );
}

// Exclui de vez. Só funciona se nunca foi usado em lançamento; se já foi,
// o banco não deixa (o histórico ficaria sem dono) e a saída é desativar.
async function excluirDeVez({ tabela, id, nome, oQue, recarregar }) {
  const ok = await confirmar({
    titulo: `Excluir ${nome}?`,
    texto: `${oQue} some do cadastro de vez. Isso só é possível se nunca foi usado em nenhum lançamento — se já foi, use Desativar.`,
    confirmarTexto: "Excluir",
    perigoso: true,
  });
  if (!ok) return;
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) {
    if (error.code === "23503")
      return notificar(`${nome} já tem lançamentos e não pode ser excluído. Use Desativar: some da lista e o histórico fica.`, "erro");
    return notificar("Não foi possível excluir: " + error.message, "erro");
  }
  notificar(`${nome} excluído.`);
  recarregar();
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

function AbaPessoas({ pessoas, funcoes, setores, recarregar, souAdmin }) {
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

  const ativos = pessoas.filter((p) => p.ativo);
  const desativados = pessoas.filter((p) => !p.ativo);
  // setores ativos + algum setor desativado que ainda tenha gente ativa
  const setoresVisiveis = setores.filter((s) => s.ativo !== false || ativos.some((p) => p.setor === s.id));
  const cabecalho = (
    <thead>
      <tr className="text-left text-xs text-slate-500">
        <th className="px-4 py-2 font-medium">Nome</th>
        <th className="px-2 py-2 font-medium">Função</th>
        <th className="px-2 py-2 font-medium">Setor</th>
        {souAdmin && (
          <>
            <th className="px-2 py-2 font-medium text-right whitespace-nowrap">Salário</th>
            <th className="px-2 py-2 font-medium text-right whitespace-nowrap">Encargos</th>
            <th className="px-2 py-2 font-medium text-right whitespace-nowrap">Custo/mês</th>
          </>
        )}
        <th className="px-4 py-2" />
      </tr>
    </thead>
  );
  const linhas = (lista) =>
    lista.map((p) => (
      <LinhaPessoa
        key={`${p.id}:${p.nome}:${p.funcao_id}:${p.setor}:${p.ativo}`}
        p={p}
        pessoas={pessoas}
        funcoes={funcoes}
        setores={setores}
        recarregar={recarregar}
        souAdmin={souAdmin}
      />
    ));

  return (
    <div className="space-y-5">
      <Explicacao>
        São as pessoas que o encarregado vai marcar no lançamento do dia. A <b>função</b> diz qual salário entra no
        custo (o salário é preenchido pelo administrador). O <b>setor</b> é onde a pessoa costuma trabalhar — no
        lançamento dá para marcar alguém em outro setor naquele dia.
        <br />
        <b>Para alterar:</b> mude direto no campo e clique em <b>Salvar</b> (ou Desfazer). Pessoa que saiu da empresa:{" "}
        <b>Desativar</b> — some do lançamento, o histórico continua, e dá para <b>Reativar</b> quando quiser (as
        desativadas ficam separadas, no fim da página). <b>Excluir</b> só para cadastro feito por engano, que nunca
        entrou em lançamento.
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
            <SelectSetor valor={novo.setor} setores={setores} aoMudar={(v) => setNovo({ ...novo, setor: v })} />
          </Campo>
          <button
            disabled={salvando}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "+ Cadastrar"}
          </button>
        </div>
      </form>

      <FuncoesESetores funcoes={funcoes} setores={setores} pessoas={pessoas} recarregar={recarregar} />

      {setoresVisiveis.map((s) => {
        const doSetor = ativos.filter((p) => p.setor === s.id);
        if (doSetor.length === 0 && !s.fixo) return null;
        if (doSetor.length === 0 && s.id === "OUTRO") return null;
        return (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-medium text-slate-800">{s.rotulo}</p>
              <p className="text-xs text-slate-500">
                {doSetor.length} {doSetor.length === 1 ? "pessoa ativa" : "pessoas ativas"}
              </p>
            </div>
            {doSetor.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">Ninguém cadastrado neste setor.</p>
            ) : (
              <table className="w-full text-sm">
                {cabecalho}
                <tbody>{linhas(doSetor)}</tbody>
              </table>
            )}
          </div>
        );
      })}

      {desativados.length > 0 && (
        <button onClick={() => setVerInativos((v) => !v)} className="text-sm text-slate-500 hover:text-slate-800 underline">
          {verInativos ? "Esconder" : "Mostrar"} {desativados.length}{" "}
          {desativados.length === 1 ? "pessoa desativada" : "pessoas desativadas"}
        </button>
      )}
      {verInativos && desativados.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <p className="font-medium text-slate-600">Desativadas</p>
            <p className="text-xs text-slate-500">não aparecem no lançamento · use Reativar para voltar</p>
          </div>
          <table className="w-full text-sm">
            {cabecalho}
            <tbody>{linhas(desativados)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Função e setor novos: a fábrica cria sem depender do administrador. A função
// nasce sem salário (o administrador preenche em Preços → Mão de obra).
function FuncoesESetores({ funcoes, setores, pessoas, recarregar }) {
  const [aberto, setAberto] = useState(false);
  const [funcao, setFuncao] = useState("");
  const [setor, setSetor] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criarFuncao(e) {
    e.preventDefault();
    const nome = nomeLimpo(funcao).toUpperCase();
    if (!nome) return notificar("Digite o nome da função.", "erro");
    setSalvando(true);
    const { error } = await supabase.rpc("producao_criar_funcao", { nome_input: nome });
    setSalvando(false);
    if (error) return notificar(error.message, "erro");
    notificar(`Função ${nome} criada. O salário dela fica a preencher pelo administrador.`);
    setFuncao("");
    recarregar();
  }

  async function criarSetor(e) {
    e.preventDefault();
    const nome = nomeLimpo(setor);
    if (!nome) return notificar("Digite o nome do setor.", "erro");
    const id = gerarTipo(nome);
    if (setores.some((s) => s.id === id || s.rotulo.toUpperCase() === nome.toUpperCase()))
      return notificar(`O setor "${nome}" já existe.`, "erro");
    setSalvando(true);
    const ordem = 50 + setores.length;
    const { error } = await supabase.from("producao_setores").insert({ id, nome, ordem });
    setSalvando(false);
    if (error) return notificar("Não foi possível criar: " + error.message, "erro");
    notificar(`Setor ${nome} criado.`);
    setSetor("");
    recarregar();
  }

  async function alternarSetor(s) {
    const emUso = pessoas.filter((p) => p.ativo && p.setor === s.id).length;
    if (s.ativo !== false && emUso > 0)
      return notificar(`${s.rotulo} tem ${emUso} pessoa(s) ativa(s). Mude o setor delas antes de desativar.`, "erro");
    const { error } = await supabase.from("producao_setores").update({ ativo: s.ativo === false }).eq("id", s.id);
    if (error) return notificar("Não foi possível alterar: " + error.message, "erro");
    notificar(s.ativo === false ? `Setor ${s.rotulo} reativado.` : `Setor ${s.rotulo} desativado.`);
    recarregar();
  }

  const semSalario = funcoes.filter((f) => !(Number(f.salario_bruto) > 0));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-700">Funções e setores</span>
        <span className="text-xs text-slate-500">
          {funcoes.length} funções · {setores.filter((s) => s.ativo !== false).length} setores {aberto ? "▲" : "▼"}
        </span>
      </button>
      {aberto && (
        <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Funções</p>
            <p className="text-xs text-slate-500 mb-2">
              {funcoes.map((f) => f.funcao.charAt(0) + f.funcao.slice(1).toLowerCase()).join(" · ")}
            </p>
            {semSalario.length > 0 && (
              <p className="text-xs text-amber-700 mb-2">
                Sem salário cadastrado (o administrador preenche): {semSalario.map((f) => f.funcao).join(", ")}
              </p>
            )}
            <form onSubmit={criarFuncao} className="flex gap-2">
              <input
                value={funcao}
                onChange={(e) => setFuncao(e.target.value)}
                placeholder="Nova função, ex.: Montador"
                className={ESTILO_INPUT}
              />
              <button
                disabled={salvando}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                + Criar
              </button>
            </form>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Setores</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {setores.map((s) => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                    s.ativo === false ? "border-slate-200 text-slate-400 line-through" : "border-slate-300 text-slate-700"
                  }`}
                >
                  {s.rotulo}
                  {!s.fixo && (
                    <button type="button" onClick={() => alternarSetor(s)} className="text-slate-400 hover:text-slate-800" title={s.ativo === false ? "Reativar" : "Desativar"}>
                      {s.ativo === false ? "↺" : "×"}
                    </button>
                  )}
                </span>
              ))}
            </div>
            <form onSubmit={criarSetor} className="flex gap-2">
              <input
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                placeholder="Novo setor, ex.: Montagem"
                className={ESTILO_INPUT}
              />
              <button
                disabled={salvando}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                + Criar
              </button>
            </form>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Setor novo entra na presença do dia. O prêmio por peça continua só em Concretagem e Armação.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaPessoa({ p, pessoas, funcoes, setores, recarregar, souAdmin }) {
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

  const excluir = () =>
    excluirDeVez({ tabela: "producao_colaboradores", id: p.id, nome: p.nome, oQue: "A pessoa", recarregar });

  return (
    <tr className={`border-t border-slate-100 ${mudou ? "bg-amber-50/60" : ""}`}>
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
        <SelectSetor valor={rascunho.setor} setores={setores} aoMudar={(v) => setRascunho({ ...rascunho, setor: v })} />
      </td>
      {souAdmin && <CustoDetalhado funcao={funcao} />}
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
          <span className="inline-flex items-center gap-3">
            <button
              onClick={alternarAtivo}
              disabled={salvando}
              className={`text-xs underline ${p.ativo ? "text-slate-500 hover:text-slate-900" : "font-medium text-emerald-700 hover:text-emerald-900"}`}
            >
              {p.ativo ? "Desativar" : "Reativar"}
            </button>
            <button onClick={excluir} disabled={salvando} className="text-xs text-rose-500 hover:text-rose-700 underline">
              Excluir
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ Peças

function AbaPecas({ pecas, recarregar }) {
  const [nova, setNova] = useState({ nome: "", comissao: "", valor_concretagem: "" });
  const [salvando, setSalvando] = useState(false);
  const [verInativas, setVerInativas] = useState(false);
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

  const porOrdem = (a, b) => (a.ordem || 0) - (b.ordem || 0);
  const ativas = pecas.filter((p) => p.ativo).sort(porOrdem);
  const inativas = pecas.filter((p) => !p.ativo).sort(porOrdem);
  const cabecalho = (
    <thead>
      <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
        <th className="px-4 py-2.5 font-medium">Peça</th>
        <th className="px-2 py-2.5 font-medium whitespace-nowrap">Prêmio armação (R$)</th>
        <th className="px-2 py-2.5 font-medium whitespace-nowrap">Prêmio concretagem (R$)</th>
        <th className="px-4 py-2.5" />
      </tr>
    </thead>
  );
  const linhas = (lista) =>
    lista.map((p) => (
      <LinhaPeca key={`${p.id}:${p.nome}:${p.comissao}:${p.valor_concretagem}:${p.ativo}`} p={p} pecas={pecas} recarregar={recarregar} />
    ));

  return (
    <div className="space-y-5">
      <Explicacao>
        O prêmio do dia é a <b>soma das peças feitas × o valor de cada peça</b>. Cada peça tem um valor para a{" "}
        <b>armação</b> (quem fez a ferragem) e outro para a <b>concretagem</b>.
        <br />
        <b>Para alterar:</b> mude o nome ou o valor direto no campo e clique em <b>Salvar</b> (ou Desfazer). Peça que
        não se faz mais: <b>Desativar</b> (fica separada, no fim da página, e volta com <b>Reativar</b>). <b>Excluir</b> só
        para peça cadastrada por engano, que nunca entrou em lançamento.
        <br />O valor da armação do <b>pilar sem consolo</b> também entra no Custo real do pilar (Engenharia). Toda
        alteração fica no Histórico de Preços.
      </Explicacao>

      {semConcretagem.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>{semConcretagem.length} peças ainda sem valor de concretagem.</b> Preencha a coluna &quot;Prêmio
          concretagem&quot; para o sistema calcular o prêmio da equipe.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          {cabecalho}
          <tbody>{linhas(ativas)}</tbody>
        </table>
      </div>

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

      {inativas.length > 0 && (
        <button onClick={() => setVerInativas((v) => !v)} className="text-sm text-slate-500 hover:text-slate-800 underline">
          {verInativas ? "Esconder" : "Mostrar"} {inativas.length} {inativas.length === 1 ? "peça desativada" : "peças desativadas"}
        </button>
      )}
      {verInativas && inativas.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <p className="font-medium text-slate-600">Desativadas</p>
            <p className="text-xs text-slate-500">não aparecem no lançamento · use Reativar para voltar</p>
          </div>
          <table className="w-full text-sm">
            {cabecalho}
            <tbody>{linhas(inativas)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinhaPeca({ p, pecas, recarregar }) {
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

  function excluir() {
    if (PECAS_PROTEGIDAS.includes(p.tipo))
      return notificar(`${p.nome} é usada no Custo real do pilar e não pode ser excluída. Você pode alterar os valores.`, "erro");
    excluirDeVez({ tabela: "armacao_comissao", id: p.id, nome: p.nome, oQue: "A peça", recarregar });
  }

  return (
    <tr className={`border-t border-slate-100 ${mudou ? "bg-amber-50/60" : ""}`}>
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
          <span className="inline-flex items-center gap-3">
            <button
              onClick={alternarAtivo}
              disabled={salvando}
              className={`text-xs underline ${p.ativo ? "text-slate-500 hover:text-slate-900" : "font-medium text-emerald-700 hover:text-emerald-900"}`}
            >
              {p.ativo ? "Desativar" : "Reativar"}
            </button>
            <button onClick={excluir} disabled={salvando} className="text-xs text-rose-500 hover:text-rose-700 underline">
              Excluir
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ peças pequenas

// Peças que outras contas do sistema usam pelo código (não podem ser excluídas)
const PECAS_PROTEGIDAS = ["PILAR_SEM_CONSOLO"];

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

function SelectSetor({ valor, setores = SETORES, aoMudar }) {
  const opcoes = setores.filter((s) => s.ativo !== false || s.id === valor);
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={ESTILO_INPUT}>
      {opcoes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.rotulo}
        </option>
      ))}
    </select>
  );
}

// Custo da função separado: salário + encargos = custo do mês (só administrador vê)
function CustoDetalhado({ funcao }) {
  const salario = Number(funcao?.salario_bruto) || 0;
  const pct = Number(funcao?.encargos_pct) || 0;
  if (!funcao || salario <= 0)
    return (
      <td colSpan={3} className="px-2 py-1.5 text-xs text-amber-700 text-right whitespace-nowrap">
        {funcao ? "salário a preencher (Preços → Mão de obra)" : "—"}
      </td>
    );
  return (
    <>
      <td className="px-2 py-1.5 text-right text-slate-600 whitespace-nowrap">{brl(salario)}</td>
      <td className="px-2 py-1.5 text-right text-slate-600 whitespace-nowrap" title={`${pct}% sobre o salário`}>
        {brl(salario * (pct / 100))} <span className="text-[10px] text-slate-400">({pct}%)</span>
      </td>
      <td className="px-2 py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">{brl(custoMensalFuncao(funcao))}</td>
    </>
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
