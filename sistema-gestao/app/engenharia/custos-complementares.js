// =====================================================================
// CUSTOS COMPLEMENTARES DO PILAR — o que o custo de fábrica (concreto +
// aço + mão de obra) ainda não contava: perdas, forma, energia, consolos e
// o BDI (despesas fixas, impostos e lucro).
//
// Os valores ficam em parametros_engenharia e são preenchidos aos poucos na
// tela Engenharia de custos. Campo em zero = ainda não informado (não soma).
// Função pura, testada em custos-complementares.test.js.
// =====================================================================

// Consolos levantados dos projetos de fabricação (gabarito de pilares):
// dente da tesoura ≈ 2ø12,5 de 1,78 m + estribos (≈ 4 kg); consolo da viga
// da laje ≈ 2ø16 de 1,81–2,17 m + 4ø6,3 + 6ø10 (≈ 9 kg) e ~0,03 m³ de concreto.
export const CONSOLOS = {
  tesoura: { rotulo: "Consolo da tesoura (dente)", acoKg: 4, concretoM3: 0 },
  viga: { rotulo: "Consolo da viga da laje", acoKg: 9, concretoM3: 0.03 },
};

export const CAMPOS_COMPLEMENTARES = [
  "perda_aco_pct",
  "perda_concreto_pct",
  "forma_pilar_custo",
  "forma_pilar_usos",
  "desmoldante_por_pilar",
  "energia_mensal",
  "producao_m3_mes",
  "consolo_minutos",
  "despesas_fixas_mensal",
  "faturamento_mensal",
  "impostos_pct",
  "lucro_pct",
];

const n = (v) => Number(v) || 0;

// Valores derivados que a tela mostra ao lado dos campos
export function resumoComplementares(param = {}) {
  const formaPorPilar =
    (n(param.forma_pilar_usos) > 0 ? n(param.forma_pilar_custo) / n(param.forma_pilar_usos) : 0) +
    n(param.desmoldante_por_pilar);
  const energiaPorM3 = n(param.producao_m3_mes) > 0 ? n(param.energia_mensal) / n(param.producao_m3_mes) : 0;
  const despesasPct = n(param.faturamento_mensal) > 0 ? (n(param.despesas_fixas_mensal) / n(param.faturamento_mensal)) * 100 : 0;
  const somaPct = despesasPct + n(param.impostos_pct) + n(param.lucro_pct);
  // Preço = custo ÷ (1 − despesas − impostos − lucro): de cada R$ 100 vendidos,
  // uma parte paga as despesas fixas, outra o imposto e outra é o lucro.
  const bdiValido = somaPct > 0 && somaPct < 100;
  const bdiPct = bdiValido ? (1 / (1 - somaPct / 100) - 1) * 100 : 0;
  return {
    formaPorPilar,
    energiaPorM3,
    despesasPct,
    somaPct,
    bdiPct,
    bdiValido,
    bdiInvalido: somaPct >= 100,
  };
}

// Custo completo de uma peça sem consolos (ex.: tesoura): perdas, energia e
// BDI. A forma da tesoura ainda não tem campo próprio (fica "a preencher").
// base = { concreto, aco, maoDeObra, volume }
export function custoCompletoPeca(base, param = {}) {
  const r = resumoComplementares(param);
  const linhas = [];
  const add = (rotulo, valor, informado, dica) => linhas.push({ rotulo, valor, informado, dica });
  add("Concreto", base.concreto, true);
  add("Aço", base.aco, true);
  add("Mão de obra", base.maoDeObra, base.maoDeObraInformada !== false, "tempo de fabricação da tesoura");
  add(
    "Perda de concreto",
    base.concreto * (n(param.perda_concreto_pct) / 100),
    n(param.perda_concreto_pct) > 0,
    "% de perda de concreto"
  );
  add("Perda de aço", base.aco * (n(param.perda_aco_pct) / 100), n(param.perda_aco_pct) > 0, "% de perda de aço");
  add("Forma e desmoldante", 0, false, "forma da tesoura (ainda sem campo)");
  add("Energia", r.energiaPorM3 * base.volume, r.energiaPorM3 > 0, "conta de luz e produção do mês");
  const custo = linhas.reduce((s, l) => s + l.valor, 0);
  const preco = r.bdiValido ? custo / (1 - r.somaPct / 100) : null;
  return { linhas, custo, bdiPct: r.bdiPct, preco, resumo: r };
}

// Custo completo de UM pilar a partir do custo de fábrica já calculado.
// base = { concreto, aco, maoDeObra, volume, comLaje, custoM3Concreto, precoAcoKg, custoHoraEquipe }
export function custoCompletoPilar(base, param = {}) {
  const r = resumoComplementares(param);
  const linhas = [];
  const add = (rotulo, valor, informado, dica) => linhas.push({ rotulo, valor, informado, dica });

  add("Concreto", base.concreto, true);
  add("Aço", base.aco, true);
  add("Mão de obra", base.maoDeObra, true);
  add(
    "Perda de concreto",
    base.concreto * (n(param.perda_concreto_pct) / 100),
    n(param.perda_concreto_pct) > 0,
    "% de perda de concreto"
  );
  add("Perda de aço", base.aco * (n(param.perda_aco_pct) / 100), n(param.perda_aco_pct) > 0, "% de perda de aço");
  add("Forma e desmoldante", r.formaPorPilar, r.formaPorPilar > 0, "custo e usos da forma, desmoldante");
  add("Energia", r.energiaPorM3 * base.volume, r.energiaPorM3 > 0, "conta de luz e produção do mês");

  // Consolos: aço e concreto sempre (vêm dos projetos); mão de obra quando
  // o tempo de fazer um consolo estiver informado
  const consolos = [CONSOLOS.tesoura, ...(base.comLaje ? [CONSOLOS.viga] : [])];
  const minutos = n(param.consolo_minutos);
  const custoConsolos = consolos.reduce(
    (s, c) =>
      s +
      c.acoKg * n(base.precoAcoKg) * (1 + n(param.perda_aco_pct) / 100) +
      c.concretoM3 * n(base.custoM3Concreto) +
      (minutos / 60) * n(base.custoHoraEquipe),
    0
  );
  add(
    base.comLaje ? "Consolos (tesoura + viga da laje)" : "Consolo da tesoura",
    custoConsolos,
    minutos > 0,
    "tempo para fazer um consolo"
  );

  const custo = linhas.reduce((s, l) => s + l.valor, 0);
  const preco = r.bdiValido ? custo / (1 - r.somaPct / 100) : null;
  return { linhas, custo, bdiPct: r.bdiPct, preco, resumo: r };
}
