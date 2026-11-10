import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pilarDoProjeto,
  referenciaMaisProxima,
  tesouraDoProjeto,
  tercaDoProjeto,
  travamentoDoProjeto,
  vigaDoProjeto,
  lajeDoProjeto,
  telhaDoProjeto,
  resumoProjeto,
} from "./projeto.js";
import { papelDoItem, diariasDeMontagem } from "./calculos.js";
import { tipoArmacao } from "../engenharia/armacao.js";

const LAJE_300 = { id: 24, nome: "LAJE PI 300 Kg/M²", unidade: "M2", papel: "LAJE", preco: "135" };
const TELHA = { id: 3, nome: "TELHA FIBROCIMENTO 5MM", unidade: "M2", papel: "TELHA", preco: "50" };
const REFS = [
  { nome: "TESOURA 11,50M", preco: "1774.15", comprimento_referencia: "11.5" },
  { nome: "TESOURA 16M", preco: "3123.61", comprimento_referencia: "16" },
  { nome: "TESOURA 20M", preco: "4045.45", comprimento_referencia: "20" },
];
const TERCAS = [
  { medida: 5, preco: 230.35 },
  { medida: 6, preco: 279.8 },
];

test("pilar com platibanda: seção cheia até a platibanda e fatia dela acima", () => {
  const p = pilarDoProjeto({ qtd: 14, comprimento: "10,50", platibanda: 1, valorM3: 3000 });
  assert.equal(p.preco_unitario, 2962.5); // (0,25×0,40×9,50 + 0,25×0,15×1,00) × 3000
  assert.equal(p.quantidade, 14);
  assert.equal(p.secao, "estrutura");
  assert.equal(p.nome, "PILAR 0,25x0,40 - 10,50m (1,00 platibanda)");
});

test("pilar sem platibanda e seção diferente", () => {
  const p = pilarDoProjeto({ qtd: 2, comprimento: 9.5, largura: 0.3, altura: 0.25, valorM3: 3000 });
  assert.equal(p.preco_unitario, 2137.5);
  assert.equal(p.nome, "PILAR 0,30x0,25 - 9,50m");
});

test("pilar de laje vai para a seção da laje e conta como com consolo na armação", () => {
  const p = pilarDoProjeto({ qtd: 7, comprimento: 5.5, deLaje: true, valorM3: 3000 });
  assert.equal(p.preco_unitario, 1650);
  assert.equal(p.secao, "laje");
  assert.equal(tipoArmacao(p), "PILAR_COM_CONSOLO");
});

test("consolo marcado aparece na descrição e na armação", () => {
  const com = pilarDoProjeto({ qtd: 1, comprimento: 8, comConsolo: true, valorM3: 3000 });
  const sem = pilarDoProjeto({ qtd: 1, comprimento: 8, valorM3: 3000 });
  assert.match(com.nome, /com consolo/);
  assert.equal(tipoArmacao(com), "PILAR_COM_CONSOLO");
  assert.equal(tipoArmacao(sem), "PILAR_SEM_CONSOLO");
});

test("pilar recusa dados incompletos", () => {
  assert.ok(pilarDoProjeto({ qtd: 0, comprimento: 8 }).erro);
  assert.ok(pilarDoProjeto({ qtd: 1, comprimento: "" }).erro);
  assert.ok(pilarDoProjeto({ qtd: 1, comprimento: 1, platibanda: 2 }).erro);
});

test("tesoura proporcional à referência mais próxima", () => {
  const ref = referenciaMaisProxima(13.76, REFS);
  assert.equal(ref.nome, "TESOURA 16M");
  const t = tesouraDoProjeto({ qtd: 4, comprimento: 13.76, referencia: ref });
  assert.equal(t.preco_unitario, 2686.3);
  assert.equal(papelDoItem(t), "TESOURA");
  assert.equal(referenciaMaisProxima(5.3, REFS).nome, "TESOURA 11,50M");
  assert.ok(tesouraDoProjeto({ qtd: 1, comprimento: 5, referencia: null }).erro);
});

test("terça fora da medida do catálogo sai pela reta entre 5 m e 6 m", () => {
  assert.equal(tercaDoProjeto({ qtd: 30, comprimento: 5, pontos: TERCAS }).preco_unitario, 230.35);
  const t = tercaDoProjeto({ qtd: 12, comprimento: "5,57", pontos: TERCAS });
  assert.equal(t.preco_unitario, 258.54);
  assert.equal(t.nome, "TERÇA 5,57M");
  assert.ok(tercaDoProjeto({ qtd: 1, comprimento: 5, pontos: [] }).erro);
});

test("travamento usa a seção 0,15×0,30 do sistema", () => {
  const v = travamentoDoProjeto({ qtd: 12, comprimento: 5, valorM3: 1300 });
  assert.equal(v.preco_unitario, 292.5);
  assert.equal(papelDoItem(v), "VIGA_TRAVAMENTO");
});

test("viga de laje entra com o comprimento real, sem dividir por média", () => {
  const v = vigaDoProjeto({ qtd: 3, comprimento: "5,60", altura: "0,60", valorM3: 3000 });
  assert.equal(v.quantidade, 3);
  assert.equal(v.secao, "laje");
  assert.equal(papelDoItem(v), "VIGA_LAJE");
  // 0,25 × 0,60 × 65% = 0,0975 m³/m × 5,60 m = 0,546 m³ × R$ 3.000
  assert.equal(v.preco_unitario, 1638);
  assert.match(v.nome, /^VIGA PARA LAJE 0,25X0,60X5,60M/);
  assert.ok(vigaDoProjeto({ qtd: 0, comprimento: 5, altura: 0.6 }).erro);
  assert.ok(vigaDoProjeto({ qtd: 1, comprimento: "", altura: 0.6 }).erro);
  assert.ok(vigaDoProjeto({ qtd: 1, comprimento: 5, altura: "" }).erro);
});

test("o resumo soma os metros de viga lançados para conferir com a folha", () => {
  const itens = [
    vigaDoProjeto({ qtd: 10, comprimento: 5, altura: 0.6, valorM3: 3000 }),
    vigaDoProjeto({ qtd: 4, comprimento: "3,75", altura: 0.6, valorM3: 3000 }),
  ];
  const r = resumoProjeto(itens);
  assert.equal(r.vigas, 14);
  assert.equal(r.vigasM, 65);
});

test("laje: com local vira linha descrita; sem local fica ligada ao catálogo", () => {
  const principal = lajeDoProjeto({ composicao: LAJE_300, area: 287 });
  assert.equal(principal.composicao_id, 24);
  const castelo = lajeDoProjeto({ composicao: LAJE_300, area: 11, local: "Castelo" });
  assert.equal(castelo.composicao_id, null);
  assert.equal(castelo.nome, "LAJE PI 300 Kg/M² — Castelo");
  assert.equal(papelDoItem(castelo), "LAJE");
  assert.equal(castelo.secao, "laje");
  assert.ok(lajeDoProjeto({ composicao: null, area: 10 }).erro);
});

test("telha soma a perda informada", () => {
  assert.equal(telhaDoProjeto({ composicao: TELHA, area: 290, perda: 10 }).quantidade, 319);
  assert.equal(telhaDoProjeto({ composicao: TELHA, area: 290 }).quantidade, 290);
});

test("obra do Cláudio: os totais lançados batem com a folha e a montagem conta por peça", () => {
  const itens = [
    pilarDoProjeto({ qtd: 14, comprimento: 10.5, platibanda: 1, valorM3: 3000 }),
    pilarDoProjeto({ qtd: 2, comprimento: 9.5, valorM3: 3000 }),
    pilarDoProjeto({ qtd: 7, comprimento: 5.5, deLaje: true, valorM3: 3000 }),
    tesouraDoProjeto({ qtd: 4, comprimento: 13.76, referencia: REFS[1] }),
    tesouraDoProjeto({ qtd: 1, comprimento: 5.67, referencia: REFS[0] }),
    tesouraDoProjeto({ qtd: 1, comprimento: 5.3, referencia: REFS[0] }),
    tercaDoProjeto({ qtd: 30, comprimento: 5, pontos: TERCAS }),
    tercaDoProjeto({ qtd: 12, comprimento: 5.57, pontos: TERCAS }),
    travamentoDoProjeto({ qtd: 12, comprimento: 5, valorM3: 1300 }),
    vigaDoProjeto({ qtd: 10, comprimento: 5, altura: 0.6, valorM3: 3000 }),
    vigaDoProjeto({ qtd: 4, comprimento: 3.75, altura: 0.6, valorM3: 3000 }),
    lajeDoProjeto({ composicao: LAJE_300, area: 287 }),
    lajeDoProjeto({ composicao: LAJE_300, area: 11, local: "Castelo" }),
    telhaDoProjeto({ composicao: TELHA, area: 356 }),
  ];
  assert.deepEqual(resumoProjeto(itens), {
    pilares: 23,
    tesouras: 6,
    tercas: 42,
    travamentos: 12,
    vigas: 14,
    vigasM: 65,
    lajeM2: 298,
    telhaM2: 356,
  });
  assert.ok(diariasDeMontagem(itens, "estrutura") > 0);
  assert.ok(diariasDeMontagem(itens, "laje") > 0);
});
