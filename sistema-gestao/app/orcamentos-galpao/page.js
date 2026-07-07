"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Printer } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const PAPEIS_EXCLUIDOS = ["POSTE", "CAPITEL"]; // caixa d'água, tratado à parte
const NOMES_ITENS_ESPECIAIS = [
  "TELHAS METÁLICAS",
  "CALHA FIBRA",
  "CAPOTE",
  "MONTAGEM",
  "FUNDAÇÃO",
];

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

function calcularDataFutura(dias) {
  const n = Number(dias);
  if (!n || n <= 0) return "";
  const data = new Date();
  data.setDate(data.getDate() + n);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasAPartirDeHoje(dataISO) {
  if (!dataISO) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataISO + "T00:00:00");
  const diffDias = Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? String(diffDias) : "";
}

function estaVencido(orcamento) {
  if (orcamento.status === "aprovado" || !orcamento.validade) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(orcamento.validade + "T00:00:00") < hoje;
}

function BadgeStatus({ status }) {
  const estilos = {
    pendente: "bg-amber-50 text-amber-700 border-amber-200",
    vencido: "bg-rose-50 text-rose-700 border-rose-200",
    aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const rotulos = { pendente: "Pendente", vencido: "Vencido", aprovado: "Aprovado" };
  const classe = estilos[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}>
      {rotulos[status] || status || "-"}
    </span>
  );
}

export default function OrcamentosGalpaoPage() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [clientes, setClientes] = useState([]);
  const [composicoes, setComposicoes] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [expandidoId, setExpandidoId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState("");

  const [clienteId, setClienteId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [vao, setVao] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [peDireito, setPeDireito] = useState("");
  const [numeroVaos, setNumeroVaos] = useState("");
  const [telhaId, setTelhaId] = useState("");
  const [diasValidade, setDiasValidade] = useState("");
  const [itens, setItens] = useState([]);
  const [composicaoParaAdicionar, setComposicaoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("1");
  const [desconto, setDesconto] = useState("");
  const [margemComercial, setMargemComercial] = useState("");
  const [observacao, setObservacao] = useState("");

  const [vigaLargura, setVigaLargura] = useState("");
  const [vigaAltura, setVigaAltura] = useState("");
  const [vigaVao, setVigaVao] = useState("");
  const [vigaValorM3, setVigaValorM3] = useState("");

  const proximaChave = useRef(1);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nome =
        data.session?.user?.user_metadata?.nome_completo ||
        data.session?.user?.email ||
        "";
      setNomeUsuario(nome);
    });
  }, []);

  function buscarClientes() {
    return supabase.from("clientes").select("id, nome").order("nome");
  }
  function buscarComposicoes() {
    return supabase
      .from("composicoes_galpao")
      .select("id, codigo, nome, unidade, preco, papel")
      .order("nome");
  }
  function buscarModelos() {
    return supabase.from("modelos_galpao").select("id, nome, tipo").order("id");
  }
  function buscarOrcamentosGalpao() {
    return supabase
      .from("orcamentos_galpao")
      .select(
        "*, clientes(nome), modelos_galpao(nome, tipo), itens_orcamento_galpao(id, composicao_id, descricao_livre, unidade_livre, quantidade, preco_unitario, composicoes_galpao(nome, unidade))"
      )
      .order("codigo", { ascending: false });
  }

  function aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos) {
    const erroEncontrado =
      resClientes.error || resComposicoes.error || resModelos.error || resOrcamentos.error;
    if (erroEncontrado) {
      setErro("Não foi possível carregar os dados: " + erroEncontrado.message);
    } else {
      setClientes(resClientes.data);
      setComposicoes(resComposicoes.data);
      setModelos(resModelos.data);
      setOrcamentos(resOrcamentos.data);
    }
    setLoading(false);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    const [resClientes, resComposicoes, resModelos, resOrcamentos] = await Promise.all([
      buscarClientes(),
      buscarComposicoes(),
      buscarModelos(),
      buscarOrcamentosGalpao(),
    ]);
    aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos);
  }

  useEffect(() => {
    let ativo = true;
    Promise.all([buscarClientes(), buscarComposicoes(), buscarModelos(), buscarOrcamentosGalpao()]).then(
      ([resClientes, resComposicoes, resModelos, resOrcamentos]) => {
        if (ativo) aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos);
      }
    );
    return () => {
      ativo = false;
    };
  }, []);

  const modeloSelecionado = modelos.find((m) => String(m.id) === String(modeloId));
  const tipoSelecionado = modeloSelecionado?.tipo || "";
  const areaCalculada = vao && comprimento ? Number(vao) * Number(comprimento) : null;

  const composicoesSelecionaveis = composicoes.filter((c) => {
    if (PAPEIS_EXCLUIDOS.includes(c.papel)) return false;
    if (NOMES_ITENS_ESPECIAIS.includes(c.nome)) return false;
    if (c.papel === "LAJE" && tipoSelecionado === "simples") return false;
    return true;
  });
  const composicoesPorPapel = composicoesSelecionaveis.reduce((acc, c) => {
    const grupo = c.papel || "Outras peças";
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(c);
    return acc;
  }, {});
  const telhasDisponiveis = composicoes.filter((c) => c.nome.toLowerCase().includes("telha"));

  function buscarComposicao(nome) {
    return composicoes.find((c) => c.nome === nome);
  }

  function itensObrigatoriosBase() {
    const lista = [];
    const montagem = buscarComposicao("MONTAGEM");
    const fundacao = buscarComposicao("FUNDAÇÃO");
    if (montagem) {
      lista.push({
        chave: proximaChave.current++,
        composicao_id: montagem.id,
        nome: montagem.nome,
        unidade: montagem.unidade,
        quantidade: 1,
        preco_unitario: Number(montagem.preco) || 0,
        obrigatorio: true,
      });
    }
    if (fundacao) {
      lista.push({
        chave: proximaChave.current++,
        composicao_id: fundacao.id,
        nome: fundacao.nome,
        unidade: fundacao.unidade,
        quantidade: 1,
        preco_unitario: Number(fundacao.preco) || 0,
        obrigatorio: true,
      });
    }
    return lista;
  }

  function adicionarItem() {
    if (!composicaoParaAdicionar) return;
    const composicao = composicoes.find(
      (c) => String(c.id) === String(composicaoParaAdicionar)
    );
    if (!composicao) return;
    const quantidade = Math.max(1, Number(quantidadeParaAdicionar) || 1);
    setItens((atual) => [
      ...atual,
      {
        chave: proximaChave.current++,
        composicao_id: composicao.id,
        nome: composicao.nome,
        unidade: composicao.unidade,
        quantidade,
        preco_unitario: Number(composicao.preco) || 0,
      },
    ]);
    setComposicaoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
  }

  function calcularItensAutomaticos() {
    if (!vao || !comprimento) {
      setErro("Preencha largura e comprimento para calcular telha/calha/capote.");
      return;
    }
    const area = Number(vao) * Number(comprimento);
    const novos = [];

    const telha = telhaId ? composicoes.find((c) => String(c.id) === String(telhaId)) : null;
    if (telha) {
      novos.push({
        chave: proximaChave.current++,
        composicao_id: telha.id,
        nome: telha.nome,
        unidade: telha.unidade,
        quantidade: Math.round(area * 1.1 * 100) / 100,
        preco_unitario: Number(telha.preco) || 0,
        automatico: true,
      });
    }

    const calha = buscarComposicao("CALHA FIBRA");
    if (calha && numeroVaos) {
      const qtd = (Number(vao) + 0.5) * Number(numeroVaos) * 2;
      novos.push({
        chave: proximaChave.current++,
        composicao_id: calha.id,
        nome: calha.nome,
        unidade: calha.unidade,
        quantidade: Math.round(qtd * 100) / 100,
        preco_unitario: Number(calha.preco) || 0,
        automatico: true,
      });
    }

    const capote = buscarComposicao("CAPOTE");
    if (capote) {
      const qtd = Number(comprimento) + 2;
      novos.push({
        chave: proximaChave.current++,
        composicao_id: capote.id,
        nome: capote.nome,
        unidade: capote.unidade,
        quantidade: qtd,
        preco_unitario: Number(capote.preco) || 0,
        automatico: true,
      });
    }

    setItens((atual) => [...atual.filter((i) => !i.automatico), ...novos]);
    setErro("");
    setMensagem("Telha, calha e capote calculados a partir das medidas.");
  }

  function adicionarVigaLaje() {
    const l = Number(vigaLargura) || 0;
    const a = Number(vigaAltura) || 0;
    const v = Number(vigaVao) || 0;
    const valorM3 = Number(vigaValorM3) || 0;
    if (l <= 0 || a <= 0 || v <= 0 || valorM3 <= 0) {
      setErro("Preencha largura, altura, vão e valor do m³ para adicionar a viga para laje.");
      return;
    }
    const volume = Math.round(l * a * v * 10000) / 10000;
    setItens((atual) => [
      ...atual,
      {
        chave: proximaChave.current++,
        composicao_id: null,
        nome: `Viga para laje ${l.toFixed(2)}x${a.toFixed(2)}x${v.toFixed(2)}m`,
        unidade: "M3",
        quantidade: volume,
        preco_unitario: valorM3,
      },
    ]);
    setVigaLargura("");
    setVigaAltura("");
    setVigaVao("");
    setVigaValorM3("");
    setErro("");
  }

  function removerItem(chave) {
    setItens((atual) => atual.filter((i) => i.chave !== chave));
  }

  function atualizarItem(chave, campo, valor) {
    setItens((atual) =>
      atual.map((i) =>
        i.chave === chave ? { ...i, [campo]: Math.max(0, Number(valor) || 0) } : i
      )
    );
  }

  const subtotal = itens.reduce((soma, i) => soma + i.quantidade * i.preco_unitario, 0);
  const margemNumerica = Math.max(0, Number(margemComercial) || 0);
  const totalComMargem = subtotal * (1 + margemNumerica / 100);
  const descontoNumerico = Math.min(Math.max(0, Number(desconto) || 0), totalComMargem);
  const totalFinal = totalComMargem - descontoNumerico;
  const valorPorM2 =
    areaCalculada && areaCalculada > 0 ? totalFinal / areaCalculada : null;

  function limparFormulario() {
    setClienteId("");
    setModeloId("");
    setVao("");
    setComprimento("");
    setPeDireito("");
    setNumeroVaos("");
    setTelhaId("");
    setDiasValidade("");
    setItens([]);
    setComposicaoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setDesconto("");
    setMargemComercial("");
    setObservacao("");
    setVigaLargura("");
    setVigaAltura("");
    setVigaVao("");
    setVigaValorM3("");
  }

  function abrirNovo() {
    limparFormulario();
    setEditingId(null);
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setItens(itensObrigatoriosBase());
    setModo("novo");
  }

  function abrirEdicao(orcamento) {
    setEditingId(orcamento.id);
    setEditingCodigo(orcamento.codigo);
    setClienteId(String(orcamento.cliente_id || ""));
    setModeloId(orcamento.modelo_id ? String(orcamento.modelo_id) : "");
    setVao(orcamento.vao ? String(orcamento.vao) : "");
    setComprimento(orcamento.comprimento ? String(orcamento.comprimento) : "");
    setPeDireito(orcamento.pe_direito ? String(orcamento.pe_direito) : "");
    setNumeroVaos(orcamento.numero_vaos ? String(orcamento.numero_vaos) : "");
    setDiasValidade(diasAPartirDeHoje(orcamento.validade));
    setDesconto(orcamento.desconto ? String(orcamento.desconto) : "");
    setMargemComercial(
      orcamento.margem_comercial_pct ? String(orcamento.margem_comercial_pct) : ""
    );
    setObservacao(orcamento.observacao || "");
    const itensCarregados = (orcamento.itens_orcamento_galpao || []).map((item) => ({
      chave: proximaChave.current++,
      composicao_id: item.composicao_id,
      nome: item.composicoes_galpao?.nome || item.descricao_livre || "Item removido",
      unidade: item.composicoes_galpao?.unidade || item.unidade_livre,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco_unitario),
      obrigatorio: ["MONTAGEM", "FUNDAÇÃO"].includes(item.composicoes_galpao?.nome),
    }));
    setItens(itensCarregados);
    setErro("");
    setMensagem("");
    setModo("editar");
  }

  function voltar() {
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }
    if (!modeloId) {
      setErro("Selecione o tipo de galpão.");
      return;
    }
    const itensValidos = itens.filter((i) => i.quantidade > 0);
    if (itensValidos.length === 0) {
      setErro("Adicione ao menos uma peça com quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    setMensagem("");

    const itensPayload = itensValidos.map((i) => ({
      composicao_id: i.composicao_id || null,
      descricao_livre: i.composicao_id ? null : i.nome,
      unidade_livre: i.composicao_id ? null : i.unidade,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }));
    const validadeCalculada = calcularDataFutura(diasValidade) || null;

    const { error } = editingId
      ? await supabase.rpc("atualizar_orcamento_galpao", {
          orcamento_id_input: editingId,
          cliente_id_input: Number(clienteId),
          modelo_id_input: Number(modeloId),
          vao_input: vao ? Number(vao) : null,
          comprimento_input: comprimento ? Number(comprimento) : null,
          pe_direito_input: peDireito ? Number(peDireito) : null,
          numero_vaos_input: numeroVaos ? Number(numeroVaos) : null,
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          margem_comercial_pct_input: margemNumerica,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
        })
      : await supabase.rpc("criar_orcamento_galpao", {
          cliente_id_input: Number(clienteId),
          modelo_id_input: Number(modeloId),
          vao_input: vao ? Number(vao) : null,
          comprimento_input: comprimento ? Number(comprimento) : null,
          pe_direito_input: peDireito ? Number(peDireito) : null,
          numero_vaos_input: numeroVaos ? Number(numeroVaos) : null,
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          margem_comercial_pct_input: margemNumerica,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
        });

    if (error) {
      setErro(
        (editingId ? "Erro ao atualizar orçamento: " : "Erro ao salvar orçamento: ") +
          error.message
      );
      setSalvando(false);
      return;
    }

    setMensagem(
      editingId ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso."
    );
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setSalvando(false);
    await carregarTudo();
  }

  const orcamentosFiltrados = orcamentos.filter((o) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      o.clientes?.nome?.toLowerCase().includes(termo) ||
      o.titulo?.toLowerCase().includes(termo) ||
      String(o.codigo).includes(termo)
    );
  });

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClasse = "block text-xs font-medium text-slate-600 mb-1";

  // ---------- TELA DE INCLUSÃO / EDIÇÃO ----------
  if (modo === "novo" || modo === "editar") {
    return (
      <div>
        <button
          type="button"
          onClick={voltar}
          className="mb-4 text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold mb-1">
          {modo === "editar" ? "Editar orçamento de galpão" : "Novo orçamento de galpão"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar" ? `Código #${editingCodigo}` : "Escolha o tipo, informe as medidas e monte o levantamento."}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {erro}
          </div>
        )}
        {mensagem && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">
            {mensagem}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClasse}>Cliente</label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className={campoClasse}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClasse}>Tipo de galpão</label>
              <select
                value={modeloId}
                onChange={(e) => setModeloId(e.target.value)}
                className={campoClasse}
              >
                <option value="">Selecione o tipo</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {modeloId && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <label className={labelClasse}>Largura / vão (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={vao}
                  onChange={(e) => setVao(e.target.value)}
                  placeholder="Ex: 10"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Comprimento (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={comprimento}
                  onChange={(e) => setComprimento(e.target.value)}
                  placeholder="Ex: 20"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Pé direito (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={peDireito}
                  onChange={(e) => setPeDireito(e.target.value)}
                  placeholder="Ex: 7,5"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Nº de vãos (tesouras)</label>
                <input
                  type="number"
                  min="0"
                  value={numeroVaos}
                  onChange={(e) => setNumeroVaos(e.target.value)}
                  placeholder="Ex: 4"
                  className={campoClasse}
                />
              </div>
              {areaCalculada && (
                <p className="text-xs text-slate-500 sm:col-span-4">
                  Área coberta calculada: <strong>{areaCalculada.toLocaleString("pt-BR")} m²</strong>
                </p>
              )}
            </div>
          )}

          {modeloId && (
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 mb-4">
              <p className="text-xs font-medium text-slate-600 mb-2">
                Calcular telha, calha e capote a partir das medidas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={telhaId}
                  onChange={(e) => setTelhaId(e.target.value)}
                  className={campoClasse}
                >
                  <option value="">Selecione o tipo de telha</option>
                  {telhasDisponiveis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} — {formatarMoeda(t.preco)}/m²
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={calcularItensAutomaticos}
                  className="rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 transition sm:col-span-2"
                >
                  Calcular telha (área x 1,10) + calha + capote
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-medium text-slate-600 mb-2">Adicionar peça</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
              <div className="sm:col-span-2">
                <select
                  value={composicaoParaAdicionar}
                  onChange={(e) => setComposicaoParaAdicionar(e.target.value)}
                  className={campoClasse}
                >
                  <option value="">Selecione uma peça</option>
                  {Object.entries(composicoesPorPapel).map(([papel, lista]) => (
                    <optgroup key={papel} label={papel}>
                      {lista.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {formatarMoeda(c.preco)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <input
                type="number"
                min="1"
                value={quantidadeParaAdicionar}
                onChange={(e) => setQuantidadeParaAdicionar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarItem();
                  }
                }}
                placeholder="Qtd."
                className={campoClasse}
              />
              <button
                type="button"
                onClick={adicionarItem}
                disabled={!composicaoParaAdicionar}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
              >
                Adicionar peça
              </button>
            </div>

            {(tipoSelecionado === "laje" || tipoSelecionado === "mezanino") && (
              <div className="rounded-lg border border-slate-300 bg-white p-3 mb-3">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Calculadora: Viga para laje (volume × valor do m³)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Largura (m)"
                    value={vigaLargura}
                    onChange={(e) => setVigaLargura(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Altura (m)"
                    value={vigaAltura}
                    onChange={(e) => setVigaAltura(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Vão (m)"
                    value={vigaVao}
                    onChange={(e) => setVigaVao(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor do m³"
                    value={vigaValorM3}
                    onChange={(e) => setVigaValorM3(e.target.value)}
                    className={campoClasse}
                  />
                  <button
                    type="button"
                    onClick={adicionarVigaLaje}
                    className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    Adicionar viga
                  </button>
                </div>
                {vigaLargura && vigaAltura && vigaVao && (
                  <p className="text-xs text-slate-500 mt-1">
                    Volume: {(Number(vigaLargura) * Number(vigaAltura) * Number(vigaVao)).toFixed(3)} m³
                  </p>
                )}
              </div>
            )}

            {itens.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma peça adicionada ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1 font-medium">Peça</th>
                    <th className="py-1 font-medium w-16">Un.</th>
                    <th className="py-1 font-medium w-24">Qtd.</th>
                    <th className="py-1 font-medium w-28">Valor unit.</th>
                    <th className="py-1 font-medium text-right">Total</th>
                    <th className="py-1 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.chave} className="border-t border-slate-200">
                      <td className="py-1.5 pr-2">
                        {i.nome}
                        {i.obrigatorio && (
                          <span className="ml-1 text-xs text-slate-400">(obrigatório)</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-500">{i.unidade || "-"}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={i.quantidade}
                          onChange={(e) =>
                            atualizarItem(i.chave, "quantidade", e.target.value)
                          }
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={i.preco_unitario}
                          onChange={(e) =>
                            atualizarItem(i.chave, "preco_unitario", e.target.value)
                          }
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatarMoeda(i.quantidade * i.preco_unitario)}
                      </td>
                      <td className="py-1.5 text-right">
                        {!i.obrigatorio && (
                          <button
                            type="button"
                            onClick={() => removerItem(i.chave)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div>
              <label className={labelClasse}>Validade da proposta (dias)</label>
              <input
                type="number"
                min="1"
                value={diasValidade}
                onChange={(e) => setDiasValidade(e.target.value)}
                placeholder="Ex: 10"
                className={campoClasse}
              />
              {diasValidade && Number(diasValidade) > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Válido até {formatarDataSimples(calcularDataFutura(diasValidade))}
                </p>
              )}
            </div>
            <div>
              <label className={labelClasse}>Desconto (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                className={campoClasse}
              />
            </div>
            <div>
              <label className={labelClasse}>Margem comercial (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={margemComercial}
                onChange={(e) => setMargemComercial(e.target.value)}
                placeholder="Ex: 25"
                className={campoClasse}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className={labelClasse}>Observações</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Frete CIF, forma de pagamento..."
              className={campoClasse}
            />
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm space-y-0.5">
              <p className="text-slate-500">Subtotal (peças): {formatarMoeda(subtotal)}</p>
              {margemNumerica > 0 && (
                <p className="text-slate-500">
                  Com margem comercial ({margemNumerica}%): {formatarMoeda(totalComMargem)}
                </p>
              )}
              {descontoNumerico > 0 && (
                <p className="text-slate-500">Desconto: − {formatarMoeda(descontoNumerico)}</p>
              )}
              <p>
                <span className="text-slate-500">Total do orçamento: </span>
                <span className="font-semibold text-lg">{formatarMoeda(totalFinal)}</span>
              </p>
              {valorPorM2 !== null && (
                <p className="text-xs text-slate-400">
                  Valor por m²: {formatarMoeda(valorPorM2)}
                </p>
              )}
              <p className="text-xs text-slate-400">Vendedor: {nomeUsuario}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={voltar}
                className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 transition"
              >
                {salvando
                  ? "Salvando..."
                  : modo === "editar"
                    ? "Salvar alterações"
                    : "Salvar orçamento"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ---------- TELA DE LISTAGEM ----------
  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Orçamentos de Galpão</h1>
      <p className="text-slate-500 mb-6">
        Levantamentos de peças pré-moldadas para propostas de galpão.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">
          {mensagem}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          placeholder="Pesquisar por cliente, título ou código..."
          className={campoClasse}
        />
        <button
          type="button"
          onClick={abrirNovo}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 whitespace-nowrap transition"
        >
          + Incluir orçamento
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando orçamentos...</p>
        ) : orcamentos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum orçamento de galpão criado ainda. Clique em &quot;Incluir
            orçamento&quot; para montar o primeiro.
          </p>
        ) : orcamentosFiltrados.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nenhum orçamento encontrado para essa busca.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 font-medium">Válido até</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            {orcamentosFiltrados.map((o) => (
              <tbody key={o.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">{o.codigo}</td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {o.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate" title={o.titulo}>
                    {o.titulo || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataSimples(o.validade)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(o.total)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <BadgeStatus status={estaVencido(o) ? "vencido" : o.status} />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setExpandidoId(expandidoId === o.id ? null : o.id)}
                        className="text-slate-600 hover:text-slate-900"
                        title={expandidoId === o.id ? "Ocultar itens" : "Ver itens"}
                      >
                        {expandidoId === o.id ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <Link
                        href={`/orcamentos-galpao/imprimir?codigo=${o.codigo}`}
                        target="_blank"
                        className="text-slate-600 hover:text-slate-900"
                        title="Imprimir"
                      >
                        <Printer size={16} />
                      </Link>
                      {o.status !== "aprovado" && (
                        <button
                          onClick={() => abrirEdicao(o)}
                          className="text-emerald-700 hover:text-emerald-900"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandidoId === o.id && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        {o.modelos_galpao?.nome || "Peças"}
                        {o.area_m2 ? ` — ${o.area_m2} m²` : ""}
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {(o.itens_orcamento_galpao || []).map((item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.composicoes_galpao?.nome ?? item.descricao_livre ?? "peça removida"} —{" "}
                            {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(item.quantidade * item.preco_unitario)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </div>
  );
}
