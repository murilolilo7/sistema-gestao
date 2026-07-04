"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

const UNIDADES = ["UN", "M", "M²", "M³", "KG", "PC", "CX", "L"];

const FORM_VAZIO = {
  nome: "",
  unidade: "UN",
  categoria: "",
  preco: "",
  custo: "",
  quantidade_estoque: "",
};

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ProdutosPage() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);

  function buscarProdutosDB() {
    return supabase.from("produtos").select("*").order("id", { ascending: false });
  }

  function aplicarResultado(data, error) {
    if (error) {
      setErro("Não foi possível carregar os produtos: " + error.message);
    } else {
      setProdutos(data);
    }
    setLoading(false);
  }

  async function carregarProdutos() {
    setLoading(true);
    setErro("");
    const { data, error } = await buscarProdutosDB();
    aplicarResultado(data, error);
  }

  // Resultado só é aplicado dentro do .then, fora da fase síncrona do
  // efeito (evita o aviso do React sobre setState síncrono em efeito).
  useEffect(() => {
    let ativo = true;
    buscarProdutosDB().then(({ data, error }) => {
      if (ativo) aplicarResultado(data, error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(produto) {
    setEditingId(produto.id);
    setErro("");
    setMensagem("");
    setForm({
      nome: produto.nome || "",
      unidade: produto.unidade || "UN",
      categoria: produto.categoria || "",
      preco: produto.preco ?? "",
      custo: produto.custo ?? "",
      quantidade_estoque: produto.quantidade_estoque ?? "",
    });
    setModo("editar");
  }

  function voltar() {
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro("O nome do produto é obrigatório.");
      return;
    }
    setSalvando(true);
    setErro("");

    const payload = {
      nome: form.nome.trim(),
      unidade: form.unidade || null,
      categoria: form.categoria.trim() || null,
      preco: form.preco === "" ? 0 : Number(form.preco),
      custo: form.custo === "" ? null : Number(form.custo),
      quantidade_estoque:
        form.quantidade_estoque === "" ? 0 : Number(form.quantidade_estoque),
    };

    const resultado = editingId
      ? await supabase.from("produtos").update(payload).eq("id", editingId)
      : await supabase.from("produtos").insert(payload);

    if (resultado.error) {
      setErro(
        (editingId
          ? "Erro ao atualizar produto: "
          : "Erro ao salvar produto: ") + resultado.error.message
      );
      setSalvando(false);
      return;
    }

    setMensagem(
      editingId ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso."
    );
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setSalvando(false);
    await carregarProdutos();
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este produto?"
    );
    if (!confirmar) return;

    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        setErro(
          "Não é possível excluir: este produto já foi usado em algum orçamento ou venda."
        );
      } else {
        setErro("Erro ao excluir: " + error.message);
      }
    } else {
      await carregarProdutos();
    }
  }

  const produtosFiltrados = produtos.filter((p) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      p.nome?.toLowerCase().includes(termo) ||
      p.categoria?.toLowerCase().includes(termo) ||
      String(p.id).includes(termo)
    );
  });

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClasse = "block text-xs font-medium text-slate-600 mb-1";

  // ---------- TELA DE CADASTRO / EDIÇÃO ----------
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
          {modo === "editar" ? "Editar produto" : "Novo produto"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar"
            ? `Código #${editingId}`
            : "Preencha os dados do produto."}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {erro}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-6"
        >
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              Dados básicos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label className={labelClasse}>Nome</label>
                <input
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Ex: Bloco de concreto 14x19x39"
                />
              </div>
              <div>
                <label className={labelClasse}>Código</label>
                <input
                  type="text"
                  value={editingId ? String(editingId) : "gerado automaticamente"}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                />
              </div>
              <div>
                <label className={labelClasse}>Unidade</label>
                <select
                  name="unidade"
                  value={form.unidade}
                  onChange={handleChange}
                  className={campoClasse}
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className={labelClasse}>Categoria</label>
                <input
                  name="categoria"
                  value={form.categoria}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Ex: Blocos, Pisos, Postes..."
                />
              </div>
              <div>
                <label className={labelClasse}>Preço de venda</label>
                <input
                  name="preco"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.preco}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className={labelClasse}>Custo</label>
                <input
                  name="custo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.custo}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="0,00"
                />
              </div>

              <div>
                <label className={labelClasse}>Estoque atual</label>
                <input
                  name="quantidade_estoque"
                  type="number"
                  step="1"
                  min="0"
                  value={form.quantidade_estoque}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition"
            >
              {salvando ? "Salvando..." : "Salvar produto"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------- TELA DE LISTAGEM ----------
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Produtos</h1>
      <p className="text-slate-500 mb-6">
        Cadastre produtos e controle o estoque disponível.
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
          placeholder="Pesquisar por nome, categoria ou código..."
          className={campoClasse}
        />
        <button
          type="button"
          onClick={abrirNovo}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 whitespace-nowrap transition"
        >
          + Incluir produto
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando produtos...</p>
        ) : produtos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum produto cadastrado ainda. Clique em &quot;Incluir
            produto&quot; para adicionar o primeiro.
          </p>
        ) : produtosFiltrados.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum produto encontrado para essa busca.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Categoria</th>
                <th className="px-4 py-2 font-medium">Un.</th>
                <th className="px-4 py-2 font-medium">Preço</th>
                <th className="px-4 py-2 font-medium">Estoque</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {p.id}
                  </td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {p.nome}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {p.categoria || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {p.unidade || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarMoeda(p.preco)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {p.quantidade_estoque ?? 0}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => abrirEdicao(p)}
                      className="text-emerald-700 hover:text-emerald-900 text-xs font-medium mr-3"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
