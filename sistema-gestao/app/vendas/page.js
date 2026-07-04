"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleString("pt-BR");
}

export default function VendasPage() {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [expandidoId, setExpandidoId] = useState(null);

  function buscarVendas() {
    return supabase
      .from("vendas")
      .select(
        "*, clientes(nome), itens_venda(id, quantidade, preco_unitario, produtos(nome))"
      )
      .order("id", { ascending: false });
  }

  function aplicarResultado(data, error) {
    if (error) {
      setErro("Não foi possível carregar as vendas: " + error.message);
    } else {
      setVendas(data);
    }
    setLoading(false);
  }

  // Resultado só é aplicado dentro do .then, fora da fase síncrona do
  // efeito (evita o aviso do React sobre setState síncrono em efeito).
  useEffect(() => {
    let ativo = true;
    buscarVendas().then(({ data, error }) => {
      if (ativo) aplicarResultado(data, error);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const totalGeral = vendas.reduce(
    (soma, v) => soma + Number(v.total || 0),
    0
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vendas</h1>
      <p className="text-slate-500 mb-6">
        Histórico de vendas geradas a partir de orçamentos aprovados.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      {!loading && vendas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Total de vendas</p>
            <p className="text-lg font-semibold">{vendas.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Faturamento total</p>
            <p className="text-lg font-semibold">
              {formatarMoeda(totalGeral)}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando vendas...</p>
        ) : vendas.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhuma venda registrada ainda. Vendas são criadas
            automaticamente ao converter um orçamento em Orçamentos.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Orçamento</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            {vendas.map((v) => (
              <tbody key={v.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {v.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataHora(v.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {v.orcamento_id ? `#${v.orcamento_id}` : "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(v.total)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() =>
                        setExpandidoId(expandidoId === v.id ? null : v.id)
                      }
                      className="text-slate-600 hover:text-slate-900 text-xs font-medium"
                    >
                      {expandidoId === v.id ? "Ocultar itens" : "Ver itens"}
                    </button>
                  </td>
                </tr>
                {expandidoId === v.id && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Produtos vendidos
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {(v.itens_venda || []).map((item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.produtos?.nome ?? "produto removido"} —{" "}
                            {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(
                              item.quantidade * item.preco_unitario
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </div>
  );
}
