"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";
import { LinhasEsqueleto } from "@/components/Ui";

// ============================================================================
// Relatórios: resumo do mês (com comparação ao mês anterior), funil de
// orçamentos com motivos de perda, top clientes, produtos mais vendidos e
// evolução dos últimos 12 meses. Botão Imprimir sai limpo (o menu some).
// ============================================================================

function formatarMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesmoMes(dataIso, ano, mes) {
  if (!dataIso) return false;
  const d = new Date(dataIso);
  return d.getFullYear() === ano && d.getMonth() === mes;
}

function rotuloMes(ano, mes) {
  return new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// Variação percentual vs mês anterior, com guarda para divisão por zero
function Variacao({ atual, anterior }) {
  if (!anterior) {
    return <span className="text-xs text-slate-400">— sem base no mês anterior</span>;
  }
  const pct = ((atual - anterior) / anterior) * 100;
  const subiu = pct > 0.05;
  const caiu = pct < -0.05;
  const Icone = subiu ? TrendingUp : caiu ? TrendingDown : Minus;
  const cor = subiu ? "text-emerald-600" : caiu ? "text-red-600" : "text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cor}`}>
      <Icone size={13} />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1).replace(".", ",")}% vs mês anterior
    </span>
  );
}

function RelatoriosPage() {
  const hoje = new Date();
  const [mesAno, setMesAno] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  );
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [vendas, setVendas] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [orcamentosGalpao, setOrcamentosGalpao] = useState([]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const [rV, rO, rG] = await Promise.all([
        supabase
          .from("vendas")
          .select("id, total, created_at, clientes(nome), itens_venda(quantidade, produtos(nome, unidade))"),
        supabase.from("orcamentos").select("codigo, status, motivo_recusa, total, created_at"),
        supabase.from("orcamentos_galpao").select("codigo, status, motivo_recusa, total, created_at"),
      ]);
      if (!ativo) return;
      if (rV.error || rO.error || rG.error) {
        setErro("Não foi possível carregar os dados. Recarregue a página.");
      } else {
        setVendas(rV.data || []);
        setOrcamentos(rO.data || []);
        setOrcamentosGalpao(rG.data || []);
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const [anoSel, mesSel] = mesAno.split("-").map(Number);
  const ano = anoSel;
  const mes = (mesSel || 1) - 1;
  const anoAnt = mes === 0 ? ano - 1 : ano;
  const mesAnt = mes === 0 ? 11 : mes - 1;

  const dados = useMemo(() => {
    const vendasMes = vendas.filter((v) => mesmoMes(v.created_at, ano, mes));
    const vendasAnt = vendas.filter((v) => mesmoMes(v.created_at, anoAnt, mesAnt));
    const fat = vendasMes.reduce((s, v) => s + Number(v.total || 0), 0);
    const fatAnt = vendasAnt.reduce((s, v) => s + Number(v.total || 0), 0);
    const ticket = vendasMes.length ? fat / vendasMes.length : 0;
    const ticketAnt = vendasAnt.length ? fatAnt / vendasAnt.length : 0;

    // Funil: dos orçamentos CRIADOS no mês (produtos + galpão), como terminaram
    const todosOrcs = [...orcamentos, ...orcamentosGalpao];
    const criados = todosOrcs.filter((o) => mesmoMes(o.created_at, ano, mes));
    const aprovados = criados.filter((o) => o.status === "aprovado");
    const perdidos = criados.filter((o) => o.status === "recusado");
    const emAberto = criados.length - aprovados.length - perdidos.length;
    const conversao = criados.length ? (aprovados.length / criados.length) * 100 : 0;

    const motivos = {};
    perdidos.forEach((o) => {
      const chave = (o.motivo_recusa || "sem motivo informado").split(" — ")[0];
      motivos[chave] = (motivos[chave] || 0) + 1;
    });

    // Top clientes do mês (por valor)
    const porCliente = {};
    vendasMes.forEach((v) => {
      const nome = v.clientes?.nome || "Sem cliente";
      porCliente[nome] = (porCliente[nome] || 0) + Number(v.total || 0);
    });
    const topClientes = Object.entries(porCliente)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Produtos mais vendidos do mês (por quantidade)
    const porProduto = {};
    vendasMes.forEach((v) => {
      (v.itens_venda || []).forEach((i) => {
        const nome = i.produtos?.nome || "Item";
        if (!porProduto[nome]) porProduto[nome] = { qtd: 0, un: i.produtos?.unidade || "" };
        porProduto[nome].qtd += Number(i.quantidade || 0);
      });
    });
    const topProdutos = Object.entries(porProduto)
      .sort((a, b) => b[1].qtd - a[1].qtd)
      .slice(0, 5);

    // Últimos 12 meses de faturamento (terminando no mês selecionado)
    const meses12 = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(ano, mes - k, 1);
      const total = vendas
        .filter((v) => mesmoMes(v.created_at, d.getFullYear(), d.getMonth()))
        .reduce((s, v) => s + Number(v.total || 0), 0);
      meses12.push({
        rotulo: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        total,
      });
    }
    const maior12 = Math.max(...meses12.map((m) => m.total), 1);

    return {
      vendasMes,
      fat,
      fatAnt,
      qtdAnt: vendasAnt.length,
      ticket,
      ticketAnt,
      criados,
      aprovados,
      perdidos,
      emAberto,
      conversao,
      motivos,
      topClientes,
      topProdutos,
      meses12,
      maior12,
    };
  }, [vendas, orcamentos, orcamentosGalpao, ano, mes, anoAnt, mesAnt]);

  const cardClasse = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none";

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:mb-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500 capitalize">{rotuloMes(ano, mes)}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <input
            type="month"
            value={mesAno}
            onChange={(e) => e.target.value && setMesAno(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 transition"
          >
            <Printer size={15} /> Imprimir
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      {loading ? (
        <div className={cardClasse}>
          <LinhasEsqueleto linhas={6} />
        </div>
      ) : (
        <div className="space-y-5 print:space-y-3">
          {/* ---------- Resumo do mês ---------- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
            <div className={cardClasse}>
              <p className="text-xs text-slate-500 mb-1">Faturamento do mês</p>
              <p className="text-2xl font-bold text-slate-900">{formatarMoeda(dados.fat)}</p>
              <Variacao atual={dados.fat} anterior={dados.fatAnt} />
            </div>
            <div className={cardClasse}>
              <p className="text-xs text-slate-500 mb-1">Vendas realizadas</p>
              <p className="text-2xl font-bold text-slate-900">{dados.vendasMes.length}</p>
              <Variacao atual={dados.vendasMes.length} anterior={dados.qtdAnt} />
            </div>
            <div className={cardClasse}>
              <p className="text-xs text-slate-500 mb-1">Ticket médio</p>
              <p className="text-2xl font-bold text-slate-900">{formatarMoeda(dados.ticket)}</p>
              <Variacao atual={dados.ticket} anterior={dados.ticketAnt} />
            </div>
          </div>

          {/* ---------- Funil de orçamentos ---------- */}
          <div className={cardClasse}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Orçamentos criados no mês — como terminaram
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{dados.criados.length}</p>
                <p className="text-xs text-slate-500">criados</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-xl font-bold text-emerald-700">{dados.aprovados.length}</p>
                <p className="text-xs text-emerald-700">viraram venda</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{dados.emAberto}</p>
                <p className="text-xs text-amber-700">em aberto</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-3 text-center">
                <p className="text-xl font-bold text-rose-700">{dados.perdidos.length}</p>
                <p className="text-xs text-rose-700">perdidos</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Taxa de conversão:{" "}
              <b className="text-slate-900">{dados.conversao.toFixed(0)}%</b> dos orçamentos criados
              no mês viraram venda.
            </p>
            {dados.perdidos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Por que perdemos</p>
                <div className="space-y-1">
                  {Object.entries(dados.motivos)
                    .sort((a, b) => b[1] - a[1])
                    .map(([motivo, qtd]) => (
                      <div key={motivo} className="flex justify-between text-sm text-slate-600">
                        <span className="capitalize">{motivo}</span>
                        <span className="font-medium">{qtd}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- Top clientes + produtos ---------- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
            <div className={cardClasse}>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Top clientes do mês</h2>
              {dados.topClientes.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma venda no mês.</p>
              ) : (
                <div className="space-y-2">
                  {dados.topClientes.map(([nome, valor]) => (
                    <div key={nome} className="flex justify-between items-baseline text-sm">
                      <span className="text-slate-700 truncate mr-2">{nome}</span>
                      <span className="font-medium text-slate-900 whitespace-nowrap">
                        {formatarMoeda(valor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={cardClasse}>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Produtos mais vendidos no mês
              </h2>
              {dados.topProdutos.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum item vendido no mês.</p>
              ) : (
                <div className="space-y-2">
                  {dados.topProdutos.map(([nome, info]) => (
                    <div key={nome} className="flex justify-between items-baseline text-sm">
                      <span className="text-slate-700 truncate mr-2">{nome}</span>
                      <span className="font-medium text-slate-900 whitespace-nowrap">
                        {info.qtd.toLocaleString("pt-BR")} {info.un}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------- Últimos 12 meses ---------- */}
          <div className={cardClasse}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Faturamento — últimos 12 meses
            </h2>
            <div className="space-y-1.5">
              {dados.meses12.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-14 text-slate-500 capitalize whitespace-nowrap">{m.rotulo}</span>
                  <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                    <div
                      className={`h-full rounded ${i === 11 ? "bg-emerald-500" : "bg-slate-300"}`}
                      style={{ width: `${Math.max((m.total / dados.maior12) * 100, m.total > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-slate-600 whitespace-nowrap">
                    {formatarMoeda(m.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="hidden print:block text-[10px] text-slate-400 text-center">
            Relatório gerado pelo sistema MR7 Pré-Moldados em {new Date().toLocaleDateString("pt-BR")}.
          </p>
        </div>
      )}
    </div>
  );
}

// Porteiro: esta tela é exclusiva de administradores.
export default function RelatoriosPageProtegida() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <RelatoriosPage />;
}
