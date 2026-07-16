"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Package,
  ShoppingCart,
  FileText,
  Warehouse,
  Tags,
  TrendingUp,
  AlertTriangle,
  Clock,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function moedaCompacta(valor) {
  const n = Number(valor || 0);
  if (n >= 1000000) return `R$ ${(n / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatarMoeda(n);
}

function diasAteVencer(validade) {
  if (!validade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(validade + "T00:00:00");
  return Math.round((v - hoje) / 86400000);
}

const ATALHOS = [
  { href: "/orcamentos-galpao", label: "Orçamento de galpão", icone: Warehouse },
  { href: "/orcamentos", label: "Orçamento de produtos", icone: FileText },
  { href: "/clientes", label: "Cliente", icone: Users },
  { href: "/produtos", label: "Produto", icone: Package },
];

const MODULOS = [
  { href: "/clientes", label: "Clientes", icone: Users, cor: "text-sky-600 bg-sky-50" },
  { href: "/produtos", label: "Produtos", icone: Package, cor: "text-violet-600 bg-violet-50" },
  { href: "/vendas", label: "Vendas", icone: ShoppingCart, cor: "text-emerald-600 bg-emerald-50" },
  { href: "/orcamentos", label: "Orçamentos", icone: FileText, cor: "text-amber-600 bg-amber-50" },
  { href: "/orcamentos-galpao", label: "Orçamentos Galpão", icone: Warehouse, cor: "text-teal-600 bg-teal-50" },
  { href: "/precos", label: "Preços", icone: Tags, cor: "text-rose-600 bg-rose-50" },
];

export default function Home() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [vendas, setVendas] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [orcamentosGalpao, setOrcamentosGalpao] = useState([]);
  const [produtos, setProdutos] = useState([]);

  useEffect(() => {
    async function carregar() {
      const [rVendas, rOrc, rOrcG, rProd] = await Promise.all([
        supabase.from("vendas").select("id, total, created_at"),
        supabase
          .from("orcamentos")
          .select("codigo, status, validade, total, created_at, clientes(nome)"),
        supabase
          .from("orcamentos_galpao")
          .select("codigo, status, validade, total, created_at, titulo, clientes(nome)"),
        supabase.from("produtos").select("id, nome, quantidade_estoque, estoque_minimo"),
      ]);
      const falha = rVendas.error || rOrc.error || rOrcG.error || rProd.error;
      if (falha) {
        setErro("Não foi possível carregar os indicadores: " + falha.message);
      } else {
        setVendas(rVendas.data || []);
        setOrcamentos(rOrc.data || []);
        setOrcamentosGalpao(rOrcG.data || []);
        setProdutos(rProd.data || []);
      }
      setCarregando(false);
    }
    carregar();
  }, []);

  // ---------------- Indicadores ----------------
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const vendasMes = vendas.filter((v) => new Date(v.created_at) >= inicioMes);
  const faturamentoMes = vendasMes.reduce((s, v) => s + Number(v.total || 0), 0);
  const ticketMedio = vendasMes.length > 0 ? faturamentoMes / vendasMes.length : 0;

  const todosOrcamentos = [
    ...orcamentos.map((o) => ({ ...o, tipo: "produtos", rota: "/orcamentos" })),
    ...orcamentosGalpao.map((o) => ({ ...o, tipo: "galpão", rota: "/orcamentos-galpao" })),
  ];
  const pendentesValidos = todosOrcamentos.filter((o) => {
    if (o.status !== "pendente") return false;
    const dias = diasAteVencer(o.validade);
    return dias === null || dias >= 0;
  });
  const valorEmPropostas = pendentesValidos.reduce((s, o) => s + Number(o.total || 0), 0);

  // Conversão dos últimos 90 dias: aprovados ÷ criados
  const ha90dias = new Date(agora.getTime() - 90 * 86400000);
  const criados90 = todosOrcamentos.filter((o) => new Date(o.created_at) >= ha90dias);
  const aprovados90 = criados90.filter((o) => o.status === "aprovado");
  const conversao = criados90.length > 0 ? Math.round((aprovados90.length / criados90.length) * 100) : null;

  // Vencendo nos próximos 7 dias (pendentes)
  const vencendo = todosOrcamentos
    .filter((o) => {
      if (o.status !== "pendente") return false;
      const dias = diasAteVencer(o.validade);
      return dias !== null && dias >= 0 && dias <= 7;
    })
    .sort((a, b) => diasAteVencer(a.validade) - diasAteVencer(b.validade))
    .slice(0, 6);

  // ---------------- Produtos com estoque baixo ----------------
  const estoqueBaixo = produtos.filter(
    (p) => (p.estoque_minimo ?? 0) > 0 && (p.quantidade_estoque ?? 0) <= p.estoque_minimo
  );

  // ---------------- Gráfico: vendas dos últimos 6 meses ----------------
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const proximo = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    const soma = vendas
      .filter((v) => {
        const c = new Date(v.created_at);
        return c >= d && c < proximo;
      })
      .reduce((s, v) => s + Number(v.total || 0), 0);
    meses.push({
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      valor: soma,
    });
  }
  const maiorMes = Math.max(1, ...meses.map((m) => m.valor));

  const cartoes = [
    {
      rotulo: "Vendas no mês",
      valor: formatarMoeda(faturamentoMes),
      detalhe: `${vendasMes.length} venda(s) · ticket médio ${moedaCompacta(ticketMedio)}`,
      icone: TrendingUp,
      cor: "text-emerald-600 bg-emerald-50",
    },
    {
      rotulo: "Propostas em aberto",
      valor: formatarMoeda(valorEmPropostas),
      detalhe: `${pendentesValidos.length} orçamento(s) pendente(s)`,
      icone: FileText,
      cor: "text-sky-600 bg-sky-50",
    },
    {
      rotulo: "Conversão (90 dias)",
      valor: conversao === null ? "—" : `${conversao}%`,
      detalhe: `${aprovados90.length} de ${criados90.length} orçamentos viraram venda`,
      icone: ShoppingCart,
      cor: "text-violet-600 bg-violet-50",
    },
    {
      rotulo: "Vencendo em 7 dias",
      valor: String(vencendo.length),
      detalhe: vencendo.length > 0 ? "propostas precisando de retorno" : "nenhuma proposta vencendo",
      icone: Clock,
      cor: vencendo.length > 0 ? "text-amber-600 bg-amber-50" : "text-slate-500 bg-slate-100",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-0.5">Painel principal</h1>
          <p className="text-slate-500 text-sm">
            Visão geral do negócio ·{" "}
            {agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ATALHOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 transition"
            >
              <Plus size={14} />
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {erro}
        </div>
      )}

      {/* -------- Cartões de indicadores -------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {carregando
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="h-3 w-20 bg-slate-100 rounded animate-pulse mb-3" />
                <div className="h-6 w-28 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            ))
          : cartoes.map((c) => (
              <div key={c.rotulo} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500">{c.rotulo}</p>
                  <span className={`p-1.5 rounded-lg ${c.cor}`}>
                    <c.icone size={15} />
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-900 leading-tight">{c.valor}</p>
                <p className="text-[11px] text-slate-400 mt-1">{c.detalhe}</p>
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* -------- Gráfico de vendas (6 meses) -------- */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Vendas dos últimos 6 meses</h2>
          {carregando ? (
            <div className="h-40 bg-slate-50 rounded animate-pulse" />
          ) : (
            <div className="flex items-end justify-between gap-2 h-44">
              {meses.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {m.valor > 0 ? moedaCompacta(m.valor) : ""}
                  </span>
                  <div
                    className={`w-full max-w-[46px] rounded-t-md transition-all ${
                      m.valor > 0 ? "bg-emerald-500" : "bg-slate-100"
                    }`}
                    style={{ height: `${Math.max(3, (m.valor / maiorMes) * 100)}%` }}
                  />
                  <span className="text-[11px] text-slate-500 capitalize">{m.rotulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -------- Precisa de atenção -------- */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-amber-500" />
            Precisa de atenção
          </h2>
          {carregando ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
              ))}
            </div>
          ) : vencendo.length === 0 && estoqueBaixo.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Tudo em dia — nada vencendo e estoque saudável. 🎉
            </p>
          ) : (
            <div className="space-y-1.5">
              {estoqueBaixo.length > 0 && (
                <Link
                  href="/produtos"
                  className="flex items-center justify-between gap-2 rounded-lg border border-red-100 bg-red-50/50 hover:border-red-300 px-3 py-2 transition"
                >
                  <span className="text-sm text-red-700 truncate">
                    {estoqueBaixo.length} produto(s) com estoque baixo
                  </span>
                  <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    repor
                  </span>
                </Link>
              )}
              {vencendo.map((o) => {
                const dias = diasAteVencer(o.validade);
                return (
                  <Link
                    key={`${o.tipo}-${o.codigo}`}
                    href={`${o.rota}?editar=${o.codigo}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50/50 px-3 py-2 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        Nº {o.codigo} · {o.clientes?.nome || "Cliente"}
                        <span className="text-slate-400"> · {o.tipo}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">{formatarMoeda(o.total)}</p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold whitespace-nowrap px-2 py-0.5 rounded-full ${
                        dias <= 2 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {dias === 0 ? "vence hoje" : `${dias} dia(s)`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* -------- Módulos -------- */}
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Módulos do sistema</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition flex flex-col items-center gap-2 text-center"
          >
            <span className={`p-2.5 rounded-xl ${m.cor}`}>
              <m.icone size={20} />
            </span>
            <span className="text-xs font-medium text-slate-700">{m.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
