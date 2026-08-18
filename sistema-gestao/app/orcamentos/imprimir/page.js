"use client";

import { Suspense, useEffect, useState } from "react";
// Valor por extenso: mesma função usada no orçamento de galpão
// (testada em orcamentos-galpao/calculos.test.js).
import { valorPorExtenso } from "../../orcamentos-galpao/calculos";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { QuadroPecas } from "@/components/DesenhoPecas";

// Dados fixos da empresa que aparecem no cabeçalho do orçamento impresso.
const EMPRESA_PADRAO = {
  nome: "MR7 PRÉ MOLDADOS LTDA",
  telefone: "(82) 98181-0774",
  endereco: "Rodovia AL485, Nº 400",
  cidadeUf: "57340000 - Feira Grande, AL",
  cnpj: "43.926.578/0001-86",
};

// Mescla os dados salvos em Configurações com os padrões (fallback):
// se o campo não foi preenchido lá, usa o valor fixo de sempre.
function dadosEmpresa(config, unidade) {
  if (unidade === "filial") {
    return {
      nome: config?.filial_nome_empresa || EMPRESA_PADRAO.nome,
      telefone: config?.filial_telefone || config?.telefone || EMPRESA_PADRAO.telefone,
      endereco: config?.filial_endereco || EMPRESA_PADRAO.endereco,
      cidadeUf: config?.filial_cidade_uf || EMPRESA_PADRAO.cidadeUf,
      cnpj: config?.filial_cnpj || config?.cnpj || EMPRESA_PADRAO.cnpj,
      logo: config?.logo_base64 || null,
      rodape: config?.rodape_impressos || null,
    };
  }
  return {
    nome: config?.nome_empresa || EMPRESA_PADRAO.nome,
    telefone: config?.telefone || EMPRESA_PADRAO.telefone,
    endereco: config?.endereco || EMPRESA_PADRAO.endereco,
    cidadeUf: config?.cidade_uf || EMPRESA_PADRAO.cidadeUf,
    cnpj: config?.cnpj || EMPRESA_PADRAO.cnpj,
    logo: config?.logo_base64 || null,
    rodape: config?.rodape_impressos || null,
  };
}

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

function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

function nomeArquivoSeguro(texto) {
  return texto.replace(/[\\/:*?"<>|]/g, "").trim();
}

function ConteudoImpressao() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo");
  const [orcamento, setOrcamento] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!codigo) {
        setErro("Código do orçamento não informado na URL.");
        setLoading(false);
        return;
      }
      const [resOrcamento, resConfig] = await Promise.all([
        supabase
          .from("orcamentos")
          .select(
            "*, clientes(nome, cpf_cnpj, telefone, email, endereco, numero, bairro, cidade, uf, cep), itens_orcamento(id, quantidade, preco_unitario, produtos(nome, codigo, unidade, molde, comprimento_cm, largura_cm, altura_cm))"
          )
          .eq("codigo", codigo)
          .single(),
        supabase.from("configuracao_empresa").select("nome_diretor, assinatura_base64, nome_empresa, cnpj, telefone, endereco, cidade_uf, logo_base64, rodape_impressos, filial_nome_empresa, filial_cnpj, filial_telefone, filial_endereco, filial_cidade_uf").eq("id", 1).single(),
      ]);
      if (!ativo) return;
      if (resOrcamento.error) {
        setErro("Orçamento não encontrado.");
      } else {
        setOrcamento(resOrcamento.data);
        setConfig(resConfig.data || null);
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [codigo]);

  // Controla o nome sugerido ao "Salvar como PDF" e o que aparece no
  // cabeçalho de impressão do navegador (que usa o título da página).
  useEffect(() => {
    if (orcamento) {
      const nomeCliente = orcamento.clientes?.nome || "Consumidor Final";
      document.title = nomeArquivoSeguro(
        `Orcamento ${orcamento.codigo} - ${nomeCliente}`
      );
    }
  }, [orcamento]);

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Carregando...</p>;
  }
  if (erro) {
    return <p className="p-8 text-sm text-red-600">{erro}</p>;
  }
  if (!orcamento) return null;

  const empresa = dadosEmpresa(config, orcamento.unidade);

  const itens = orcamento.itens_orcamento || [];
  const subtotal = itens.reduce(
    (soma, i) => soma + i.quantidade * Number(i.preco_unitario),
    0
  );
  const desconto = Number(orcamento.desconto || 0);
  const cliente = orcamento.clientes;
  const vencido =
    orcamento.status !== "aprovado" &&
    orcamento.validade &&
    new Date(orcamento.validade + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));
  const rotuloStatus = orcamento.status === "aprovado"
    ? "Aprovado"
    : vencido
      ? "Vencido"
      : "Pendente";
  const enderecoCliente = [
    cliente?.endereco,
    cliente?.numero,
    cliente?.bairro,
  ]
    .filter(Boolean)
    .join(", ");
  const cidadeUfCliente = [cliente?.cidade, cliente?.uf]
    .filter(Boolean)
    .join("/");

  return (
    <div className="max-w-3xl mx-auto p-8 print:p-4 text-slate-900 bg-white">
      <button
        onClick={() => window.print()}
        className="print:hidden mb-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 transition"
      >
        Imprimir / Salvar como PDF
      </button>

      {/* Cabeçalho */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          {empresa.logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={empresa.logo} alt="Logo" className="max-h-16 max-w-[160px] object-contain" />
          ) : (
            <p className="font-bold text-xl">
              MR7 <span className="text-emerald-600">Pré-Moldados</span>
            </p>
          )}
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="font-semibold">{empresa.nome}</p>
          <p>{empresa.telefone}</p>
          <p>{empresa.endereco}</p>
          <p>{empresa.cidadeUf}</p>
          <p>CNPJ: {empresa.cnpj}</p>
        </div>
      </div>

      <h1 className="text-center text-lg font-bold mb-6">
        Orçamento Nº {orcamento.codigo}
      </h1>

      {/* Cliente + dados do orçamento, numa única caixa */}
      <div className="border border-slate-300 rounded-md p-4 mb-6 text-sm grid grid-cols-2 gap-6">
        <div>
          <p className="font-semibold text-xs text-slate-500 mb-1">CLIENTE</p>
          <p className="font-medium">{cliente?.nome || "Consumidor Final"}</p>
          {cliente?.cpf_cnpj && <p className="text-xs">{cliente.cpf_cnpj}</p>}
          {enderecoCliente && <p className="text-xs">{enderecoCliente}</p>}
          {cidadeUfCliente && <p className="text-xs">{cidadeUfCliente}</p>}
          {cliente?.telefone && <p className="text-xs">{cliente.telefone}</p>}
        </div>
        <div className="text-xs space-y-1">
          <p>
            {/* Data da PROPOSTA (envio ao cliente); sem ela, a de criação. */}
            <span className="font-semibold">Data:</span>{" "}
            {formatarDataHora(orcamento.data_proposta || orcamento.created_at)}
          </p>
          <p>
            <span className="font-semibold">Válido até:</span>{" "}
            {formatarDataSimples(orcamento.validade)}
          </p>
          <p>
            <span className="font-semibold">Vendedor:</span>{" "}
            {orcamento.vendedor || "-"}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {rotuloStatus}
          </p>
        </div>
      </div>

      {/* Quadro de desenho das peças (só aparece se algum produto tiver molde) */}
      <QuadroImpresso itens={itens} />

      {/* Itens */}
      <p className="font-semibold text-xs text-slate-500 mb-1">
        ITENS DO ORÇAMENTO
      </p>
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-2 py-1.5 text-left">
              Descrição
            </th>
            <th className="border border-slate-400 px-2 py-1.5 text-left">
              Código
            </th>
            <th className="border border-slate-400 px-2 py-1.5 text-left">
              Un.
            </th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">
              Qtd.
            </th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">
              Valor unitário
            </th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              <td className="border border-slate-300 px-2 py-1.5">
                {item.produtos?.nome || "Produto removido"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {item.produtos?.codigo ?? "-"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {item.produtos?.unidade || "-"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">
                {item.quantidade}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">
                {formatarMoeda(item.preco_unitario)}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">
                {formatarMoeda(item.quantidade * item.preco_unitario)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totais */}
      <div className="flex justify-end mb-6">
        <table className="text-xs">
          <tbody>
            <tr>
              <td className="px-2 py-0.5 text-slate-500">Nº de itens</td>
              <td className="px-2 py-0.5 text-right">{itens.length}</td>
            </tr>
            <tr>
              <td className="px-2 py-0.5 text-slate-500">Subtotal</td>
              <td className="px-2 py-0.5 text-right">
                {formatarMoeda(subtotal)}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-0.5 text-slate-500">Desconto</td>
              <td className="px-2 py-0.5 text-right">
                {desconto > 0 ? `− ${formatarMoeda(desconto)}` : formatarMoeda(0)}
              </td>
            </tr>
              {Number(orcamento.valor_frete || 0) > 0 && (
                <tr>
                  <td className="px-2 py-0.5 text-slate-500">Frete</td>
                  <td className="px-2 py-0.5 text-right">
                    {formatarMoeda(orcamento.valor_frete)}
                  </td>
                </tr>
              )}
            <tr className="border-t border-slate-400">
              <td className="px-2 py-1 font-bold">Total do orçamento</td>
              <td className="px-2 py-1 text-right font-bold">
                {formatarMoeda(orcamento.total)}
              </td>
            </tr>
            <tr>
              <td />
              <td className="px-2 pb-1 text-right text-[10px] italic text-slate-600">
                {valorPorExtenso(orcamento.total)}.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Observações */}
      {orcamento.observacao && (
        <div>
          <p className="font-semibold text-xs text-slate-500 mb-1">
            OBSERVAÇÕES
          </p>
          <div className="border border-slate-300 rounded-md p-3 text-xs whitespace-pre-line">
            {orcamento.observacao}
          </div>
        </div>
      )}

      {empresa.rodape && (
        <div className="mt-8 pt-3 border-t border-slate-300 text-[11px] text-slate-600 whitespace-pre-line">
          {empresa.rodape}
        </div>
      )}
      <div className="mt-16 text-xs">
        <div className="text-center max-w-xs">
          {config?.assinatura_base64 && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={config.assinatura_base64}
              alt="Assinatura"
              className="max-h-16 mx-auto mb-1"
            />
          )}
          <div className="border-t border-slate-800 pt-2">
            <p>{config?.nome_diretor || empresa.nome}</p>
            <p className="text-slate-500">Diretor</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ImprimirOrcamentoPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-slate-500">Carregando...</p>}
    >
      <ConteudoImpressao />
    </Suspense>
  );
}

// Quadro "Peças deste orçamento": desenhos técnicos gerados pelas medidas
// cadastradas em cada produto (molde + cm). Sem peças desenháveis, não aparece.
function QuadroImpresso({ itens }) {
  const pecas = [];
  const vistos = new Set();
  for (const item of itens) {
    const p = item.produtos;
    if (!p || !p.molde) continue;
    const chave = `${p.molde}|${p.comprimento_cm}|${p.largura_cm}|${p.altura_cm}|${p.nome}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pecas.push({
      nome: p.nome,
      molde: p.molde,
      comprimento: p.comprimento_cm,
      largura: p.largura_cm,
      altura: p.altura_cm,
    });
  }
  if (pecas.length === 0) return null;
  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2 mb-4">
      <p className="font-semibold text-[10px] text-slate-500 uppercase tracking-wide mb-1">
        Peças deste orçamento
      </p>
      <QuadroPecas pecas={pecas} escala={1.15} larguraMaxPeca={190} />
    </div>
  );
}

