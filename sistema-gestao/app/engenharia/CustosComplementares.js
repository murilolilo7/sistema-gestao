"use client";

import { resumoComplementares, CONSOLOS } from "./custos-complementares";

// =====================================================================
// CUSTOS COMPLEMENTARES — campos que o Murilo preenche aos poucos. Cada um
// salva ao sair do campo; zero = ainda não informado. Entram no custo
// completo do pilar mostrado na comparação do orçamento (cálculo novo,
// em teste) — o preço do orçamento continua pelo m³.
// =====================================================================

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
// Aceita "15.000", "15.000,50", "8,5" e "8.5"
export const lerNumeroBR = (v) => {
  const s = String(v ?? "").trim().replace(/[R$\s%]/g, "");
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, "")) || 0;
  return Number(s) || 0;
};
const txt = (v) => (v === null || v === undefined || Number(v) === 0 ? "" : String(v).replace(".", ","));

const GRUPOS = [
  {
    titulo: "Perdas",
    explicacao: "O que se perde na produção (pontas de barra, sobra de concreto). Comum: aço 5 a 10%, concreto 3 a 5%.",
    campos: [
      { campo: "perda_aco_pct", rotulo: "Perda de aço", unidade: "%" },
      { campo: "perda_concreto_pct", rotulo: "Perda de concreto", unidade: "%" },
    ],
  },
  {
    titulo: "Forma e desmoldante",
    explicacao: "A forma se paga ao longo dos usos: custo da forma ÷ quantas vezes ela é usada, mais o desmoldante de cada pilar.",
    campos: [
      { campo: "forma_pilar_custo", rotulo: "Custo da forma do pilar", unidade: "R$" },
      { campo: "forma_pilar_usos", rotulo: "Quantas vezes é usada", unidade: "usos" },
      { campo: "desmoldante_por_pilar", rotulo: "Desmoldante por pilar", unidade: "R$" },
    ],
    resultado: (r) => (r.formaPorPilar > 0 ? `= ${moeda(r.formaPorPilar)} por pilar` : null),
  },
  {
    titulo: "Energia",
    explicacao: "Conta de luz média do mês dividida pelo que a fábrica produz no mês.",
    campos: [
      { campo: "energia_mensal", rotulo: "Conta de luz por mês", unidade: "R$" },
      { campo: "producao_m3_mes", rotulo: "Produção por mês", unidade: "m³" },
    ],
    resultado: (r) => (r.energiaPorM3 > 0 ? `= ${moeda(r.energiaPorM3)} por m³` : null),
  },
  {
    titulo: "Consolos",
    explicacao: `O aço e o concreto já vêm dos projetos (dente da tesoura ≈ ${CONSOLOS.tesoura.acoKg} kg; consolo da viga da laje ≈ ${CONSOLOS.viga.acoKg} kg + ${String(CONSOLOS.viga.concretoM3).replace(".", ",")} m³). Falta o tempo da equipe do pilar para fazer um consolo.`,
    campos: [{ campo: "consolo_minutos", rotulo: "Tempo para fazer um consolo", unidade: "min" }],
  },
  {
    titulo: "Administração, impostos e lucro (BDI)",
    explicacao:
      "Despesas fixas do mês (escritório, salários fora da produção, aluguel, veículos…) sobre o faturamento médio, mais o imposto e o lucro que você quer. Preço = custo ÷ (1 − despesas − imposto − lucro).",
    campos: [
      { campo: "despesas_fixas_mensal", rotulo: "Despesas fixas por mês", unidade: "R$" },
      { campo: "faturamento_mensal", rotulo: "Faturamento médio por mês", unidade: "R$" },
      { campo: "impostos_pct", rotulo: "Impostos sobre a venda", unidade: "%" },
      { campo: "lucro_pct", rotulo: "Lucro desejado", unidade: "%" },
    ],
    resultado: (r) =>
      r.bdiInvalido
        ? "⚠ Despesas + imposto + lucro chegam a 100% ou mais — confira os valores."
        : r.somaPct > 0
          ? `Despesas ${pct(r.despesasPct)} + imposto + lucro = ${pct(r.somaPct)} do preço → BDI de ${pct(r.bdiPct)} sobre o custo`
          : null,
  },
];

export default function CustosComplementares({ param, salvarParametro }) {
  if (!param) return null;
  const r = resumoComplementares(param);
  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50/40 p-5">
      <p className="text-sm font-semibold text-slate-700 mb-1">Custos complementares do pilar (em teste)</p>
      <p className="text-xs text-slate-500 mb-4">
        O que ainda não entrava no custo de fábrica. Preencha aos poucos — cada campo salva ao sair dele e já
        aparece no quadro de comparação do pilar dentro do orçamento. Campo vazio = ainda não informado. O preço
        do orçamento continua pelo valor do m³.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {GRUPOS.map((g) => {
          const res = g.resultado ? g.resultado(r) : null;
          return (
            <div key={g.titulo} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-800">{g.titulo}</p>
              <p className="text-[11px] text-slate-500 mb-2">{g.explicacao}</p>
              <div className="flex flex-wrap gap-3">
                {g.campos.map((c) => (
                  <div key={c.campo}>
                    <label className="block text-[11px] text-slate-500 mb-0.5">{c.rotulo}</label>
                    <div className="flex items-center gap-1">
                      {c.unidade === "R$" && <span className="text-xs text-slate-400">R$</span>}
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={txt(param[c.campo])}
                        placeholder="—"
                        onBlur={(e) => {
                          const atual = txt(param[c.campo]);
                          if (e.target.value.trim() !== atual) salvarParametro(c.campo, lerNumeroBR(e.target.value));
                        }}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      {c.unidade !== "R$" && <span className="text-xs text-slate-400">{c.unidade}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {res && (
                <p className={`mt-2 text-xs ${r.bdiInvalido && g.titulo.includes("BDI") ? "text-rose-700" : "text-violet-800"}`}>
                  {res}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
