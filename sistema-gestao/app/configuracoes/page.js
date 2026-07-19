"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { notificar } from "@/components/Ui";

const TAMANHO_MAXIMO_MB = 2;

function ConfiguracoesPage() {
  const [nomeDiretor, setNomeDiretor] = useState("");
  const [assinaturaBase64, setAssinaturaBase64] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidadeUf, setCidadeUf] = useState("");
  const [logoBase64, setLogoBase64] = useState("");
  const [rodapeImpressos, setRodapeImpressos] = useState("");
  const [gerandoBackup, setGerandoBackup] = useState(false);
  const [freteRaioKm, setFreteRaioKm] = useState("");
  const [freteValorFixo, setFreteValorFixo] = useState("");
  const [freteValorKm, setFreteValorKm] = useState("");
  const [freteConfigId, setFreteConfigId] = useState(null);
  const [salvandoFrete, setSalvandoFrete] = useState(false);
  const [msgFrete, setMsgFrete] = useState("");
  const [filialNome, setFilialNome] = useState("");
  const [filialCnpj, setFilialCnpj] = useState("");
  const [filialTelefone, setFilialTelefone] = useState("");
  const [filialEndereco, setFilialEndereco] = useState("");
  const [filialCidadeUf, setFilialCidadeUf] = useState("");
  const [salvandoFilial, setSalvandoFilial] = useState(false);
  const [msgFilial, setMsgFilial] = useState("");

  // Parâmetros do frete (independentes do formulário principal)
  useEffect(() => {
    let ativo = true;
    supabase
      .from("configuracao_empresa")
      .select("id, frete_raio_km, frete_valor_fixo, frete_valor_km, filial_nome_empresa, filial_cnpj, filial_telefone, filial_endereco, filial_cidade_uf")
      .limit(1)
      .then(({ data }) => {
        if (!ativo || !data || !data[0]) return;
        setFreteConfigId(data[0].id);
        setFreteRaioKm(data[0].frete_raio_km ?? "");
        setFreteValorFixo(data[0].frete_valor_fixo ?? "");
        setFreteValorKm(data[0].frete_valor_km ?? "");
        setFilialNome(data[0].filial_nome_empresa ?? "");
        setFilialCnpj(data[0].filial_cnpj ?? "");
        setFilialTelefone(data[0].filial_telefone ?? "");
        setFilialEndereco(data[0].filial_endereco ?? "");
        setFilialCidadeUf(data[0].filial_cidade_uf ?? "");
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function handleSalvarFrete() {
    if (!freteConfigId) return;
    setSalvandoFrete(true);
    setMsgFrete("");
    const { error } = await supabase
      .from("configuracao_empresa")
      .update({
        frete_raio_km: freteRaioKm === "" ? null : Number(freteRaioKm),
        frete_valor_fixo: freteValorFixo === "" ? null : Number(freteValorFixo),
        frete_valor_km: freteValorKm === "" ? null : Number(freteValorKm),
      })
      .eq("id", freteConfigId);
    setSalvandoFrete(false);
    setMsgFrete(error ? "Erro ao salvar: " + error.message : "Parâmetros do frete salvos!");
  }

  async function handleSalvarFilial() {
    if (!freteConfigId) return;
    setSalvandoFilial(true);
    setMsgFilial("");
    const { error } = await supabase
      .from("configuracao_empresa")
      .update({
        filial_nome_empresa: filialNome.trim() || null,
        filial_cnpj: filialCnpj.trim() || null,
        filial_telefone: filialTelefone.trim() || null,
        filial_endereco: filialEndereco.trim() || null,
        filial_cidade_uf: filialCidadeUf.trim() || null,
      })
      .eq("id", freteConfigId);
    setSalvandoFilial(false);
    setMsgFilial(error ? "Erro ao salvar: " + error.message : "Dados da filial salvos!");
  }
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  function buscarConfiguracao() {
    return supabase
      .from("configuracao_empresa")
      .select(
        "nome_diretor, assinatura_base64, nome_empresa, cnpj, telefone, endereco, cidade_uf, logo_base64, rodape_impressos"
      )
      .eq("id", 1)
      .single();
  }

  function aplicarResultado(data, error) {
    if (error) {
      setErro("Não foi possível carregar as configurações: " + error.message);
    } else {
      setNomeDiretor(data?.nome_diretor || "");
      setAssinaturaBase64(data?.assinatura_base64 || "");
      setNomeEmpresa(data?.nome_empresa || "");
      setCnpj(data?.cnpj || "");
      setTelefone(data?.telefone || "");
      setEndereco(data?.endereco || "");
      setCidadeUf(data?.cidade_uf || "");
      setLogoBase64(data?.logo_base64 || "");
      setRodapeImpressos(data?.rodape_impressos || "");
    }
    setLoading(false);
  }

  useEffect(() => {
    let ativo = true;
    buscarConfiguracao().then(({ data, error }) => {
      if (ativo) aplicarResultado(data, error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function handleArquivo(e, destino) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Selecione um arquivo de imagem (PNG ou JPG).");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      setErro(`A imagem precisa ter no máximo ${TAMANHO_MAXIMO_MB}MB.`);
      return;
    }
    setErro("");
    const leitor = new FileReader();
    leitor.onload = () =>
      destino === "logo" ? setLogoBase64(leitor.result) : setAssinaturaBase64(leitor.result);
    leitor.readAsDataURL(arquivo);
  }

  async function handleSalvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setMensagem("");

    const { error } = await supabase
      .from("configuracao_empresa")
      .update({
        nome_diretor: nomeDiretor.trim() || null,
        assinatura_base64: assinaturaBase64 || null,
        nome_empresa: nomeEmpresa.trim() || null,
        cnpj: cnpj.trim() || null,
        telefone: telefone.trim() || null,
        endereco: endereco.trim() || null,
        cidade_uf: cidadeUf.trim() || null,
        logo_base64: logoBase64 || null,
        rodape_impressos: rodapeImpressos.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      setErro("Erro ao salvar: " + error.message);
    } else {
      notificar("Configurações salvas com sucesso.");
    }
    setSalvando(false);
  }

  // ---------------------------------------------------------------------
  // Backup completo: baixa TODAS as tabelas num único Excel (uma aba cada).
  // Campos de imagem (base64 gigantes) são omitidos para o arquivo abrir bem.
  // ---------------------------------------------------------------------
  const TABELAS_BACKUP = [
    ["clientes", "Clientes"],
    ["produtos", "Produtos"],
    ["orcamentos", "Orcamentos"],
    ["itens_orcamento", "Itens orcamento"],
    ["orcamentos_galpao", "Orcamentos galpao"],
    ["itens_orcamento_galpao", "Itens orc galpao"],
    ["vendas", "Vendas"],
    ["itens_venda", "Itens venda"],
    ["movimentacoes_estoque", "Mov estoque"],
    ["insumos", "Insumos"],
    ["mao_de_obra", "Mao de obra"],
    ["composicoes_galpao", "Composicoes galpao"],
    ["composicao_itens", "Itens composicao"],
    ["modelos_galpao", "Modelos galpao"],
    ["historico_alteracoes_precos", "Historico precos"],
    ["configuracao_empresa", "Config empresa"],
    ["perfis_usuario", "Usuarios"],
  ];

  async function buscarTabelaInteira(tabela) {
    const POR_PAGINA = 1000;
    let todos = [];
    let de = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .range(de, de + POR_PAGINA - 1);
      if (error) throw new Error(`${tabela}: ${error.message}`);
      todos = todos.concat(data || []);
      if (!data || data.length < POR_PAGINA) break;
      de += POR_PAGINA;
    }
    return todos;
  }

  function linhaParaExcel(linha) {
    const saida = {};
    for (const [chave, valor] of Object.entries(linha)) {
      if (valor && typeof valor === "object") {
        saida[chave] = JSON.stringify(valor);
      } else if (typeof valor === "string" && valor.length > 20000) {
        saida[chave] = "[imagem/conteudo longo omitido do backup]";
      } else {
        saida[chave] = valor;
      }
    }
    return saida;
  }

  async function handleBackup() {
    setGerandoBackup(true);
    setErro("");
    try {
      const pasta = XLSX.utils.book_new();
      for (const [tabela, aba] of TABELAS_BACKUP) {
        const linhas = await buscarTabelaInteira(tabela);
        const planilha = XLSX.utils.json_to_sheet(
          linhas.length ? linhas.map(linhaParaExcel) : [{ aviso: "tabela vazia" }]
        );
        XLSX.utils.book_append_sheet(pasta, planilha, aba);
      }
      const hoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(pasta, `backup-mr7-${hoje}.xlsx`);
      setMensagem("Backup gerado! O arquivo foi baixado — guarde em local seguro.");
    } catch (e) {
      setErro("Erro ao gerar o backup: " + e.message);
    }
    setGerandoBackup(false);
  }

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClasse = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Configurações</h1>
      <p className="text-slate-500 mb-6">
        Dados da empresa, logo e assinatura — usados no papel timbrado dos impressos.
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

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <form
          onSubmit={handleSalvar}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 max-w-lg"
        >
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              Dados da empresa (papel timbrado)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClasse}>Nome da empresa</label>
                <input
                  type="text"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  placeholder="Ex: MR7 PRÉ MOLDADOS LTDA"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>CNPJ</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Telefone</label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Endereço</label>
                <input
                  type="text"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, número"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Cidade / UF (com CEP)</label>
                <input
                  type="text"
                  value={cidadeUf}
                  onChange={(e) => setCidadeUf(e.target.value)}
                  placeholder="00000000 - Cidade, UF"
                  className={campoClasse}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClasse}>Logo da empresa (imagem)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleArquivo(e, "logo")}
              className="w-full text-sm text-slate-600 cursor-pointer file:cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 file:transition"
            />
            <p className="text-xs text-slate-400 mt-1">
              Aparece no topo dos impressos. PNG ou JPG, até {TAMANHO_MAXIMO_MB}MB.
            </p>
            {logoBase64 && (
              <div className="mt-2">
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoBase64} alt="Logo" className="max-h-20" />
                </div>
                <button
                  type="button"
                  onClick={() => setLogoBase64("")}
                  className="block mt-2 text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Remover logo
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={labelClasse}>Rodapé dos impressos (condições)</label>
            <textarea
              value={rodapeImpressos}
              onChange={(e) => setRodapeImpressos(e.target.value)}
              rows={2}
              placeholder="Ex: Proposta válida por 30 dias. Pagamento: 50% na assinatura, 50% na entrega."
              className={campoClasse}
            />
            <p className="text-xs text-slate-400 mt-1">
              Texto que aparece no rodapé dos orçamentos e pedidos impressos.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Assinatura</p>
          </div>

          <div>
            <label className={labelClasse}>Nome do diretor</label>
            <input
              type="text"
              value={nomeDiretor}
              onChange={(e) => setNomeDiretor(e.target.value)}
              placeholder="Nome que aparece embaixo da assinatura"
              className={campoClasse}
            />
          </div>

          <div>
            <label className={labelClasse}>Assinatura (imagem)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleArquivo(e, "assinatura")}
              className="w-full text-sm text-slate-600 cursor-pointer file:cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 file:transition"
            />
            <p className="text-xs text-slate-400 mt-1">
              PNG ou JPG, fundo transparente ou branco, até {TAMANHO_MAXIMO_MB}MB.
            </p>
          </div>

          {assinaturaBase64 && (
            <div>
              <p className={labelClasse}>Pré-visualização</p>
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assinaturaBase64} alt="Assinatura" className="max-h-24" />
              </div>
              <button
                type="button"
                onClick={() => setAssinaturaBase64("")}
                className="block mt-2 text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remover assinatura
              </button>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition"
            >
              {salvando ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}

      {/* ---------- Dados da filial ---------- */}
      {!loading && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm max-w-lg">
          <p className="text-sm font-semibold text-slate-700 mb-1">Dados da filial</p>
          <p className="text-xs text-slate-500 mb-3">
            Aparecem no impresso quando o orçamento é feito pela unidade Filial. O ponto
            de partida do frete da filial já está gravado (Barra dos Coqueiros, SE).
          </p>
          <div className="grid grid-cols-1 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome da empresa (filial)</label>
              <input
                type="text"
                value={filialNome}
                onChange={(e) => setFilialNome(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">CNPJ</label>
              <input
                type="text"
                value={filialCnpj}
                onChange={(e) => setFilialCnpj(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
              <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefone</label>
              <input
                type="text"
                value={filialTelefone}
                onChange={(e) => setFilialTelefone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Endereço</label>
              <input
                type="text"
                value={filialEndereco}
                onChange={(e) => setFilialEndereco(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">CEP - Cidade, UF</label>
              <input
                type="text"
                value={filialCidadeUf}
                onChange={(e) => setFilialCidadeUf(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSalvarFilial}
              disabled={salvandoFilial}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
            >
              {salvandoFilial ? "Salvando..." : "Salvar filial"}
            </button>
            {msgFilial && <span className="text-xs text-slate-500">{msgFilial}</span>}
          </div>
        </div>
      )}

      {/* ---------- Parâmetros do frete ---------- */}
      {!loading && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm max-w-lg">
          <p className="text-sm font-semibold text-slate-700 mb-1">Frete dos orçamentos de produtos</p>
          <p className="text-xs text-slate-500 mb-3">
            Regra: até o raio abaixo, cobra o valor fixo. Passou do raio, cobra o
            valor por km × distância × 2 (ida e volta) sobre a distância toda.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Raio (km)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={freteRaioKm}
                onChange={(e) => setFreteRaioKm(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor fixo (R$)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={freteValorFixo}
                onChange={(e) => setFreteValorFixo(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">R$ por km</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={freteValorKm}
                onChange={(e) => setFreteValorKm(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSalvarFrete}
              disabled={salvandoFrete}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
            >
              {salvandoFrete ? "Salvando..." : "Salvar frete"}
            </button>
            {msgFrete && <span className="text-xs text-slate-500">{msgFrete}</span>}
          </div>
        </div>
      )}

      {/* ---------- Backup completo ---------- */}
      {!loading && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm max-w-lg">
          <p className="text-sm font-semibold text-slate-700 mb-1">Backup dos dados</p>
          <p className="text-xs text-slate-500 mb-3">
            Baixa um arquivo Excel com TODOS os dados do sistema (clientes, produtos, orçamentos,
            vendas, estoque, preços...), uma aba por tabela. Guarde em local seguro — pendrive,
            Google Drive ou e-mail. Recomendado: uma vez por semana.
          </p>
          <button
            type="button"
            onClick={handleBackup}
            disabled={gerandoBackup}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
          >
            <Download size={15} />
            {gerandoBackup ? "Gerando backup..." : "Baixar backup completo"}
          </button>
        </div>
      )}
    </div>
  );
}

// Porteiro: esta tela é exclusiva de administradores.
export default function ConfiguracoesPageProtegida() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <ConfiguracoesPage />;
}
