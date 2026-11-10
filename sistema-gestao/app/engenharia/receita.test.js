import { test } from "node:test";
import assert from "node:assert/strict";
import { custoAoVivo, precoPelaReceita, pecasComPrecoDesatualizado } from "./receita.js";

const aco = (kg, preco) => ({ quantidade: kg, insumos: { valor_unitario: preco } });
const hora = (h, valor) => ({ quantidade: h, mao_de_obra: { valor_hora: valor } });

test("custo da receita soma insumos e mão de obra; laje vira por m²", () => {
  const tesoura = { composicao_itens: [aco(10, 5.59), hora(2, 20)] };
  assert.equal(custoAoVivo(tesoura), 95.9);
  const laje = { area_referencia: "7.43", composicao_itens: [aco(74.3, 10)] };
  assert.equal(custoAoVivo(laje), 100);
  assert.equal(custoAoVivo({ custo: "60", composicao_itens: [] }), 60);
});

test("preço pela receita = custo × (1 + BDI)", () => {
  assert.equal(precoPelaReceita({ bdi_pct: "65", composicao_itens: [aco(100, 10)] }), 1650);
});

test("lista só as peças com receita cujo preço gravado ficou para trás", () => {
  const pecas = [
    { id: 1, nome: "EM DIA", preco: "1650", bdi_pct: "65", composicao_itens: [aco(100, 10)] },
    { id: 2, nome: "ATRASADA", preco: "1500", bdi_pct: "65", composicao_itens: [aco(100, 10)] },
    { id: 3, nome: "SEM RECEITA", preco: "60", custo: "50", bdi_pct: "0", composicao_itens: [] },
    { id: 4, nome: "POUCO ATRASADA", preco: "1640", bdi_pct: "65", composicao_itens: [aco(100, 10)] },
  ];
  const lista = pecasComPrecoDesatualizado(pecas);
  assert.deepEqual(lista.map((p) => p.nome), ["ATRASADA", "POUCO ATRASADA"]);
  assert.equal(lista[0].precoNovo, 1650);
  assert.equal(lista[0].diferenca, 150);
});
