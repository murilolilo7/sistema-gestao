"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Printer, Download, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { LinhasEsqueleto, EstadoVazio, notificar } from "@/components/Ui";

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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

function chaveMes(dataIso) {
  const d = new Date(dataIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rotuloMes(chave) {
  const [ano, mes] = chave.split("-");
  return `${NOMES_MESES[Number(mes) - 1]} de ${ano}`;
}

function agruparPorMes(vendas) {
  const grupos = {};
  for (const v of vendas) {
    if (!v.created_at) continue;
    const chave = chaveMes(v.created_at);
    if (!grupos[chave]) {
      grupos[chave] = { chave, quantidade: 0, total: 0 };
    }
    grupos[chave].quantidade += 1;
    grupos[chave].total += Number(v.total || 0);
  }
  return Object.values(grupos).sort((a, b) => (a.chave < b.chave ? 1 : -1));
}

export default function VendasPage() {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [expandidoId, setExpandidoId] = useState(null);
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroDataIni, setFiltroDataIni] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  function buscarVendas() {
    return supabase
      .from("vendas")
      .select(
        "*, clientes(nome), orcamentos(codigo, vendedor), orcamentos_galpao(codigo, vendedor, titulo), itens_venda(id, quantidade, preco_unitario, descricao_livre, produtos(nome), composicoes_galpao(nome))"
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

  // ---------- Filtros ----------
  const mesesDisponiveis = [...new Set(vendas.map((v) => chaveMes(v.created_at)))].sort(
    (a, b) => (a < b ? 1 : -1)
  );
  const clientesDisponiveis = [
    ...new Map(
      vendas
        .filter((v) => v.cliente_id)
        .map((v) => [v.cliente_id, v.clientes?.nome || `Cliente ${v.cliente_id}`])
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const vendasFiltradas = vendas.filter((v) => {
    if (filtroMes !== "todos" && chaveMes(v.created_at) !== filtroMes) return false;
    // Período por data (inclusivo): compara só a parte AAAA-MM-DD
    const dia = (v.created_at || "").slice(0, 10);
    if (filtroDataIni && dia < filtroDataIni) return false;
    if (filtroDataFim && dia > filtroDataFim) return false;
    if (filtroCliente !== "todos" && String(v.cliente_id) !== String(filtroCliente))
      return false;
    return true;
  });

  const totalFiltrado = vendasFiltradas.reduce((soma, v) => soma + Number(v.total || 0), 0);
  const ticketMedio = vendasFiltradas.length > 0 ? totalFiltrado / vendasFiltradas.length : 0;
  const resumoMensal = agruparPorMes(vendasFiltradas);
  const temFiltro =
    filtroMes !== "todos" || filtroCliente !== "todos" || filtroDataIni !== "" || filtroDataFim !== "";

  // ---------- Exportar CSV (abre direto no Excel) ----------
  function exportarCsv() {
    if (vendasFiltradas.length === 0) return;
    const linhas = [
      ["Data", "Cliente", "Origem", "Vendedor", "Total (R$)"],
      ...vendasFiltradas.map((v) => [
        formatarDataHora(v.created_at),
        v.clientes?.nome || "-",
        v.orcamentos?.codigo
          ? `Orcamento ${v.orcamentos.codigo}`
          : v.orcamentos_galpao?.codigo
            ? `Orcamento Galpao ${v.orcamentos_galpao.codigo}`
            : "-",
        v.orcamentos?.vendedor || v.orcamentos_galpao?.vendedor || "-",
        Number(v.total || 0).toFixed(2).replace(".", ","),
      ]),
    ];
    // Ponto e vírgula + BOM: padrão que o Excel brasileiro abre certinho
    const csv = "\uFEFF" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas${filtroMes !== "todos" ? "-" + filtroMes : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notificar(`${vendasFiltradas.length} venda(s) exportada(s) para CSV.`);
  }

  const campoClasse =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Vendas</h1>
      <p className="text-slate-500 mb-6">
        Histórico de vendas geradas a partir de orçamentos aprovados.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      {/* ---------- Filtros + exportar ---------- */}
      {!loading && vendas.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className={campoClasse}
          >
            <option value="todos">Todos os meses</option>
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
              </option>
            ))}
          </select>
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className={campoClasse}
          >
            <option value="todos">Todos os clientes</option>
            {clientesDisponiveis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <span className="text-xs">de</span>
            <input
              type="date"
              value={filtroDataIni}
              onChange={(e) => setFiltroDataIni(e.target.value)}
              className={campoClasse}
              title="Data inicial do período"
            />
            <span className="text-xs">até</span>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className={campoClasse}
              title="Data final do período"
            />
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={() => {
                setFiltroMes("todos");
                setFiltroCliente("todos");
                setFiltroDataIni("");
                setFiltroDataFim("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg px-3 py-2"
            >
              Limpar filtros
            </button>
          )}
          <button
            type="button"
            onClick={exportarCsv}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-2 transition"
          >
            <Download size={14} />
            Exportar CSV ({vendasFiltradas.length})
          </button>
        </div>
      )}

      {/* ---------- Cartões do período ---------- */}
      {!loading && vendas.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3 max-w-2xl">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">
              Vendas{temFiltro ? " (filtro)" : ""}
            </p>
            <p className="text-lg font-semibold">{vendasFiltradas.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Faturamento</p>
            <p className="text-lg font-semibold">{formatarMoeda(totalFiltrado)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">Ticket médio</p>
            <p className="text-lg font-semibold">{formatarMoeda(ticketMedio)}</p>
          </div>
        </div>
      )}

      {!loading && resumoMensal.length > 1 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Faturamento por mês
          </p>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-4 py-2 font-medium">Nº de vendas</th>
                  <th className="px-4 py-2 font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {resumoMensal.map((r) => (
                  <tr key={r.chave} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      {rotuloMes(r.chave)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.quantidade}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatarMoeda(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-sm font-semibold text-slate-700 mb-2">
        {temFiltro ? "Vendas do filtro" : "Todas as vendas"}
      </p>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <LinhasEsqueleto linhas={5} />
        ) : vendas.length === 0 ? (
          <EstadoVazio
            icone={ShoppingCart}
            titulo="Nenhuma venda registrada ainda"
            texto="Vendas são criadas automaticamente ao converter um orçamento."
          />
        ) : vendasFiltradas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma venda para esse filtro"
            texto="Ajuste o mês ou o cliente acima."
          />
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
            {vendasFiltradas.map((v) => (
              <tbody key={v.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {v.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataHora(v.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {v.orcamentos?.codigo
                      ? `#${v.orcamentos.codigo}`
                      : v.orcamentos_galpao?.codigo
                        ? `Galpão #${v.orcamentos_galpao.codigo}`
                        : "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(v.total)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/vendas/imprimir?id=${v.id}`}
                        target="_blank"
                        className="text-slate-600 hover:text-slate-900"
                        title="Imprimir pedido de venda"
                      >
                        <Printer size={16} />
                      </Link>
                      <button
                        onClick={() =>
                          setExpandidoId(expandidoId === v.id ? null : v.id)
                        }
                        className="text-slate-600 hover:text-slate-900"
                        title={expandidoId === v.id ? "Ocultar itens" : "Ver itens"}
                      >
                        {expandidoId === v.id ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandidoId === v.id && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Itens vendidos
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {(v.itens_venda || []).map((item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.produtos?.nome ??
                              item.composicoes_galpao?.nome ??
                              item.descricao_livre ??
                              "item removido"}{" "}
                            — {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(item.quantidade * item.preco_unitario)}
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
