import { test } from "node:test";
import assert from "node:assert/strict";
import { fatorSalario, custoArmacao, tipoArmacao, resumoArmacao, PREMIO_ARMACAO } from "./armacao.js";

const HORA = 22.0324;
const fator = fatorSalario(HORA, 220);
const centavos = (v) => Math.round(v * 100) / 100;

test("fator: custo da equipe ÷ prêmio pago (jul–out/2026)", () => {
  assert.equal(Math.round(fator * 100) / 100, 19.35);
  assert.equal(fatorSalario(0), 0);
});

test("custo por peça bate com a tabela apresentada", () => {
  const esperado = {
    TESOURA: 111.91, CAPITEL: 101.74, PILAR_COM_CONSOLO: 81.39, LAJE: 71.22, PILAR_SEM_CONSOLO: 61.04,
    VIGA_LAJE: 61.04, ESTRUTURA_CAIXA: 50.87, BASE: 30.52, TERCA: 20.35, VIGA_TRAVAMENTO: 20.35,
    PLACA: 15.26, MOURAO: 15.26,
  };
  for (const [tipo, valor] of Object.entries(esperado)) {
    assert.equal(centavos(custoArmacao(tipo, fator).total), valor, tipo);
  }
  assert.equal(Object.keys(esperado).length, Object.keys(PREMIO_ARMACAO).length);
});

test("todas as peças com armação são reconhecidas", () => {
  const casos = [
    [{ nome: "TESOURA 16M PRÉ-MOLDADA", papel: "TESOURA" }, "TESOURA"],
    [{ nome: "Tesoura 14,5M de vão livre" }, "TESOURA"],
    [{ nome: "PILAR 0,25x0,40 - 9,00m (7,50 livre + 1,50 fundacao)" }, "PILAR_SEM_CONSOLO"],
    [{ nome: "PILAR 0,25x0,40 - 9,00m (7,50 livre + 1,50 fundacao) — sob a laje" }, "PILAR_COM_CONSOLO"],
    [{ nome: "PILAR 0,25x0,40 - 9,00m — avulso", secao: "laje" }, "PILAR_COM_CONSOLO"],
    [{ nome: "LAJE PI 5,99X1,24X0,25M", papel: "LAJE" }, "LAJE"],
    [{ nome: "VIGA PARA LAJE 0,25X0,70X7,00M — 1º nível" }, "VIGA_LAJE"],
    [{ nome: "VIGA DE TRAVAMENTO 0,15X0,30X5,00M" }, "VIGA_TRAVAMENTO"],
    [{ nome: "TERÇA INTERMEDIÁRIA 5,00M", papel: "TERCA" }, "TERCA"],
    [{ nome: "BASE TIPO CÁLICE", papel: "BASE_CALICE" }, "BASE"],
    [{ nome: "CAPITEL P/ESTRUTURA", papel: "CAPITEL" }, "CAPITEL"],
    [{ nome: "POSTE P/ESTRUTURA", papel: "POSTE" }, "ESTRUTURA_CAIXA"],
    [{ nome: "PLACA DE FECHAMENTO" }, "PLACA"],
    [{ nome: "MOURÃO 2,70M" }, "MOURAO"],
  ];
  for (const [item, tipo] of casos) assert.equal(tipoArmacao(item), tipo, item.nome);
});

test("peças sem armação ficam de fora", () => {
  for (const nome of ["TELHA FIBROCIMENTO 5MM", "CALHA FIBRA", "CAPOTE", "MONTAGEM", "FUNDAÇÃO", "CONSOLO TESOURA 0,25"]) {
    assert.equal(tipoArmacao({ nome }), null, nome);
  }
});

test("resumo agrupa por tipo, e laje em m² vira painel", () => {
  const r = resumoArmacao(
    [
      { nome: "TERÇA INTERMEDIÁRIA 5,00M", papel: "TERCA", quantidade: 32 },
      { nome: "TERÇA DE INÍCIO E FINAL 6,00M", papel: "TERCA", quantidade: 8 },
      { nome: "LAJE PI", papel: "LAJE", quantidade: 74.3 },
      { nome: "CALHA FIBRA", papel: "CALHA", quantidade: 44 },
      { nome: "TESOURA 20M", papel: "TESOURA", quantidade: 0 },
    ],
    fator
  );
  assert.deepEqual(r.linhas.map((l) => [l.tipo, Math.round(l.pecas * 10) / 10]), [["LAJE", 10], ["TERCA", 40]]);
  assert.equal(Math.round(r.total), Math.round(10 * 71.22 + 40 * 20.35));
});
