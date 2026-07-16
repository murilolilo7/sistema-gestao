"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, ArrowUpDown, PackageX, History } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar, LinhasEsqueleto, EstadoVazio, usePaginacao, ControlePaginacao } from "@/components/Ui";

const UNIDADES = ["UN", "M", "M²", "M³", "KG", "PC", "CX", "L"];

const FORM_VAZIO = {
  nome: "",
  unidade: "UN",
  categoria: "",
  preco: "",
  custo: "",
  quantidade_estoque: "",
  estoque_minimo: "",
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
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  const [movProduto, setMovProduto] = useState(null); // produto no modal de movimentação
  const [movTipo, setMovTipo] = useState("entrada");
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [movSalvando, setMovSalvando] = useState(false);
  const [movHistorico, setMovHistorico] = useState([]);

  function buscarProdutosDB() {
    return supabase.from("produtos").select("*").order("codigo", { ascending: false });
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
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(produto) {
    setEditingId(produto.id);
    setEditingCodigo(produto.codigo);
    setErro("");
    setMensagem("");
    setForm({
      nome: produto.nome || "",
      unidade: produto.unidade || "UN",
      categoria: produto.categoria || "",
      preco: produto.preco ?? "",
      custo: produto.custo ?? "",
      quantidade_estoque: produto.quantidade_estoque ?? "",
      estoque_minimo: produto.estoque_minimo ?? "",
    });
    setModo("editar");
  }

  function voltar() {
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setEditingCodigo(null);
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
      estoque_minimo:
        form.estoque_minimo === "" ? 0 : Number(form.estoque_minimo),
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

    notificar(editingId ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setEditingCodigo(null);
    setSalvando(false);
    await carregarProdutos();
  }

  // ---------- Movimentação de estoque ----------
  async function abrirMovimentacao(produto) {
    setMovProduto(produto);
    setMovTipo("entrada");
    setMovQtd("");
    setMovMotivo("");
    setMovHistorico([]);
    const { data } = await supabase
      .from("movimentacoes_estoque")
      .select("*")
      .eq("produto_id", produto.id)
      .order("id", { ascending: false })
      .limit(10);
    setMovHistorico(data || []);
  }

  function fecharMovimentacao() {
    setMovProduto(null);
  }

  async function confirmarMovimentacao() {
    const qtd = Number(movQtd);
    if (!qtd || qtd <= 0) {
      notificar("Informe uma quantidade maior que zero.", "erro");
      return;
    }
    setMovSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuario =
      sessao?.session?.user?.user_metadata?.nome_completo ||
      sessao?.session?.user?.email ||
      null;
    const { error } = await supabase.rpc("movimentar_estoque", {
      produto_id_input: movProduto.id,
      tipo_input: movTipo,
      quantidade_input: qtd,
      motivo_input: movMotivo.trim() || null,
      usuario_input: usuario,
    });
    setMovSalvando(false);
    if (error) {
      notificar(error.message.replace(/^.*?:\s/, ""), "erro");
      return;
    }
    const rotuloTipo =
      movTipo === "entrada" ? "Entrada" : movTipo === "saida" ? "Saída" : "Ajuste";
    notificar(`${rotuloTipo} de ${qtd} registrada em ${movProduto.nome}.`);
    fecharMovimentacao();
    await carregarProdutos();
  }

  async function handleDelete(id) {
    const ok = await confirmar({
      titulo: "Excluir produto?",
      texto: "Essa ação não pode ser desfeita.",
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;

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
  const pag = usePaginacao(produtosFiltrados);
    if (!termo) return true;
    return (
      p.nome?.toLowerCase().includes(termo) ||
      p.categoria?.toLowerCase().includes(termo) ||
      String(p.codigo).includes(termo)
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
            ? `Código #${editingCodigo}`
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
                  value={editingId ? String(editingCodigo) : "gerado automaticamente"}
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
                <label className={labelClasse}>
                  Estoque atual {editingId ? "(use Movimentar p/ alterar)" : ""}
                </label>
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
              <div>
                <label className={labelClasse}>Estoque mínimo (alerta)</label>
                <input
                  name="estoque_minimo"
                  type="number"
                  step="1"
                  min="0"
                  value={form.estoque_minimo}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Quando o estoque atual ficar igual ou abaixo do mínimo, o produto recebe um alerta
              na lista e no painel inicial. Deixe 0 para não alertar.
            </p>
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
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
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
          <LinhasEsqueleto linhas={5} />
        ) : produtos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum produto cadastrado ainda"
            texto='Clique em "Incluir produto" para adicionar o primeiro.'
          />
        ) : produtosFiltrados.length === 0 ? (
          <EstadoVazio titulo="Nenhum produto encontrado" texto="Ajuste a busca acima." />
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
                <th className="px-4 py-2 font-medium">Mínimo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pag.itensPagina.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {p.codigo}
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
                    {(() => {
                      const estoque = p.quantidade_estoque ?? 0;
                      const minimo = p.estoque_minimo ?? 0;
                      const baixo = minimo > 0 && estoque <= minimo;
                      return (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={baixo ? "font-semibold text-red-600" : ""}>
                            {estoque}
                          </span>
                          {baixo && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                              <PackageX size={11} /> baixo
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {p.estoque_minimo ?? 0}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => abrirMovimentacao(p)}
                        className="text-slate-600 hover:text-slate-900"
                        title="Movimentar estoque (entrada/saída)"
                      >
                        <ArrowUpDown size={16} />
                      </button>
                      <button
                        onClick={() => abrirEdicao(p)}
                        className="text-emerald-700 hover:text-emerald-900"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ControlePaginacao {...pag} />
      </div>

      {/* ---------- Modal de movimentação de estoque ---------- */}
      {movProduto && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={fecharMovimentacao} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Movimentar estoque</h3>
                <p className="text-xs text-slate-500">
                  {movProduto.nome} · atual: {movProduto.quantidade_estoque ?? 0}{" "}
                  {movProduto.unidade || ""}
                </p>
              </div>
              <button
                onClick={fecharMovimentacao}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                title="Fechar"
              >
                ×
              </button>
            </div>

            <div className="flex gap-1.5 mb-3 rounded-lg bg-slate-100 p-1 text-sm">
              {[
                { chave: "entrada", rotulo: "Entrada" },
                { chave: "saida", rotulo: "Saída" },
                { chave: "ajuste", rotulo: "Ajuste" },
              ].map((t) => (
                <button
                  key={t.chave}
                  type="button"
                  onClick={() => setMovTipo(t.chave)}
                  className={`flex-1 rounded-md py-1.5 font-medium transition ${
                    movTipo === t.chave ? "bg-white shadow text-slate-900" : "text-slate-500"
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelClasse}>
                  {movTipo === "ajuste" ? "Nova quantidade" : "Quantidade"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={movQtd}
                  onChange={(e) => setMovQtd(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={campoClasse}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-slate-500 pb-2">
                  {movQtd && Number(movQtd) > 0 ? (
                    <>
                      Ficará com{" "}
                      <b className="text-slate-700">
                        {movTipo === "entrada"
                          ? (movProduto.quantidade_estoque ?? 0) + Number(movQtd)
                          : movTipo === "saida"
                            ? (movProduto.quantidade_estoque ?? 0) - Number(movQtd)
                            : Number(movQtd)}
                      </b>{" "}
                      em estoque
                    </>
                  ) : (
                    " "
                  )}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className={labelClasse}>Motivo (opcional)</label>
              <input
                type="text"
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
                className={campoClasse}
                placeholder="Ex: compra, venda avulsa, perda, inventário..."
              />
            </div>

            <div className="flex justify-end gap-2 mb-4">
              <button
                type="button"
                onClick={fecharMovimentacao}
                className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMovimentacao}
                disabled={movSalvando}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
              >
                {movSalvando ? "Registrando..." : "Registrar movimentação"}
              </button>
            </div>

            {movHistorico.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <History size={13} /> Últimas movimentações
                </p>
                <div className="space-y-1">
                  {movHistorico.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 text-xs text-slate-500"
                    >
                      <span>
                        <span
                          className={`font-semibold ${
                            m.tipo === "entrada"
                              ? "text-emerald-600"
                              : m.tipo === "saida"
                                ? "text-red-600"
                                : "text-slate-600"
                          }`}
                        >
                          {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "−" : "="}
                          {m.quantidade}
                        </span>{" "}
                        {m.motivo ? `· ${m.motivo}` : ""}
                      </span>
                      <span className="whitespace-nowrap text-slate-400">
                        {new Date(m.created_at).toLocaleDateString("pt-BR")} · {m.quantidade_anterior}→
                        {m.quantidade_nova}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
