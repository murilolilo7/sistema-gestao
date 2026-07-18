"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, MessageCircle, FileText, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar, LinhasEsqueleto, EstadoVazio, usePaginacao, ControlePaginacao, useOrdenacao, ThOrdenavel } from "@/components/Ui";

// ---------- Validação de CPF e CNPJ (dígitos verificadores) ----------
function cpfValido(cpf) {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
  let dig = 11 - (soma % 11);
  if (dig >= 10) dig = 0;
  if (dig !== Number(d[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
  dig = 11 - (soma % 11);
  if (dig >= 10) dig = 0;
  return dig === Number(d[10]);
}

function cnpjValido(cnpj) {
  const d = (cnpj || "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (tam) => {
    let soma = 0;
    let pos = tam - 7;
    for (let i = tam; i >= 1; i--) {
      soma += Number(d[tam - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function documentoValido(valor, tipo) {
  const d = (valor || "").replace(/\D/g, "");
  if (!d) return true; // vazio é permitido (campo opcional)
  return tipo === "juridica" ? cnpjValido(d) : cpfValido(d);
}

function linkWhatsApp(telefone) {
  const d = (telefone || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/55${d}`;
}

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
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  const [fichaCliente, setFichaCliente] = useState(null); // cliente aberto na ficha
  const [fichaDados, setFichaDados] = useState(null); // histórico carregado
  const [fichaCarregando, setFichaCarregando] = useState(false);

  function buscarClientesDB() {
    return supabase.from("clientes").select("*").order("codigo", { ascending: false });
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
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(cliente) {
    setEditingId(cliente.id);
    setEditingCodigo(cliente.codigo);
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
    setEditingCodigo(null);
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro("O nome do cliente é obrigatório.");
      return;
    }
    // Valida CPF/CNPJ (se preenchido) pelo dígito verificador
    if (form.cpf_cnpj.trim() && !documentoValido(form.cpf_cnpj, form.tipo_pessoa)) {
      setErro(
        `O ${form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"} informado é inválido. Confira os números.`
      );
      return;
    }
    // Alerta de documento duplicado (outro cliente com o mesmo)
    const docLimpo = form.cpf_cnpj.replace(/\D/g, "");
    if (docLimpo) {
      const duplicado = clientes.find(
        (c) => c.id !== editingId && (c.cpf_cnpj || "").replace(/\D/g, "") === docLimpo
      );
      if (duplicado) {
        setErro(
          `Já existe um cliente com esse ${form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"}: ${duplicado.nome} (código ${duplicado.codigo}).`
        );
        return;
      }
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

    notificar(editingId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.");
    setModo("lista");
    setForm(FORM_VAZIO);
    setEditingId(null);
    setEditingCodigo(null);
    setSalvando(false);
    await carregarClientes();
  }

  // Abre a ficha do cliente e busca o histórico (orçamentos, galpão, vendas)
  async function abrirFicha(cliente) {
    setFichaCliente(cliente);
    setFichaDados(null);
    setFichaCarregando(true);
    const [rOrc, rOrcG, rVendas] = await Promise.all([
      supabase
        .from("orcamentos")
        .select("codigo, status, validade, total, created_at")
        .eq("cliente_id", cliente.id)
        .order("codigo", { ascending: false }),
      supabase
        .from("orcamentos_galpao")
        .select("codigo, status, validade, total, created_at, titulo")
        .eq("cliente_id", cliente.id)
        .order("codigo", { ascending: false }),
      supabase
        .from("vendas")
        .select("id, total, created_at")
        .eq("cliente_id", cliente.id)
        .order("id", { ascending: false }),
    ]);
    setFichaDados({
      orcamentos: rOrc.data || [],
      orcamentosGalpao: rOrcG.data || [],
      vendas: rVendas.data || [],
    });
    setFichaCarregando(false);
  }

  function fecharFicha() {
    setFichaCliente(null);
    setFichaDados(null);
  }

  async function handleDelete(id) {
    const ok = await confirmar({
      titulo: "Excluir cliente?",
      texto: "Essa ação não pode ser desfeita.",
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;

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
      String(c.codigo).includes(termo)
    );
  });

  const ordenacao = useOrdenacao();
  const pag = usePaginacao(ordenacao.aplicar(clientesFiltrados));

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
            ? `Código #${editingCodigo}`
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
                  value={editingId ? String(editingCodigo) : "gerado automaticamente"}
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
                {form.cpf_cnpj.trim() &&
                  !documentoValido(form.cpf_cnpj, form.tipo_pessoa) && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {form.tipo_pessoa === "juridica" ? "CNPJ" : "CPF"} inválido — confira os
                      números.
                    </p>
                  )}
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
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
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
          <LinhasEsqueleto linhas={5} />
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
                <ThOrdenavel campo="codigo" ordenacao={ordenacao}>Código</ThOrdenavel>
                <ThOrdenavel campo="nome" ordenacao={ordenacao}>Nome</ThOrdenavel>
                <th className="px-4 py-2 font-medium">CPF/CNPJ</th>
                <ThOrdenavel campo="cidade" ordenacao={ordenacao}>Cidade/UF</ThOrdenavel>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pag.itensPagina.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {c.codigo}
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
                    {c.telefone ? (
                      <span className="inline-flex items-center gap-1.5">
                        {c.telefone}
                        {linkWhatsApp(c.telefone) && (
                          <a
                            href={linkWhatsApp(c.telefone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700"
                            title="Abrir no WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => abrirFicha(c)}
                        className="text-slate-600 hover:text-slate-900"
                        title="Ver ficha e histórico"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        onClick={() => abrirEdicao(c)}
                        className="text-emerald-700 hover:text-emerald-900"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
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

      {/* ---------- Ficha do cliente (histórico) ---------- */}
      {fichaCliente && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={fecharFicha} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{fichaCliente.nome}</h3>
                <p className="text-xs text-slate-500">
                  Código {fichaCliente.codigo}
                  {fichaCliente.cpf_cnpj ? ` · ${fichaCliente.cpf_cnpj}` : ""}
                  {[fichaCliente.cidade, fichaCliente.uf].filter(Boolean).length
                    ? ` · ${[fichaCliente.cidade, fichaCliente.uf].filter(Boolean).join("/")}`
                    : ""}
                </p>
                {fichaCliente.telefone && (
                  <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1.5">
                    {fichaCliente.telefone}
                    {linkWhatsApp(fichaCliente.telefone) && (
                      <a
                        href={linkWhatsApp(fichaCliente.telefone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-700"
                        title="Abrir no WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={fecharFicha}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                title="Fechar"
              >
                ×
              </button>
            </div>

            {fichaCarregando || !fichaDados ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Carregando histórico...
              </div>
            ) : (
              (() => {
                const totalComprado = fichaDados.vendas.reduce(
                  (s, v) => s + Number(v.total || 0),
                  0
                );
                const fmt = (n) =>
                  Number(n || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  });
                const dataBR = (d) => new Date(d).toLocaleDateString("pt-BR");
                const badge = (status, validade) => {
                  const venc =
                    status !== "aprovado" &&
                    validade &&
                    new Date(validade + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));
                  const rotulo = status === "aprovado" ? "Aprovado" : venc ? "Vencido" : "Pendente";
                  const cor =
                    status === "aprovado"
                      ? "bg-emerald-50 text-emerald-700"
                      : venc
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700";
                  return (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cor}`}>
                      {rotulo}
                    </span>
                  );
                };
                const totalOrcamentos =
                  fichaDados.orcamentos.length + fichaDados.orcamentosGalpao.length;
                return (
                  <div>
                    {/* Resumo */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center">
                        <p className="text-[11px] text-slate-500">Orçamentos</p>
                        <p className="text-base font-bold text-slate-800">{totalOrcamentos}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center">
                        <p className="text-[11px] text-slate-500">Vendas</p>
                        <p className="text-base font-bold text-slate-800">
                          {fichaDados.vendas.length}
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                        <p className="text-[11px] text-emerald-700">Total comprado</p>
                        <p className="text-sm font-bold text-emerald-800">{fmt(totalComprado)}</p>
                      </div>
                    </div>

                    {totalOrcamentos === 0 && fichaDados.vendas.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">
                        Este cliente ainda não tem orçamentos nem vendas.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {fichaDados.orcamentosGalpao.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">
                              Orçamentos de galpão
                            </p>
                            <div className="space-y-1">
                              {fichaDados.orcamentosGalpao.map((o) => (
                                <Link
                                  key={o.codigo}
                                  href="/orcamentos-galpao"
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:bg-slate-50 px-3 py-1.5 text-xs"
                                >
                                  <span className="truncate text-slate-600">
                                    Nº {o.codigo} · {o.titulo || "Galpão"}
                                  </span>
                                  <span className="flex items-center gap-2 whitespace-nowrap">
                                    {badge(o.status, o.validade)}
                                    <b className="text-slate-700">{fmt(o.total)}</b>
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {fichaDados.orcamentos.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">
                              Orçamentos de produtos
                            </p>
                            <div className="space-y-1">
                              {fichaDados.orcamentos.map((o) => (
                                <Link
                                  key={o.codigo}
                                  href="/orcamentos"
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:bg-slate-50 px-3 py-1.5 text-xs"
                                >
                                  <span className="truncate text-slate-600">
                                    Nº {o.codigo} · {dataBR(o.created_at)}
                                  </span>
                                  <span className="flex items-center gap-2 whitespace-nowrap">
                                    {badge(o.status, o.validade)}
                                    <b className="text-slate-700">{fmt(o.total)}</b>
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {fichaDados.vendas.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">Vendas</p>
                            <div className="space-y-1">
                              {fichaDados.vendas.map((v) => (
                                <Link
                                  key={v.id}
                                  href={`/vendas/imprimir?id=${v.id}`}
                                  target="_blank"
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:bg-slate-50 px-3 py-1.5 text-xs"
                                >
                                  <span className="truncate text-slate-600">
                                    Pedido Nº {v.id} · {dataBR(v.created_at)}
                                  </span>
                                  <b className="text-emerald-700 whitespace-nowrap">
                                    {fmt(v.total)}
                                  </b>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end mt-5">
                      <button
                        onClick={() => {
                          const cliente = fichaCliente;
                          fecharFicha();
                          abrirEdicao(cliente);
                        }}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2"
                      >
                        Editar cliente
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}
