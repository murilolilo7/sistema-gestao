"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";

const NOMES_TABELA = {
  insumos: "Insumo",
  mao_de_obra: "Mão de obra",
  composicoes_galpao: "Peça de galpão",
};

const NOMES_ACAO = {
  INSERT: "Incluído",
  UPDATE: "Alterado",
  DELETE: "Excluído",
};

const CORES_ACAO = {
  INSERT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-rose-50 text-rose-700 border-rose-200",
};

const CAMPOS_IGNORADOS = ["id", "codigo", "created_at"];

const NOMES_CAMPO = {
  nome: "Nome",
  unidade: "Unidade",
  valor_unitario: "Valor unitário",
  funcao: "Função",
  salario_bruto: "Salário bruto",
  encargos_pct: "Encargos (%)",
  base_horas_mes: "Base horas/mês",
  valor_hora: "Valor/hora",
  custo: "Custo",
  preco: "Preço de venda",
  papel: "Categoria",
  bdi_pct: "BDI (%)",
  comprimento_referencia: "Comprimento de referência",
};

function formatarValor(valor) {
  if (valor === null || valor === undefined) return "-";
  if (typeof valor === "number") return String(valor);
  return String(valor);
}

function calcularDiferencas(antigo, novo) {
  if (!antigo || !novo) return [];
  const diffs = [];
  const chaves = new Set([...Object.keys(antigo), ...Object.keys(novo)]);
  for (const chave of chaves) {
    if (CAMPOS_IGNORADOS.includes(chave)) continue;
    if (String(antigo[chave] ?? "") !== String(novo[chave] ?? "")) {
      diffs.push({
        campo: NOMES_CAMPO[chave] || chave,
        de: formatarValor(antigo[chave]),
        para: formatarValor(novo[chave]),
      });
    }
  }
  return diffs;
}

function formatarDataHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoricoPrecosPage() {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [termoBusca, setTermoBusca] = useState("");

  function buscarHistorico() {
    return supabase
      .from("historico_alteracoes_precos")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(300);
  }

  useEffect(() => {
    let ativo = true;
    buscarHistorico().then(({ data, error }) => {
      if (!ativo) return;
      if (error) setErro("Não foi possível carregar o histórico: " + error.message);
      else setRegistros(data || []);
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const registrosFiltrados = registros.filter((r) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      r.nome_item?.toLowerCase().includes(termo) ||
      r.nome_usuario?.toLowerCase().includes(termo)
    );
  });

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Histórico de Preços</h1>
      <p className="text-slate-500 mb-6">
        Todo mundo pode ver quem alterou o quê em Insumos, Mão de obra e Peças de galpão.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      <input
        type="text"
        value={termoBusca}
        onChange={(e) => setTermoBusca(e.target.value)}
        placeholder="Pesquisar por item ou por quem alterou..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : registrosFiltrados.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum registro encontrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {registrosFiltrados.map((r) => {
            const diffs = r.acao === "UPDATE" ? calcularDiferencas(r.dados_antigos, r.dados_novos) : [];
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${CORES_ACAO[r.acao] || ""}`}
                    >
                      {NOMES_ACAO[r.acao] || r.acao}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{r.nome_item}</span>
                    <span className="text-xs text-slate-400">
                      ({NOMES_TABELA[r.tabela] || r.tabela})
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {formatarDataHora(r.criado_em)} — {r.nome_usuario}
                  </div>
                </div>
                {diffs.length > 0 && (
                  <ul className="text-xs text-slate-600 mt-2 space-y-0.5">
                    {diffs.map((d, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{d.campo}:</span> {d.de} → {d.para}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Porteiro: esta tela é exclusiva de administradores.
export default function HistoricoPrecosPageProtegida() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <HistoricoPrecosPage />;
}
