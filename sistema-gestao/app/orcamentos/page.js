"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Printer, ShoppingCart, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleDateString("pt-BR");
}

// "validade" é um date puro (sem hora). Acrescentar T00:00:00 evita que o
// fuso horário local jogue a data exibida um dia para trás.
function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

// Calcula a data (YYYY-MM-DD) daqui a N dias, a partir de hoje.
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

// Caminho inverso: quantos dias faltam, a partir de hoje, para uma data
// já salva (usado ao abrir um orçamento existente para edição).
function diasAPartirDeHoje(dataISO) {
  if (!dataISO) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataISO + "T00:00:00");
  const diffDias = Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? String(diffDias) : "";
}

// Um orçamento pendente cuja validade já passou continua existindo e
// pode ser editado ou convertido normalmente — nada é apagado. Isso só
// controla o que aparece no badge de status, pra avisar visualmente.
function estaVencido(orcamento) {
  if (orcamento.status === "aprovado" || !orcamento.validade) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(orcamento.validade + "T00:00:00");
  return validade < hoje;
}

function BadgeStatus({ status }) {
  const estilos = {
    pendente: "bg-amber-50 text-amber-700 border-amber-200",
    vencido: "bg-rose-50 text-rose-700 border-rose-200",
    aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const rotulos = {
    pendente: "Pendente",
    vencido: "Vencido",
    aprovado: "Aprovado",
  };
  const classe =
    estilos[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}
    >
      {rotulos[status] || status || "-"}
    </span>
  );
}

export default function OrcamentosPage() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [convertendoId, setConvertendoId] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState("");

  const [clienteId, setClienteId] = useState("");
  const [diasValidade, setDiasValidade] = useState("");
  const [itens, setItens] = useState([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("1");
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");

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
  function buscarProdutos() {
    return supabase
      .from("produtos")
      .select("id, nome, unidade, preco, quantidade_estoque")
      .order("nome");
  }
  function buscarOrcamentos() {
    return supabase
      .from("orcamentos")
      .select(
        "*, clientes(nome), itens_orcamento(id, produto_id, quantidade, preco_unitario, produtos(nome))"
      )
      .order("codigo", { ascending: false });
  }

  function aplicarResultados(resClientes, resProdutos, resOrcamentos) {
    const erroEncontrado =
      resClientes.error || resProdutos.error || resOrcamentos.error;
    if (erroEncontrado) {
      setErro(
        "Não foi possível carregar os dados: " + erroEncontrado.message
      );
    } else {
      setClientes(resClientes.data);
      setProdutos(resProdutos.data);
      setOrcamentos(resOrcamentos.data);
    }
    setLoading(false);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    const [resClientes, resProdutos, resOrcamentos] = await Promise.all([
      buscarClientes(),
      buscarProdutos(),
      buscarOrcamentos(),
    ]);
    aplicarResultados(resClientes, resProdutos, resOrcamentos);
  }

  // Só aplica os resultados dentro do .then (fora da fase síncrona do
  // efeito), evitando o aviso do React sobre setState síncrono em efeito.
  useEffect(() => {
    let ativo = true;
    Promise.all([buscarClientes(), buscarProdutos(), buscarOrcamentos()]).then(
      ([resClientes, resProdutos, resOrcamentos]) => {
        if (ativo) aplicarResultados(resClientes, resProdutos, resOrcamentos);
      }
    );
    return () => {
      ativo = false;
    };
  }, []);

  function adicionarItem() {
    if (!produtoParaAdicionar) return;
    const produto = produtos.find(
      (p) => String(p.id) === String(produtoParaAdicionar)
    );
    if (!produto) return;
    const quantidade = Math.max(1, Number(quantidadeParaAdicionar) || 1);

    setItens((atual) => {
      const existe = atual.find((i) => i.produto_id === produto.id);
      if (existe) {
        return atual.map((i) =>
          i.produto_id === produto.id
            ? { ...i, quantidade: i.quantidade + quantidade }
            : i
        );
      }
      return [
        ...atual,
        {
          produto_id: produto.id,
          nome: produto.nome,
          unidade: produto.unidade,
          quantidade,
          preco_unitario: produto.preco ?? 0,
        },
      ];
    });
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
  }

  function removerItem(produtoId) {
    setItens((atual) => atual.filter((i) => i.produto_id !== produtoId));
  }

  function atualizarItem(produtoId, campo, valor) {
    setItens((atual) =>
      atual.map((i) =>
        i.produto_id === produtoId
          ? { ...i, [campo]: Math.max(0, Number(valor) || 0) }
          : i
      )
    );
  }

  function estoqueDoProduto(produtoId) {
    return produtos.find((p) => p.id === produtoId)?.quantidade_estoque ?? 0;
  }

  const subtotalOrcamento = itens.reduce(
    (soma, i) => soma + i.quantidade * i.preco_unitario,
    0
  );
  const descontoNumerico = Math.min(
    Math.max(0, Number(desconto) || 0),
    subtotalOrcamento
  );
  const totalComDesconto = subtotalOrcamento - descontoNumerico;

  function limparFormulario() {
    setClienteId("");
    setDiasValidade("");
    setItens([]);
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setDesconto("");
    setObservacao("");
  }

  function abrirNovo() {
    limparFormulario();
    setEditingId(null);
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(orcamento) {
    setEditingId(orcamento.id);
    setEditingCodigo(orcamento.codigo);
    setClienteId(String(orcamento.cliente_id));
    setDiasValidade(diasAPartirDeHoje(orcamento.validade));
    setDesconto(orcamento.desconto ? String(orcamento.desconto) : "");
    setObservacao(orcamento.observacao || "");
    setItens(
      (orcamento.itens_orcamento || []).map((item) => ({
        produto_id: item.produto_id,
        nome: item.produtos?.nome || "Produto removido",
        quantidade: item.quantidade,
        preco_unitario: Number(item.preco_unitario),
      }))
    );
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
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
    const itensValidos = itens.filter((i) => i.quantidade > 0);
    if (itensValidos.length === 0) {
      setErro("Adicione ao menos um produto com quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    setMensagem("");

    const itensPayload = itensValidos.map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }));
    const validadeCalculada = calcularDataFutura(diasValidade) || null;

    const { error } = editingId
      ? await supabase.rpc("atualizar_orcamento", {
          orcamento_id_input: editingId,
          cliente_id_input: Number(clienteId),
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
        })
      : await supabase.rpc("criar_orcamento", {
          cliente_id_input: Number(clienteId),
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
        });

    if (error) {
      setErro(
        (editingId
          ? "Erro ao atualizar orçamento: "
          : "Erro ao salvar orçamento: ") + error.message
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

  async function handleConverter(orcamentoId) {
    const confirmar = window.confirm(
      "Converter este orçamento em venda? O estoque dos produtos será baixado e essa ação não pode ser desfeita."
    );
    if (!confirmar) return;

    setConvertendoId(orcamentoId);
    setErro("");
    setMensagem("");

    const { error } = await supabase.rpc("converter_orcamento_em_venda", {
      orcamento_id_input: orcamentoId,
    });

    if (error) {
      setErro("Não foi possível converter em venda: " + error.message);
    } else {
      setMensagem(
        "Orçamento convertido em venda com sucesso! Confira em Vendas."
      );
      await carregarTudo();
    }
    setConvertendoId(null);
  }

  const orcamentosFiltrados = orcamentos.filter((o) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      o.clientes?.nome?.toLowerCase().includes(termo) ||
      String(o.codigo).includes(termo) ||
      o.status?.toLowerCase().includes(termo)
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
          {modo === "editar" ? "Editar orçamento" : "Novo orçamento"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar"
            ? `Código #${editingCodigo}`
            : "Monte a proposta com cliente, produtos e quantidades."}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {erro}
          </div>
        )}
        {!loading && clientes.length === 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-sm">
            Nenhum cliente cadastrado ainda.{" "}
            <Link href="/clientes" className="underline font-medium">
              Cadastre um cliente
            </Link>{" "}
            antes de criar um orçamento.
          </div>
        )}
        {!loading && produtos.length === 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-sm">
            Nenhum produto cadastrado ainda.{" "}
            <Link href="/produtos" className="underline font-medium">
              Cadastre um produto
            </Link>{" "}
            antes de criar um orçamento.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="sm:col-span-2">
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
          </div>

          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Adicionar produtos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
              <div className="sm:col-span-2">
                <select
                  value={produtoParaAdicionar}
                  onChange={(e) => setProdutoParaAdicionar(e.target.value)}
                  className={campoClasse}
                >
                  <option value="">Selecione um produto</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} {p.unidade ? `(${p.unidade})` : ""} — estoque:{" "}
                      {p.quantidade_estoque ?? 0}
                    </option>
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
                disabled={!produtoParaAdicionar}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
              >
                Adicionar item
              </button>
            </div>

            {itens.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nenhum produto adicionado ainda.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1 font-medium">Produto</th>
                    <th className="py-1 font-medium w-24">Qtd.</th>
                    <th className="py-1 font-medium w-28">Preço unit.</th>
                    <th className="py-1 font-medium text-right">Subtotal</th>
                    <th className="py-1 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.produto_id} className="border-t border-slate-200">
                      <td className="py-1.5 pr-2">
                        {i.nome}
                        {i.quantidade > estoqueDoProduto(i.produto_id) && (
                          <span className="block text-amber-600 text-xs">
                            acima do estoque atual (
                            {estoqueDoProduto(i.produto_id)})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          value={i.quantidade}
                          onChange={(e) =>
                            atualizarItem(
                              i.produto_id,
                              "quantidade",
                              e.target.value
                            )
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
                            atualizarItem(
                              i.produto_id,
                              "preco_unitario",
                              e.target.value
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatarMoeda(i.quantidade * i.preco_unitario)}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removerItem(i.produto_id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
              <label className={labelClasse}>Observações</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Frete CIF, forma de pagamento..."
                className={campoClasse}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm space-y-0.5">
              <p className="text-slate-500">
                Subtotal: {formatarMoeda(subtotalOrcamento)}
              </p>
              {descontoNumerico > 0 && (
                <p className="text-slate-500">
                  Desconto: − {formatarMoeda(descontoNumerico)}
                </p>
              )}
              <p>
                <span className="text-slate-500">Total do orçamento: </span>
                <span className="font-semibold text-lg">
                  {formatarMoeda(totalComDesconto)}
                </span>
              </p>
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
      <h1 className="text-2xl font-bold mb-1">Orçamentos</h1>
      <p className="text-slate-500 mb-6">
        Monte propostas para clientes e converta em venda quando aprovadas.
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
          placeholder="Pesquisar por cliente, código ou status..."
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
            Nenhum orçamento criado ainda. Clique em &quot;Incluir
            orçamento&quot; para montar o primeiro.
          </p>
        ) : orcamentosFiltrados.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum orçamento encontrado para essa busca.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Criado em</th>
                <th className="px-4 py-2 font-medium">Válido até</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            {orcamentosFiltrados.map((o) => (
              <tbody key={o.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {o.codigo}
                  </td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {o.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataHora(o.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataSimples(o.validade)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(o.total)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <BadgeStatus
                      status={estaVencido(o) ? "vencido" : o.status}
                    />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() =>
                          setExpandidoId(expandidoId === o.id ? null : o.id)
                        }
                        className="text-slate-600 hover:text-slate-900"
                        title={expandidoId === o.id ? "Ocultar itens" : "Ver itens"}
                      >
                        {expandidoId === o.id ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      <Link
                        href={`/orcamentos/imprimir?codigo=${o.codigo}`}
                        target="_blank"
                        className="text-slate-600 hover:text-slate-900"
                        title="Imprimir"
                      >
                        <Printer size={16} />
                      </Link>
                      {o.status !== "aprovado" && !estaVencido(o) && (
                        <>
                          <button
                            onClick={() => abrirEdicao(o)}
                            className="text-emerald-700 hover:text-emerald-900"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleConverter(o.id)}
                            disabled={convertendoId === o.id}
                            className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                            title="Converter em venda"
                          >
                            {convertendoId === o.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <ShoppingCart size={16} />
                            )}
                          </button>
                        </>
                      )}
                      {o.status !== "aprovado" && estaVencido(o) && (
                        <span className="text-xs text-slate-400" title="Vencido — crie um novo orçamento">
                          Vencido
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {expandidoId === o.id && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Itens do orçamento
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {(o.itens_orcamento || []).map((item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.produtos?.nome ?? "produto removido"} —{" "}
                            {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(
                              item.quantidade * item.preco_unitario
                            )}
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
