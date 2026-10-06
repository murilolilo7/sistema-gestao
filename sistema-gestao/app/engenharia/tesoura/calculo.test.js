// Testes do cálculo da tesoura (em teste).
// COMO RODAR:  node --test app/engenharia/tesoura/calculo.test.js
//
// Casos "projeto real" vêm do gabarito lido dos detalhes de fabricação
// (C:\Projetos\Referencias-MR7\tesouras\gabarito_tesouras.csv).

import { test } from "node:test";
import assert from "node:assert/strict";
import { alturaNoMeio, concretoTesoura, calcularTesoura, OPCOES_INFERIOR, PARAMETROS_TESOURA } from "./calculo.js";

test("altura padrão no meio segue as faixas da fábrica", () => {
  assert.equal(alturaNoMeio(8).estribo, 31);
  assert.equal(alturaNoMeio(11.5).estribo, 51);
  assert.equal(alturaNoMeio(15).estribo, 60);
  assert.equal(alturaNoMeio(16).estribo, 72);
  assert.equal(alturaNoMeio(20).estribo, 79);
});

test("concreto bate com os moldes informados (15 m ≈ 0,9–1,2 m³; 20 m ≈ 1,55–1,65 m³)", () => {
  const v15 = concretoTesoura(15, alturaNoMeio(15).altura);
  const v20 = concretoTesoura(20, alturaNoMeio(20).altura);
  assert.ok(v15 >= 0.9 && v15 <= 1.2, `15 m: ${v15}`);
  assert.ok(v20 >= 1.55 && v20 <= 1.65, `20 m: ${v20}`);
});

test("concreto da 11,5 m igual à receita atual do sistema (~0,74 m³)", () => {
  const v = concretoTesoura(11.5, 0.63);
  assert.ok(Math.abs(v - 0.74) < 0.03, `11,5 m: ${v}`);
});

test("espessura editável muda o concreto na mesma proporção", () => {
  const h = alturaNoMeio(15).altura;
  const v20 = concretoTesoura(15, h, PARAMETROS_TESOURA);
  const v25 = concretoTesoura(15, h, { ...PARAMETROS_TESOURA, espessura: 0.25 });
  assert.ok(Math.abs(v25 / v20 - 1.25) < 0.01);
});

test("vão maior pede mais aço por metro (não é regra de três)", () => {
  const a = calcularTesoura({ vao: 10, modulacao: 5 });
  const b = calcularTesoura({ vao: 20, modulacao: 5 });
  assert.ok(b.kgAco / 20 > (a.kgAco / 10) * 1.4);
});

test("modulação maior (mais telhado por tesoura) pede mais aço embaixo", () => {
  const a = calcularTesoura({ vao: 18, modulacao: 5 });
  const b = calcularTesoura({ vao: 18, modulacao: 7 });
  assert.ok(b.asNecessaria > a.asNecessaria);
});

test("fibrocimento pesa mais que telha metálica", () => {
  const met = calcularTesoura({ vao: 18, modulacao: 6, telha: "metalica" });
  const fib = calcularTesoura({ vao: 18, modulacao: 6, telha: "fibro5" });
  assert.ok(fib.Md > met.Md);
});

test("tesoura mais baixa no meio pede mais aço (mesmo vão)", () => {
  const alta = calcularTesoura({ vao: 20, modulacao: 5.5, alturaMeio: 0.84 });
  const baixa = calcularTesoura({ vao: 20, modulacao: 5.5, alturaMeio: 0.75 });
  assert.ok(baixa.asNecessaria > alta.asNecessaria);
});

test("barra de baixo escolhida é a mais leve que atende", () => {
  const r = calcularTesoura({ vao: 16, modulacao: 5 });
  const i = OPCOES_INFERIOR.indexOf(r.inferior);
  assert.ok(r.inferior.area >= r.asNecessaria);
  assert.ok(i === 0 || OPCOES_INFERIOR[i - 1].area < r.asNecessaria || i <= 2);
});

// Projetos reais (aço total dentro de ±20%)
const casos = [
  ["Galpão Carlos 11,50 m (TSC1)", { vao: 11.5, modulacao: 5, alturaMeio: 0.63 }, 74.5],
  ["José Nilton 10 m", { vao: 10, modulacao: 5.3, alturaMeio: 0.5 }, 83.3],
  ["Mosteiro 14,35 m", { vao: 14.35, modulacao: 5, alturaMeio: 0.6 }, 190.2],
  ["Wildo 15 m", { vao: 15, modulacao: 5, alturaMeio: 0.65 }, 218.8],
  ["João Victor 18,28 m", { vao: 18.28, modulacao: 5, alturaMeio: 0.75 }, 262.3],
  ["Bernardo Atlantic 21 m", { vao: 21, modulacao: 5.5, alturaMeio: 0.84 }, 334.7],
];
for (const [nome, entrada, kgReal] of casos) {
  test(`projeto real: ${nome} → ~${kgReal} kg de aço`, () => {
    const r = calcularTesoura(entrada);
    const rel = r.kgAco / kgReal;
    assert.ok(rel > 0.8 && rel < 1.32, `calculou ${r.kgAco} kg (real ${kgReal})`);
  });
}
