"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const FORM_VAZIO = {
  nome: "",
  cpf_cnpj: "",
  nome_responsavel: "",
  telefone: "",
  email: "",
  cidade: "",
  endereco: "",
};

// Formata progressivamente como CPF (11 dígitos) ou CNPJ (14 dígitos)
// conforme a pessoa digita.
function formatarCpfCnpj(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    if (d.length > 9)
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
    return d;
  }
  if (d.length > 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);

  function buscarClientes() {
    return supabase
      .from("clientes")
      .select("*")
      .order("id", { ascending: false });
  }

  function aplicarResultado(data, error) {
    if (error) {
      setErro("Não foi possível carregar os clientes: " + error.message);
    } else {
      setClientes(data);
    }
    setLoading(false);
  }

  async function carregarClientes() {
    setLoading(true);
    setErro("");
    const { data, error } = await buscarClientes();
    aplicarResultado(data, error);
  }

  // Carrega a lista assim que a página monta. O resultado só é aplicado
  // dentro do .then (fora da fase síncrona do efeito), evitando o aviso
  // do React sobre setState síncrono em efeito.
  useEffect(() => {
    let ativo = true;
    buscarClientes().then(({ data, error }) => {
      if (ativo) aplicarResultado(data, error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "cpf_cnpj") {
      setForm((f) => ({ ...f, cpf_cnpj: formatarCpfCnpj(value) }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  function iniciarEdicao(cliente) {
    setEditingId(cliente.id);
    setErro("");
    setForm({
      nome: cliente.nome || "",
      cpf_cnpj: cliente.cpf_cnpj || "",
      nome_responsavel: cliente.nome_responsavel || "",
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      cidade: cliente.cidade || "",
      endereco: cliente.endereco || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setForm(FORM_VAZIO);
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro("O nome do cliente é obrigatório.");
      return;
    }
    setSalvando(true);
    setErro("");

    const payload = {
      nome: form.nome.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      nome_responsavel: form.nome_responsavel.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cidade: form.cidade.trim() || null,
      endereco: form.endereco.trim() || null,
    };

    const resultado = editingId
      ? await supabase.from("clientes").update(payload).eq("id", editingId)
      : await supabase.from("clientes").insert(payload);

    if (resultado.error) {
      setErro(
        (editingId
          ? "Erro ao atualizar cliente: "
          : "Erro ao salvar cliente: ") + resultado.error.message
      );
    } else {
      setForm(FORM_VAZIO);
      setEditingId(null);
      await carregarClientes();
    }
    setSalvando(false);
  }

  async function handleDelete(id) {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este cliente?"
    );
    if (!confirmar) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        setErro(
          "Não é possível excluir: este cliente já possui orçamentos ou vendas vinculadas."
        );
      } else {
        setErro("Erro ao excluir: " + error.message);
      }
    } else {
      if (editingId === id) cancelarEdicao();
      await carregarClientes();
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Clientes</h1>
      <p className="text-slate-500 mb-6">
        Cadastre clientes e mantenha os dados de contato atualizados.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      {/* Formulário de cadastro/edição */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        {editingId && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 text-xs font-medium">
            Editando cliente #{editingId}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nome do cliente
            </label>
            <input
              name="nome"
              value={form.nome}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ex: Construtora Alagoas Ltda"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              CPF ou CNPJ
            </label>
            <input
              name="cpf_cnpj"
              value={form.cpf_cnpj}
              onChange={handleChange}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nome do responsável
            </label>
            <input
              name="nome_responsavel"
              value={form.nome_responsavel}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Pessoa de contato"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Telefone
            </label>
            <input
              name="telefone"
              value={form.telefone}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="(82) 90000-0000"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              E-mail
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="cliente@empresa.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Cidade
            </label>
            <input
              name="cidade"
              value={form.cidade}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Arapiraca"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Endereço
            </label>
            <input
              name="endereco"
              value={form.endereco}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Rua, número, bairro"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
            >
              {salvando
                ? "Salvando..."
                : editingId
                  ? "Salvar alterações"
                  : "Adicionar cliente"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelarEdicao}
                className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 transition"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Lista de clientes */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando clientes...</p>
        ) : clientes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum cliente cadastrado ainda. Use o formulário acima para
            adicionar o primeiro.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">CPF/CNPJ</th>
                <th className="px-4 py-2 font-medium">Cidade</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {c.nome}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.cpf_cnpj || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.cidade || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.telefone || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.nome_responsavel || "-"}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => iniciarEdicao(c)}
                      className="text-emerald-700 hover:text-emerald-900 text-xs font-medium mr-3"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
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
