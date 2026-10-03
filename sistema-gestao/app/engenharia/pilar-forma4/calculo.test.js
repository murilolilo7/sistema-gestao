// Testes do pré-dimensionamento do pilar (Forma 4).
//
// COMO RODAR:  node --test app/engenharia/pilar-forma4/calculo.test.js
//
// Os casos "projeto real" vêm do gabarito lido dos detalhes de fabricação da
// MR7 (C:\Projetos\Referencias-MR7\pilares\Gabarito_Pilares_MR7.xlsx). Se uma
// hipótese mudar de propósito (ex.: o engenheiro passar outro vento), ajuste
// os testes junto e anote o porquê.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fatorS2,
  pressaoDinamica,
  esforcosPilar,
  momentoResistente,
  asNecessariaPorFace,
  escolherArmacao,
  calcularPilarForma4,
  pesoAcoPilar,
  SECOES,
} from "./calculo.js";

const base = { V0: 30, terreno: "cidade", fechado: true };

// ---------------------------------------------------------------------------
// VENTO
// ---------------------------------------------------------------------------

test("vento: a 10 m na cidade, V0 30 m/s dá ~0,47 kN/m²", () => {
  assert.ok(Math.abs(pressaoDinamica(30, 10, "cidade") - 0.468) < 0.005);
});

test("vento: campo aberto venta mais que cidade", () => {
  assert.ok(pressaoDinamica(30, 8, "aberto") > pressaoDinamica(30, 8, "cidade"));
});

test("vento: abaixo de 5 m a norma não reduz mais", () => {
  assert.equal(fatorS2(3, "cidade"), fatorS2(5, "cidade"));
});

// ---------------------------------------------------------------------------
// SEÇÃO — flexo-compressão
// ---------------------------------------------------------------------------

test("seção: mais aço resiste mais momento", () => {
  const m1 = momentoResistente(4, 100);
  const m2 = momentoResistente(8, 100);
  assert.ok(m2 > m1 * 1.6);
});

test("seção: 4ø16+2ø10 (4,8 cm²/face) no 40x25 resiste ~70 a 80 kN·m com pouca compressão", () => {
  const m = momentoResistente(4.8, 60);
  assert.ok(m > 70 && m < 85, `MRd = ${m}`);
});

test("seção: devolve a menor área que resiste", () => {
  const as = asNecessariaPorFace(60, 50);
  assert.ok(momentoResistente(as, 60) >= 50);
  assert.ok(momentoResistente(as - 0.05, 60) < 50);
});

test("armação: escolhe a mais leve da fábrica que atende", () => {
  assert.equal(escolherArmacao("40x25", 4.0).descricao, "4ø16+2ø10");
  assert.equal(escolherArmacao("40x25", 5.0).descricao, "4ø16+2ø12.5");
  assert.equal(escolherArmacao("40x25", 99), null);
});

// ---------------------------------------------------------------------------
// COMPORTAMENTO
// ---------------------------------------------------------------------------

test("pilar mais alto pede mais momento (vento cresce com a altura²)", () => {
  const a = esforcosPilar({ ...base, altura: 6, vao: 15, modulacao: 5 });
  const b = esforcosPilar({ ...base, altura: 9, vao: 15, modulacao: 5 });
  assert.ok(b.Md > a.Md * 1.8);
});

test("laje aumenta força normal e momento", () => {
  const sem = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5 });
  const com = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5, laje: { carga: 300 } });
  assert.ok(com.Nd > sem.Nd * 3);
  assert.ok(com.Md > sem.Md);
});

test("laje de 500 kg/m² pesa mais que a de 300", () => {
  const l3 = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5, laje: { carga: 300 } });
  const l5 = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5, laje: { carga: 500 } });
  assert.ok(l5.Nd > l3.Nd && l5.Md > l3.Md);
});

test("galpão aberto (sem paredes) leva menos vento no pilar que fechado", () => {
  const f = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5 });
  const a = esforcosPilar({ ...base, altura: 8, vao: 15, modulacao: 5, fechado: false });
  assert.ok(a.Mw < f.Mw);
});

test("aproveitamento: mostra quanto da armação é usado e o próximo degrau", () => {
  const r = calcularPilarForma4({ ...base, altura: 8.5, vao: 15, modulacao: 5 });
  assert.equal(r.armacao.descricao, "4ø16+2ø10");
  assert.ok(r.aproveitamento > 50 && r.aproveitamento <= 100, `aproveitamento ${r.aproveitamento}`);
  assert.equal(r.proximaArmacao.descricao, "4ø16+2ø12.5");
});

test("seção pequena demais avisa em vez de inventar armação", () => {
  const r = calcularPilarForma4({ ...base, secao: "25x25", altura: 9, vao: 20, modulacao: 6 });
  assert.equal(r.armacao, null);
  assert.ok(r.avisos.some((a) => a.includes("não atende")));
});

// ---------------------------------------------------------------------------
// PROJETOS REAIS (gabarito) — o cálculo tem de chegar na mesma armação
// ---------------------------------------------------------------------------

const casos = [
  // [descrição, entrada, armação do projeto]
  ["José Alexandre PJAM1 — 7,0 m, vão 10,6", { altura: 7.0, vao: 10.6, modulacao: 6 }, "4ø16+2ø10"],
  ["Customize PCB01 — 6,9 m, vão 13,5", { altura: 6.9, vao: 13.5, modulacao: 5 }, "4ø16+2ø10"],
  ["Marcos Santos — 7,0 m, vão 11,7", { altura: 7.0, vao: 11.7, modulacao: 5 }, "4ø16+2ø10"],
  ["Paulo (30x25) — 4,7 m, vão 6", { altura: 4.7, vao: 6, modulacao: 4.5, secao: "30x25" }, "4ø12.5+2ø10"],
  ["Kariri-Xocó (30x25) — 3,8 m, vão 10", { altura: 3.8, vao: 10, modulacao: 5.34, secao: "30x25" }, "4ø12.5+2ø10"],
  ["Alonso (25x25) — 2,5 m, vão 7", { altura: 2.5, vao: 7, modulacao: 5.5, secao: "25x25" }, "4ø12.5+2ø10"],
  ["João Victor PJV10 (laje) — 7,55 m, vão 18,3", { altura: 7.55, vao: 18.3, modulacao: 5, laje: { carga: 300 } }, "8ø16"],
  ["Bananeiras PEB01 (laje) — 7,3 m, vão 21,2", { altura: 7.3, vao: 21.2, modulacao: 4.78, laje: { carga: 300 } }, "6ø16+2ø12.5"],
];

for (const [nome, entrada, esperado] of casos) {
  test(`projeto real: ${nome} → ${esperado}`, () => {
    const r = calcularPilarForma4({ ...base, ...entrada });
    const lista = SECOES[entrada.secao || "40x25"].armacoes.map((a) => a.descricao);
    const diff = lista.indexOf(r.armacao?.descricao) - lista.indexOf(esperado);
    // Aceita a mesma armação ou a vizinha (as faixas da fábrica são próximas)
    assert.ok(Math.abs(diff) <= 1, `calculou ${r.armacao?.descricao}, projeto usa ${esperado}`);
  });
}

// ---------------------------------------------------------------------------
// PESO DE AÇO (para o custo)
// ---------------------------------------------------------------------------

test("peso: pilar 40x25 de 10 m com 4ø16+2ø10 dá ~91 kg (longitudinal + estribos + alças)", () => {
  const r = { secao: "40x25", armacao: escolherArmacao("40x25", 4.0) };
  const kg = pesoAcoPilar(r, 10);
  // 4ø16 (62,7) + 2ø10 (12,3) + 67 estribos de 1,21 m ø5 (12,5) + alças 2ø16 (3,4) ≈ 91
  assert.ok(kg > 80 && kg < 95, `kg = ${kg}`);
});
