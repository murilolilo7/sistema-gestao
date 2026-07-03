"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    preco: "",
    custo: "",
    quantidade_estoque: "",
  });

  async function carregarProdutos() {
    setLoading(true);
    setErro("");
    const resultado = await supabase.from("produtos").select("*").order("id", { ascending: false });
    if (resultado.error) {
      setErro("Nao foi possivel carregar os produtos: " + resultado.error.message);
    } else {
      setProdutos(resultado.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro("O nome do produto e obrigatorio.");
      return;
    }
    setSalvando(true);
    setErro("");

    const resultado = await supabase.from("produtos").insert({
      nome: form.nome,
      preco: form.preco ? Number(form.preco) : null,
      custo: form.custo ? Number(form.custo) : null,
      quantidade_estoque: form.quantidade_estoque ? Number(form.quantidade_estoque) : 0,
    });

    if (resultado.error) {
      setErro("Erro ao salvar produto: " + resultado.error.message);
    } else {
      setForm({ nome: "", preco: "", custo: "", quantidade_estoque: "" });
      await carregarProdutos();
    }
    setSalvando(false);
  }

  async function handleDelete(id) {
    const confirmar = window.confirm("Tem certeza que deseja excluir este produto?");
    if (!confirmar) return;

    const resultado = await supabase.from("produtos").delete().eq("id", id);
    if (resultado.error) {
      setErro("Erro ao excluir: " + resultado.error.message);
    } else {
      await carregarProdutos();
    }
  }

  function formatarMoeda(valor) {
    if (valor === null || valor === undefined) return "-";
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const classeCampo =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Produtos</h1>
      <p className="text-slate-500 mb-6">Cadastre produtos e acompanhe o estoque disponivel.</p>

      {erro ? (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{erro}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Nome do produto</label>
          <input name="nome" value={form.nome} onChange={handleChange} className={classeCampo} placeholder="Ex: Bloco de concreto 14x19x39" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Preco de venda (R$)</label>
          <input name="preco" type="number" step="0.01" value={form.preco} onChange={handleChange} className={classeCampo} placeholder="0,00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Custo (R$)</label>
          <input name="custo" type="number" step="0.01" value={form.custo} onChange={handleChange} className={classeCampo} placeholder="0,00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Estoque inicial</label>
          <input name="quantidade_estoque" type="number" value={form.quantidade_estoque} onChange={handleChange} className={classeCampo} placeholder="0" />
        </div>
        <div>
          <button type="submit" disabled={salvando} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition">
            {salvando ? "Salvando..." : "Adicionar produto"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando produtos...</p>
        ) : produtos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nenhum produto cadastrado ainda. Use o formulario acima para adicionar o primeiro.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Preco</th>
                <th className="px-4 py-2 font-medium">Custo</th>
                <th className="px-4 py-2 font-medium">Estoque</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const estoqueClasse = p.quantidade_estoque <= 5 ? "text-red-600 font-semibold" : "";
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{p.nome}</td>
                    <td className="px-4 py-2">{formatarMoeda(p.preco)}</td>
                    <td className="px-4 py-2">{formatarMoeda(p.custo)}</td>
                    <td className="px-4 py-2"><span className={estoqueClasse}>{p.quantidade_estoque ?? 0}</span></td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
