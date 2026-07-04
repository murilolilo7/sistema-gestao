"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const FORM_VAZIO = {
  nome: "",
  tipo_pessoa: "fisica",
  cpf_cnpj: "",
  nome_responsavel: "",
  telefone: "",
  email: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

// Formata como CPF ou CNPJ dependendo do tipo de pessoa selecionado.
function formatarDocumento(valor, tipo) {
  const digitos = valor.replace(/\D/g, "");
  if (tipo === "juridica") {
    const d = digitos.slice(0, 14);
    if (d.length > 12)
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    if (d.length > 8)
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
    return d;
  }
  const d = digitos.slice(0, 11);
  if (d.length > 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

function formatarCep(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

export default function ClientesPage() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);

  function buscarClientesDB() {
    return supabase.from("clientes").select("*").order("id", { ascending: false });
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
    const { data, error } = await buscarClientesDB();
    aplicarResultado(data, error);
  }

  // Resultado só é aplicado dentro do .then, fora da fase síncrona do
  // efeito (evita o aviso do React sobre setState síncrono em efeito).
  useEffect(() => {
    let ativo = true;
    buscarClientesDB().then(({ data, error }) => {
      if (ativo) aplicarResultado(data, error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function buscarEnderecoPorCep(cep) {
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        setErro("CEP não encontrado. Preencha o endereço manualmente.");
      } else {
        setForm((f) => ({
          ...f,
          endereco: dados.logradouro || f.endereco,
          bairro: dados.bairro || f.bairro,
          cidade: dados.localidade || f.cidade,
          uf: dados.uf || f.uf,
        }));
      }
    } catch {
      setErro(
        "Não foi possível buscar o CEP agora. Preencha o endereço manualmente."
      );
    }
    setBuscandoCep(false);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "cep") {
      const formatado = formatarCep(value);
      setForm((f) => ({ ...f, cep: formatado }));
      if (formatado.replace(/\D/g, "").length === 8) {
        buscarEnderecoPorCep(formatado.replace(/\D/g, ""));
      }
      return;
    }
    if (name === "cpf_cnpj") {
      setForm((f) => ({
        ...f,
        cpf_cnpj: formatarDocumento(value, f.tipo_pessoa),
      }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleTipoPessoaChange(e) {
    const tipo = e.target.value;
    // Limpa o documento ao trocar o tipo, já que a máscara é diferente.
    setForm((f) => ({ ...f, tipo_pessoa: tipo, cpf_cnpj: "" }));
  }

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(cliente) {
    setEditingId(cliente.id);
    setErro("");
    setMensagem("");
    setForm({
      nome: cliente.nome || "",
      tipo_pessoa: cliente.tipo_pessoa || "fisica",
      cpf_cnpj: cliente.cpf_cnpj || "",
      nome_responsavel: cliente.nome_responsavel || "",
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      cep: cliente.cep || "",
      endereco: cliente.endereco || "",
      numero: cliente.numero || "",
      complemento: cliente.complemento || "",
      bairro: cliente.bairro || "",
      cidade: cliente.cidade || "",
      uf: cliente.uf || "",
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
      setErro("O nome do cliente é obrigatório.");
      return;
    }
    setSalvando(true);
    setErro("");

    const payload = {
      nome: form.nome.trim(),
      tipo_pessoa: form.tipo_pessoa,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      nome_responsavel: form.nome_responsavel.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cep: form.cep.trim() || null,
      endereco: form.endereco.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      uf: form.uf || null,
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
      setSalvando(false);
      return;
    }

    setMensagem(
      editingId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso."
    );
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setSalvando(false);
    await carregarClientes();
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
      await carregarClientes();
    }
  }

  const clientesFiltrados = clientes.filter((c) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      c.nome?.toLowerCase().includes(termo) ||
      c.cpf_cnpj?.toLowerCase().includes(termo) ||
      String(c.id).includes(termo)
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
          {modo === "editar" ? "Editar cliente" : "Novo cliente"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar"
            ? `Código #${editingId}`
            : "Preencha os dados do cliente."}
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
              Dados cadastrais
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2">
                <label className={labelClasse}>Nome</label>
                <input
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Ex: Construtora Alagoas Ltda"
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
                <label className={labelClasse}>Tipo de pessoa</label>
                <select
                  value={form.tipo_pessoa}
                  onChange={handleTipoPessoaChange}
                  className={campoClasse}
                >
                  <option value="fisica">Pessoa Física</option>
                  <option value="juridica">Pessoa Jurídica</option>
                </select>
              </div>
              <div>
                <label className={labelClasse}>
                  {form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"}
                </label>
                <input
                  name="cpf_cnpj"
                  value={form.cpf_cnpj}
                  onChange={handleChange}
                  inputMode="numeric"
                  placeholder={
                    form.tipo_pessoa === "juridica"
                      ? "00.000.000/0000-00"
                      : "000.000.000-00"
                  }
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Nome do responsável</label>
                <input
                  name="nome_responsavel"
                  value={form.nome_responsavel}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Pessoa de contato"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Endereço</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelClasse}>CEP</label>
                <div className="relative">
                  <input
                    name="cep"
                    value={form.cep}
                    onChange={handleChange}
                    inputMode="numeric"
                    placeholder="00000-000"
                    className={campoClasse}
                  />
                  {buscandoCep && (
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                      buscando...
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClasse}>UF</label>
                <select
                  name="uf"
                  value={form.uf}
                  onChange={handleChange}
                  className={campoClasse}
                >
                  <option value="">Selecione</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClasse}>Cidade</label>
                <input
                  name="cidade"
                  value={form.cidade}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Arapiraca"
                />
              </div>

              <div>
                <label className={labelClasse}>Bairro</label>
                <input
                  name="bairro"
                  value={form.bairro}
                  onChange={handleChange}
                  className={campoClasse}
                />
              </div>
              <div className="lg:col-span-2">
                <label className={labelClasse}>Endereço</label>
                <input
                  name="endereco"
                  value={form.endereco}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Rua, avenida..."
                />
              </div>

              <div>
                <label className={labelClasse}>Número</label>
                <input
                  name="numero"
                  value={form.numero}
                  onChange={handleChange}
                  className={campoClasse}
                />
              </div>
              <div className="lg:col-span-2">
                <label className={labelClasse}>Complemento</label>
                <input
                  name="complemento"
                  value={form.complemento}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="Apto, sala, bloco..."
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelClasse}>Telefone</label>
                <input
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="(82) 90000-0000"
                />
              </div>
              <div className="lg:col-span-2">
                <label className={labelClasse}>E-mail</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={campoClasse}
                  placeholder="cliente@empresa.com"
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
              {salvando ? "Salvando..." : "Salvar cliente"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------- TELA DE LISTAGEM ----------
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
          placeholder="Pesquisar por nome, CPF/CNPJ ou código..."
          className={campoClasse}
        />
        <button
          type="button"
          onClick={abrirNovo}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 whitespace-nowrap transition"
        >
          + Incluir cliente
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando clientes...</p>
        ) : clientes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum cliente cadastrado ainda. Clique em &quot;Incluir
            cliente&quot; para adicionar o primeiro.
          </p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum cliente encontrado para essa busca.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">CPF/CNPJ</th>
                <th className="px-4 py-2 font-medium">Cidade/UF</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {c.id}
                  </td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {c.nome}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.cpf_cnpj || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {[c.cidade, c.uf].filter(Boolean).join("/") || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.telefone || "-"}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => abrirEdicao(c)}
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
