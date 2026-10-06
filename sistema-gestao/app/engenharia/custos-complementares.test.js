// Testes dos custos complementares do pilar.
// COMO RODAR:  node --test app/engenharia/custos-complementares.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoComplementares, custoCompletoPilar, custoCompletoPeca } from "./custos-complementares.js";

test("peça sem consolo (tesoura): perdas + energia + BDI sobre concreto, aço e mão de obra", () => {
  const p = { perda_aco_pct: 5, energia_mensal: 3000, producao_m3_mes: 100, despesas_fixas_mensal: 15000, faturamento_mensal: 100000, impostos_pct: 8, lucro_pct: 10 };
  const r = custoCompletoPeca({ concreto: 800, aco: 1500, maoDeObra: 120, volume: 1.5 }, p);
  // 800 + 1500 + 120 + 75 (perda aço) + 45 (energia)
  assert.ok(Math.abs(r.custo - 2540) < 0.01);
  assert.ok(Math.abs(r.preco - 2540 / 0.67) < 0.01);
});

const base = {
  concreto: 530,
  aco: 450,
  maoDeObra: 141,
  volume: 1,
  comLaje: false,
  custoM3Concreto: 530,
  precoAcoKg: 5.59,
  custoHoraEquipe: 75,
};

test("nada preenchido: custo = concreto + aço + mão de obra + aço do consolo, sem preço", () => {
  const r = custoCompletoPilar(base, {});
  assert.ok(Math.abs(r.custo - (530 + 450 + 141 + 4 * 5.59)) < 0.01);
  assert.equal(r.preco, null);
});

test("perdas somam % sobre o concreto e o aço", () => {
  const r = custoCompletoPilar(base, { perda_aco_pct: 10, perda_concreto_pct: 5 });
  const perdaAco = r.linhas.find((l) => l.rotulo === "Perda de aço").valor;
  const perdaConc = r.linhas.find((l) => l.rotulo === "Perda de concreto").valor;
  assert.equal(perdaAco, 45);
  assert.ok(Math.abs(perdaConc - 26.5) < 1e-9);
});

test("forma: custo dividido pelos usos + desmoldante por pilar", () => {
  const s = resumoComplementares({ forma_pilar_custo: 6000, forma_pilar_usos: 300, desmoldante_por_pilar: 5 });
  assert.equal(s.formaPorPilar, 25);
});

test("energia: conta do mês dividida pelos m³ produzidos, vezes o volume do pilar", () => {
  const r = custoCompletoPilar({ ...base, volume: 0.8 }, { energia_mensal: 3000, producao_m3_mes: 100 });
  assert.equal(r.linhas.find((l) => l.rotulo === "Energia").valor, 24);
});

test("pilar com laje leva também o consolo da viga", () => {
  const sem = custoCompletoPilar(base, { consolo_minutos: 30 });
  const com = custoCompletoPilar({ ...base, comLaje: true }, { consolo_minutos: 30 });
  assert.ok(com.custo > sem.custo);
});

test("BDI: despesas 15% + impostos 8% + lucro 10% → preço = custo ÷ 0,67", () => {
  const p = { despesas_fixas_mensal: 15000, faturamento_mensal: 100000, impostos_pct: 8, lucro_pct: 10 };
  const r = custoCompletoPilar(base, p);
  assert.ok(Math.abs(r.preco - r.custo / 0.67) < 0.01);
  assert.ok(Math.abs(r.bdiPct - 49.25) < 0.01);
});

test("BDI impossível (100% ou mais) não gera preço", () => {
  const s = resumoComplementares({ despesas_fixas_mensal: 80, faturamento_mensal: 100, impostos_pct: 10, lucro_pct: 15 });
  assert.equal(s.bdiValido, false);
  assert.equal(s.bdiInvalido, true);
});
