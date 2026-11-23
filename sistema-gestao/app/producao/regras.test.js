import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeLimpo, nomeRepetido, nomeParecido, gerarTipo, custoMensalFuncao, rotuloSetor } from "./regras.js";

const lista = [
  { id: 1, nome: "José Adriano" },
  { id: 2, nome: "Luciano Joaquim" },
];

test("nome limpo tira espaços sobrando", () => {
  assert.equal(nomeLimpo("  josé   carlos "), "josé carlos");
  assert.equal(nomeLimpo(null), "");
});

test("nome repetido ignora acento, maiúscula e espaços", () => {
  assert.equal(nomeRepetido("JOSE  ADRIANO", lista)?.id, 1);
  assert.equal(nomeRepetido("José Adriano", lista, 1), null); // ele mesmo
  assert.equal(nomeRepetido("Marcelo", lista), null);
  assert.equal(nomeRepetido("   ", lista), null);
});

test("nome parecido pega nome completo x nome curto", () => {
  assert.equal(nomeParecido("Luciano Joaquim da Silva", lista)?.id, 2);
  assert.equal(nomeParecido("Luciano", lista)?.id, 2);
  assert.equal(nomeParecido("Luciana", lista), null);
  assert.equal(nomeParecido("Luciano Joaquim", lista), null); // igual não é "parecido"
});

test("código da peça sai do nome", () => {
  assert.equal(gerarTipo("Viga de base"), "VIGA_DE_BASE");
  assert.equal(gerarTipo(" Pilar c/ consolo "), "PILAR_C_CONSOLO");
  assert.equal(gerarTipo("Mourão"), "MOURAO");
});

test("custo mensal da função soma os encargos", () => {
  assert.equal(Math.round(custoMensalFuncao({ salario_bruto: 1846.62, encargos_pct: 68 }) * 100) / 100, 3102.32);
  assert.equal(custoMensalFuncao(null), null);
  assert.equal(rotuloSetor("ARMACAO"), "Armação");
});
