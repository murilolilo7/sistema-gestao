"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Dados fixos da empresa que aparecem no cabeçalho do pedido impresso.
const EMPRESA_PADRAO = {
  nome: "MR7 PRÉ MOLDADOS LTDA",
  telefone: "(82) 98181-0774",
  endereco: "Rodovia AL485, Nº 400",
  cidadeUf: "57340000 - Feira Grande, AL",
  cnpj: "43.926.578/0001-86",
};

// Mescla os dados salvos em Configurações com os padrões (fallback):
// se o campo não foi preenchido lá, usa o valor fixo de sempre.
function dadosEmpresa(config) {
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
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleDateString("pt-BR");
}

function nomeArquivoSeguro(texto) {
  return texto.replace(/[\\/:*?"<>|]/g, "").trim();
}

function ConteudoImpressao() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [venda, setVenda] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!id) {
        setErro("Venda não informada na URL.");
        setLoading(false);
        return;
      }
      const [resVenda, resConfig] = await Promise.all([
        supabase
          .from("vendas")
          .select(
            "*, clientes(nome, cpf_cnpj, telefone, email, endereco, numero, bairro, cidade, uf, cep), orcamentos(codigo, vendedor), orcamentos_galpao(codigo, vendedor, titulo), itens_venda(id, quantidade, preco_unitario, descricao_livre, unidade_livre, produtos(nome, codigo, unidade), composicoes_galpao(nome, unidade))"
          )
          .eq("id", id)
          .single(),
        supabase
          .from("configuracao_empresa")
          .select("nome_diretor, assinatura_base64, nome_empresa, cnpj, telefone, endereco, cidade_uf, logo_base64, rodape_impressos")
          .eq("id", 1)
          .single(),
      ]);
      if (!ativo) return;
      if (resVenda.error) {
        setErro("Venda não encontrada.");
      } else {
        setVenda(resVenda.data);
        setConfig(resConfig.data || null);
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [id]);

  useEffect(() => {
    if (venda) {
      const nomeCliente = venda.clientes?.nome || "Consumidor Final";
      document.title = nomeArquivoSeguro(`Pedido de Venda ${venda.id} - ${nomeCliente}`);
    }
  }, [venda]);

  if (loading) return <p className="p-8 text-sm text-slate-500">Carregando...</p>;
  if (erro) return <p className="p-8 text-sm text-red-600">{erro}</p>;
  if (!venda) return null;

  const empresa = dadosEmpresa(config);

  const itens = venda.itens_venda || [];
  const subtotal = itens.reduce((soma, i) => soma + i.quantidade * Number(i.preco_unitario), 0);
  const cliente = venda.clientes;
  const vendedor = venda.orcamentos?.vendedor || venda.orcamentos_galpao?.vendedor || "-";
  const origem = venda.orcamentos?.codigo
    ? `Orçamento Nº ${venda.orcamentos.codigo}`
    : venda.orcamentos_galpao?.codigo
      ? `Orçamento de Galpão Nº ${venda.orcamentos_galpao.codigo}`
      : "Venda direta";

  const enderecoCliente = [cliente?.endereco, cliente?.numero, cliente?.bairro]
    .filter(Boolean)
    .join(", ");
  const cidadeUfCliente = [cliente?.cidade, cliente?.uf].filter(Boolean).join("/");

  function nomeItem(item) {
    return (
      item.produtos?.nome ||
      item.composicoes_galpao?.nome ||
      item.descricao_livre ||
      "Item removido"
    );
  }
  function unidadeItem(item) {
    return item.produtos?.unidade || item.composicoes_galpao?.unidade || item.unidade_livre || "-";
  }

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

      <h1 className="text-center text-lg font-bold mb-6">Pedido de Venda Nº {venda.id}</h1>

      {/* Cliente + dados da venda */}
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
            <span className="font-semibold">Data da venda:</span>{" "}
            {formatarDataHora(venda.created_at)}
          </p>
          <p>
            <span className="font-semibold">Origem:</span> {origem}
          </p>
          <p>
            <span className="font-semibold">Vendedor:</span> {vendedor}
          </p>
        </div>
      </div>

      {/* Itens */}
      <p className="font-semibold text-xs text-slate-500 mb-1">ITENS DA VENDA</p>
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-2 py-1.5 text-left">Descrição</th>
            <th className="border border-slate-400 px-2 py-1.5 text-left">Un.</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Qtd.</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Valor unitário</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              <td className="border border-slate-300 px-2 py-1.5">{nomeItem(item)}</td>
              <td className="border border-slate-300 px-2 py-1.5">{unidadeItem(item)}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{item.quantidade}</td>
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
              <td className="px-2 py-0.5 text-right">{formatarMoeda(subtotal)}</td>
            </tr>
            <tr className="border-t border-slate-400">
              <td className="px-2 py-1 font-bold">Total da venda</td>
              <td className="px-2 py-1 text-right font-bold">{formatarMoeda(venda.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Assinaturas */}
      {empresa.rodape && (
        <div className="mt-8 pt-3 border-t border-slate-300 text-[11px] text-slate-600 whitespace-pre-line">
          {empresa.rodape}
        </div>
      )}
      <div className="mt-16 grid grid-cols-2 gap-10 text-xs">
        <div className="text-center">
          <div className="border-t border-slate-800 pt-2">
            {config?.assinatura_base64 && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={config.assinatura_base64}
                alt="Assinatura"
                className="max-h-16 mx-auto mb-1 -mt-16"
              />
            )}
            <p>{config?.nome_diretor || empresa.nome}</p>
            <p className="text-slate-500">MR7 Pré-Moldados</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-slate-800 pt-2">
            <p>{cliente?.nome || "Cliente"}</p>
            <p className="text-slate-500">Cliente</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ImprimirVendaPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Carregando...</p>}>
      <ConteudoImpressao />
    </Suspense>
  );
}
