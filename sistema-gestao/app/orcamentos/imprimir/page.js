"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Dados fixos da empresa que aparecem no cabeçalho do orçamento impresso.
const EMPRESA = {
  nome: "MR7 PRÉ MOLDADOS LTDA",
  telefone: "(82) 98181-0774",
  endereco: "Rodovia AL485, Nº 400",
  cidadeUf: "57340000 - Feira Grande, AL",
  cnpj: "43.926.578/0001-86",
};

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

function ConteudoImpressao() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo");
  const [orcamento, setOrcamento] = useState(null);
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
      const { data, error } = await supabase
        .from("orcamentos")
        .select(
          "*, clientes(nome, cpf_cnpj, telefone, email, endereco, numero, bairro, cidade, uf, cep), itens_orcamento(id, quantidade, preco_unitario, produtos(nome, codigo, unidade))"
        )
        .eq("codigo", codigo)
        .single();
      if (!ativo) return;
      if (error) {
        setErro("Orçamento não encontrado.");
      } else {
        setOrcamento(data);
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [codigo]);

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Carregando...</p>;
  }
  if (erro) {
    return <p className="p-8 text-sm text-red-600">{erro}</p>;
  }
  if (!orcamento) return null;

  const itens = orcamento.itens_orcamento || [];
  const subtotal = itens.reduce(
    (soma, i) => soma + i.quantidade * Number(i.preco_unitario),
    0
  );
  const desconto = Number(orcamento.desconto || 0);
  const somaQtdes = itens.reduce((soma, i) => soma + Number(i.quantidade), 0);
  const cliente = orcamento.clientes;
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
        <div>
          <p className="font-bold text-xl">
            MR7 <span className="text-emerald-600">Pré-Moldados</span>
          </p>
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="font-semibold">{EMPRESA.nome}</p>
          <p>{EMPRESA.telefone}</p>
          <p>{EMPRESA.endereco}</p>
          <p>{EMPRESA.cidadeUf}</p>
          <p>CNPJ: {EMPRESA.cnpj}</p>
        </div>
      </div>

      <h1 className="text-center text-lg font-bold mb-6">
        Orçamento Nº {orcamento.codigo}
      </h1>

      {/* Cliente + dados do orçamento */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
        <div>
          <p className="font-semibold text-xs text-slate-500 mb-1">CLIENTE</p>
          <div className="border border-slate-300 rounded-md p-3">
            <p className="font-medium">{cliente?.nome || "Consumidor Final"}</p>
            {cliente?.cpf_cnpj && <p className="text-xs">{cliente.cpf_cnpj}</p>}
            {enderecoCliente && <p className="text-xs">{enderecoCliente}</p>}
            {cidadeUfCliente && <p className="text-xs">{cidadeUfCliente}</p>}
            {cliente?.telefone && <p className="text-xs">{cliente.telefone}</p>}
          </div>
        </div>
        <div className="border border-slate-300 rounded-md p-3 text-xs space-y-1">
          <p>
            <span className="font-semibold">Data:</span>{" "}
            {formatarDataHora(orcamento.created_at)}
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
            <span className="font-semibold">Status:</span>{" "}
            {orcamento.status === "aprovado" ? "Aprovado" : "Pendente"}
          </p>
        </div>
      </div>

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
              <td className="px-2 py-0.5 text-slate-500">Soma das quantidades</td>
              <td className="px-2 py-0.5 text-right">{somaQtdes}</td>
            </tr>
            <tr>
              <td className="px-2 py-0.5 text-slate-500">Subtotal</td>
              <td className="px-2 py-0.5 text-right">
                {formatarMoeda(subtotal)}
              </td>
            </tr>
            {desconto > 0 && (
              <tr>
                <td className="px-2 py-0.5 text-slate-500">Desconto</td>
                <td className="px-2 py-0.5 text-right">
                  − {formatarMoeda(desconto)}
                </td>
              </tr>
            )}
            <tr className="border-t border-slate-400">
              <td className="px-2 py-1 font-bold">Total do orçamento</td>
              <td className="px-2 py-1 text-right font-bold">
                {formatarMoeda(orcamento.total)}
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
