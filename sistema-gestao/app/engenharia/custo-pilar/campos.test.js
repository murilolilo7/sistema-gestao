import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCOS, TODOS_CAMPOS, definicao, lerNumero, foraDoNormal, validar, paraTexto } from "./campos.js";

test("todo campo tem rótulo, unidade, exemplo, fonte e faixa normal", () => {
  for (const c of TODOS_CAMPOS) {
    assert.ok(c.campo && c.rotulo && c.unidade && c.exemplo && c.fonte, c.campo);
    assert.equal(c.normal.length, 2, c.campo);
    assert.ok(c.normal[0] < c.normal[1], c.campo);
    // o exemplo tem que estar dentro do normal
    assert.equal(foraDoNormal(c, lerNumero(c.exemplo)), null, c.campo);
  }
  assert.equal(new Set(TODOS_CAMPOS.map((c) => c.campo)).size, TODOS_CAMPOS.length, "campo repetido");
  assert.ok(BLOCOS.every((b) => b.titulo && b.resumo));
});

test("lê número no padrão brasileiro", () => {
  assert.equal(lerNumero("65"), 65);
  assert.equal(lerNumero("65%"), 65);
  assert.equal(lerNumero("0,88"), 0.88);
  assert.equal(lerNumero("8.25"), 8.25);
  assert.equal(lerNumero("1.500"), 1500);
  assert.equal(lerNumero("1.500,75"), 1500.75);
  assert.equal(lerNumero("R$ 148,39"), 148.39);
  assert.equal(lerNumero(""), null);
  assert.equal(lerNumero("abc"), null);
});

test("BDI digitado errado (650 no lugar de 65) pede confirmação", () => {
  const def = definicao("bdi_pilar_pct");
  assert.match(foraDoNormal(def, 650), /fora do normal/);
  assert.equal(foraDoNormal(def, 65), null);
});

test("validar recusa texto e negativo, avisa fora do normal", () => {
  const def = definicao("aco_barra_m");
  assert.equal(validar(def, "doze").ok, false);
  assert.equal(validar(def, "-12").ok, false);
  const ok = validar(def, "12");
  assert.deepEqual([ok.ok, ok.valor, ok.aviso], [true, 12, null]);
  const longe = validar(def, "120");
  assert.equal(longe.ok, true);
  assert.match(longe.aviso, /fora do normal/);
});

test("valor do banco vira texto com vírgula", () => {
  assert.equal(paraTexto(0.88), "0,88");
  assert.equal(paraTexto(null), "");
  assert.equal(paraTexto(12), "12");
});
