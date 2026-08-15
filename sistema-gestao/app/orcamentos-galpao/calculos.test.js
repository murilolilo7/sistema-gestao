// Testes das regras de cálculo do orçamento de galpão.
//
// COMO RODAR:  node --test app/orcamentos-galpao/calculos.test.js
//
// Cada teste trava uma regra que foi definida com o Murilo. Se alguém mudar
// uma conta sem querer, o teste acusa ANTES de o orçamento sair errado para
// o cliente. Quando uma regra mudar de propósito, ajuste o teste junto.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  papelDoItem,
  montagemDaTesoura,
  diariasDeMontagem,
  qtdTercasPorLinhaDeVao,
  decomporComprimentoEmModulos,
  trechosDaViga,
  chaveAutomatica,
  qtdCapote,
  qtdCalha,
  qtdTelha,
  valorPorExtenso,
} from "./calculos.js";

// ---------------------------------------------------------------------------
// MONTAGEM DA TESOURA — quanto maior o vão, menos peças por dia
// ---------------------------------------------------------------------------

test("tesoura: até 16m monta 4 por dia", () => {
  assert.equal(montagemDaTesoura("TESOURA 11,50M PRÉ-MOLDADA"), 4);
  assert.equal(montagemDaTesoura("TESOURA 15M"), 4);
});

test("tesoura: de 16 a 20m monta 3 por dia", () => {
  assert.equal(montagemDaTesoura("TESOURA 16M PRÉ-MOLDADA"), 3);
  assert.equal(montagemDaTesoura("TESOURA 18M PRÉ-MOLDADA"), 3);
});

test("tesoura: 20m ou mais monta 2 por dia", () => {
  assert.equal(montagemDaTesoura("TESOURA 20M PRÉ-MOLDADA"), 2);
  assert.equal(montagemDaTesoura("TESOURA 22M"), 2);
});

test("tesoura calculada: usa o VÃO REAL, não o da referência", () => {
  // O nome cita duas medidas; vale a primeira (o vão da peça).
  const nome =
    "Tesoura 8M de vão livre (calculada proporcionalmente a partir da TESOURA 18M PRÉ-MOLDADA)";
  assert.equal(montagemDaTesoura(nome), 4);
});

// ---------------------------------------------------------------------------
// DIÁRIAS DE MONTAGEM
// ---------------------------------------------------------------------------

test("montagem: só pilar, terça, tesoura, vigas e laje entram na conta", () => {
  const itens = [
    { nome: "TESOURA 15M", papel: "TESOURA", quantidade: 6, secao: "estrutura" },
    { nome: "PILAR", papel: "PILAR", quantidade: 12, secao: "estrutura" },
    { nome: "TERÇA 5,00M", papel: "TERCA", quantidade: 50, secao: "estrutura" },
    // as de baixo NÃO entram:
    { nome: "TELHA", papel: "TELHA", quantidade: 500, secao: "estrutura" },
    { nome: "CALHA FIBRA", papel: "CALHA", quantidade: 60, secao: "estrutura" },
    { nome: "CAPOTE", papel: "CAPOTE", quantidade: 30, secao: "estrutura" },
    { nome: "FUNDAÇÃO", papel: "FUNDACAO", quantidade: 12, secao: "estrutura" },
  ];
  // 6/4 + 12/3 + 50/30 = 1,5 + 4 + 1,67 = 7,17 -> 8 diárias
  assert.equal(diariasDeMontagem(itens, "estrutura"), 8);
});

test("montagem: estrutura e laje são contadas separadamente", () => {
  const itens = [
    { nome: "PILAR", papel: "PILAR", quantidade: 12, secao: "estrutura" },
    { nome: "PILAR DO MEIO", papel: "PILAR", quantidade: 6, secao: "laje" },
    { nome: "VIGA PARA LAJE", papel: "VIGA_LAJE", quantidade: 12, secao: "laje" },
  ];
  assert.equal(diariasDeMontagem(itens, "estrutura"), 4); // 12/3
  assert.equal(diariasDeMontagem(itens, "laje"), 6); // 6/3 + 12/3 = 6
});

test("montagem da laje: conta por PEÇA (m² ÷ 7), não por m²", () => {
  const itens = [
    { nome: "LAJE PI", papel: "LAJE", quantidade: 160, secao: "laje" },
  ];
  // 160 / 7 = 22,85 -> 23 peças -> 23/10 = 2,3 -> 3 diárias
  assert.equal(diariasDeMontagem(itens, "laje"), 3);
});

test("montagem: sem peças que contam, dá zero", () => {
  const itens = [{ nome: "TELHA", papel: "TELHA", quantidade: 500, secao: "estrutura" }];
  assert.equal(diariasDeMontagem(itens, "estrutura"), 0);
});

// ---------------------------------------------------------------------------
// TERÇAS — largura ÷ 1,6, pra cima e sempre par
// ---------------------------------------------------------------------------

test("terças por vão: arredonda pra cima e força número par", () => {
  assert.equal(qtdTercasPorLinhaDeVao(18), 12); // 11,25 -> 12
  assert.equal(qtdTercasPorLinhaDeVao(15), 10); // 9,37 -> 10
  assert.equal(qtdTercasPorLinhaDeVao(12), 8); // 7,5 -> 8
  assert.equal(qtdTercasPorLinhaDeVao(10), 8); // 6,25 -> 7 -> par -> 8
  assert.equal(qtdTercasPorLinhaDeVao(0), 0);
});

// ---------------------------------------------------------------------------
// DIVISÃO DO COMPRIMENTO EM VÃOS
// ---------------------------------------------------------------------------

test("comprimento redondo: divide em vãos de 5m e 6m", () => {
  assert.deepEqual(decomporComprimentoEmModulos(27), { vaos5: 3, vaos6: 2, quebrado: null });
  assert.deepEqual(decomporComprimentoEmModulos(20), { vaos5: 4, vaos6: 0, quebrado: null });
  assert.deepEqual(decomporComprimentoEmModulos(25), { vaos5: 5, vaos6: 0, quebrado: null });
});

test("comprimento quebrado: a sobra vira UM vão maior", () => {
  // 27,4 = 2x5 + 2x6 + 1 vão de 5,40 (que conta como vão de 6m)
  const d = decomporComprimentoEmModulos(27.4);
  assert.equal(d.vaos5, 2);
  assert.equal(d.vaos6, 3);
  assert.equal(d.quebrado, 5.4);
  // a soma tem de fechar com o comprimento pedido
  assert.equal(d.vaos5 * 5 + (d.vaos6 - 1) * 6 + d.quebrado, 27.4);
});

test("comprimento quebrado: fecha em vários casos", () => {
  for (const c of [20.3, 12.3, 18.7, 33.2, 45.8, 11.4]) {
    const d = decomporComprimentoEmModulos(c);
    assert.ok(d, `${c}m deveria decompor`);
    const soma = d.vaos5 * 5 + (d.vaos6 - 1) * 6 + d.quebrado;
    assert.ok(Math.abs(soma - c) < 0.01, `${c}m: soma deu ${soma}`);
  }
});

test("comprimento inválido: devolve null", () => {
  assert.equal(decomporComprimentoEmModulos(0), null);
  assert.equal(decomporComprimentoEmModulos(""), null);
});

// ---------------------------------------------------------------------------
// VIGAS DA LAJE — nunca passam de 10m
// ---------------------------------------------------------------------------

test("viga da laje: até 10m fica inteira, sem pilar no meio", () => {
  assert.deepEqual(trechosDaViga(9), { trechos: 1, vaoViga: 9, filasMeio: 0 });
  assert.deepEqual(trechosDaViga(10), { trechos: 1, vaoViga: 10, filasMeio: 0 });
});

test("viga da laje: acima de 10m divide e ganha fila de pilar", () => {
  assert.deepEqual(trechosDaViga(12), { trechos: 2, vaoViga: 6, filasMeio: 1 });
  assert.deepEqual(trechosDaViga(20), { trechos: 2, vaoViga: 10, filasMeio: 1 });
  assert.deepEqual(trechosDaViga(21), { trechos: 3, vaoViga: 7, filasMeio: 2 });
});

// ---------------------------------------------------------------------------
// PEÇAS AUTOMÁTICAS — reconhecer ao reabrir o orçamento (senão DUPLICAM)
// ---------------------------------------------------------------------------

test("reconhece cada peça automática pelo nome", () => {
  const casos = [
    ["PILAR 0,25x0,30 - 8,50m (7,00 livre + 1,50 fundacao)", "estrutura", "pilar-auto-padrao"],
    ["PILAR 0,25x0,40 — sob a laje", "estrutura", "pilar-auto-comlaje"],
    ["PILAR 0,30x0,40 — reforçado (2 tesouras)", "estrutura", "pilar-auto-reforcado"],
    ["PILAR DO MEIO DO VÃO 0,25x0,30 — Médio", "laje", "pilar-auto-meio"],
    ["TERÇA INTERMEDIÁRIA 5,00M", "estrutura", "terca-auto-5"],
    ["TERÇA DE INÍCIO E FINAL 6,00M", "estrutura", "terca-auto-6"],
    ["VIGA PARA LAJE 0,25X0,90X9,00M", "laje", "viga-laje-auto"],
    ["VIGA DE TRAVAMENTO 0,15X0,30X5,00M", "estrutura", "travamento-auto-5"],
    ["VIGA DE TRAVAMENTO 0,15X0,30X6,00M", "estrutura", "travamento-auto-6"],
    ["VIGA DE TRAVAMENTO 0,15X0,30X5,40M", "estrutura", "travamento-auto-6"],
    ["FUNDAÇÃO", "laje", "fundacao-laje"],
    ["CONSOLO TESOURA (dente gerber)", "estrutura", "consolo-tesoura-auto"],
  ];
  for (const [nome, secao, esperado] of casos) {
    assert.equal(chaveAutomatica(nome, secao), esperado, nome);
  }
});

test("peças que NÃO são automáticas devolvem null", () => {
  assert.equal(chaveAutomatica("TELHA FIBROCIMENTO 5MM", "estrutura"), null);
  assert.equal(chaveAutomatica("CALHA FIBRA", "estrutura"), null);
  assert.equal(chaveAutomatica("CAPOTE", "estrutura"), null);
  assert.equal(chaveAutomatica("MONTAGEM", "estrutura"), null);
  // fundação da ESTRUTURA não é a da laje
  assert.equal(chaveAutomatica("FUNDAÇÃO", "estrutura"), null);
});

test("papel deduzido pelo nome: peças calculadas não têm papel do catálogo", () => {
  // Sem isso a viga de travamento reabria sem papel e sumia do desenho.
  assert.equal(papelDoItem({ nome: "VIGA DE TRAVAMENTO 0,15X0,30X5,00M" }), "VIGA_TRAVAMENTO");
  assert.equal(papelDoItem({ nome: "VIGA PARA LAJE 0,25X0,90X9,00M" }), "VIGA_LAJE");
  assert.equal(papelDoItem({ nome: "CONSOLO TESOURA (dente gerber)" }), "CONSOLO");
  assert.equal(papelDoItem({ nome: "Tesoura 15M de vão livre (calculada)" }), "TESOURA");
  // o papel do catálogo, quando existe, manda
  assert.equal(papelDoItem({ papel: "PILAR", nome: "VIGA PARA LAJE" }), "PILAR");
});

// ---------------------------------------------------------------------------
// QUANTIDADES PELA MEDIDA
// ---------------------------------------------------------------------------

test("capote: comprimento + 2", () => {
  assert.equal(qtdCapote(27), 29);
  assert.equal(qtdCapote(20), 22);
});

test("calha: meio metro por vão, nos dois lados", () => {
  // 27m com 5 vãos: 27 + 2,5 = 29,5 por lado x 2 lados = 59
  assert.equal(qtdCalha(27, 5), 59);
  // 20m com 4 vãos: 20 + 2 = 22 por lado x 2 = 44
  assert.equal(qtdCalha(20, 4), 44);
});

test("calha: galpão geminado ganha mais uma linha", () => {
  // 2 galpões = 3 linhas de calha
  assert.equal(qtdCalha(20, 4, 2), 66);
});

test("telha: área mais a perda", () => {
  assert.equal(qtdTelha(486, 10), 534.6);
  assert.equal(qtdTelha(486, 0), 486);
});

// ---------------------------------------------------------------------------
// VALOR POR EXTENSO (proposta impressa)
// ---------------------------------------------------------------------------

test("valor por extenso: casos do dia a dia", () => {
  assert.equal(valorPorExtenso(1), "um real");
  assert.equal(valorPorExtenso(100), "cem reais");
  assert.equal(valorPorExtenso(1000), "mil reais");
  assert.equal(
    valorPorExtenso(399371.43),
    "trezentos e noventa e nove mil, trezentos e setenta e um reais e quarenta e três centavos"
  );
});

test("valor por extenso: milhão redondo pede 'de reais'", () => {
  assert.equal(valorPorExtenso(1000000), "um milhão de reais");
  assert.equal(valorPorExtenso(2000000), "dois milhões de reais");
});

test("valor por extenso: só centavos", () => {
  assert.equal(valorPorExtenso(0.5), "cinquenta centavos");
  assert.equal(valorPorExtenso(0.01), "um centavo");
});

// ---------------------------------------------------------------------------
// CASO COMPLETO — o galpão 18x27 que conferimos contra a planilha
// ---------------------------------------------------------------------------

test("galpão 18x27: as quantidades batem com a planilha do Murilo", () => {
  const largura = 18;
  const comprimento = 27;

  const d = decomporComprimentoEmModulos(comprimento);
  assert.equal(d.vaos5, 3);
  assert.equal(d.vaos6, 2);

  const vaos = d.vaos5 + d.vaos6;
  assert.equal(vaos, 5);
  assert.equal(vaos + 1, 6, "6 tesouras");

  const porVao = qtdTercasPorLinhaDeVao(largura);
  assert.equal(porVao * d.vaos5, 36, "36 terças de 5m");
  assert.equal(porVao * d.vaos6, 24, "24 terças de 6m");

  assert.equal(qtdCapote(comprimento), 29);
  assert.equal(qtdCalha(comprimento, vaos), 59);
  assert.equal(qtdTelha(486, 10), 534.6);

  // laje: 18m de largura -> viga divide em 2 trechos, 1 fila de pilar
  const v = trechosDaViga(largura);
  assert.equal(v.trechos, 2);
  assert.equal(v.filasMeio, 1);
  assert.equal((vaos + 1) * v.trechos, 12, "12 vigas de laje");
});
