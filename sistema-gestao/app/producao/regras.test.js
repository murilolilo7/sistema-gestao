import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nomeLimpo,
  nomeRepetido,
  nomeParecido,
  gerarTipo,
  custoMensalFuncao,
  rotuloSetor,
  dividirPremio,
  premioConcretagemDia,
  resumoMes,
  custoMaoObraMes,
  avisosDoDia,
} from "./regras.js";

const r2 = (v) => Math.round(v * 100) / 100;

test("prêmio dividido igual à planilha (9 presentes, 2 de meio dia)", () => {
  const partes = dividirPremio(140, ["P", "P", "P", "P", "P", "P", "P", "M", "M", "F", "S"]);
  assert.equal(r2(partes[0]), 17.78);
  assert.equal(r2(partes[7]), 7.78);
  assert.equal(partes[9], 0);
  assert.equal(partes[10], 0);
  assert.equal(r2(partes.reduce((a, b) => a + b, 0)), 140);
});

test("prêmio dividido: 8 de dia inteiro dá 17,50; só meio dia fica com tudo", () => {
  assert.deepEqual(dividirPremio(140, Array(8).fill("P")), Array(8).fill(17.5));
  assert.deepEqual(dividirPremio(100, ["M", "M", "F"]), [50, 50, 0]);
  assert.deepEqual(dividirPremio(0, ["P"]), [0]);
  assert.deepEqual(dividirPremio(140, ["F", "S"]), [0, 0]);
});

test("prêmio do dia: informado ou soma das peças", () => {
  assert.equal(premioConcretagemDia(140, [{ quantidade: 9, valor_unit: 5 }]), 140);
  assert.equal(premioConcretagemDia(null, [{ quantidade: 9, valor_unit: 5 }, { quantidade: 2, valor_unit: 2.5 }]), 50);
  assert.equal(premioConcretagemDia("", []), 0);
});

const diasExemplo = [
  {
    data: "2026-12-01",
    m3_concretado: 8,
    premio_concretagem_informado: null,
    producao_presencas: [
      { colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" },
      { colaborador_id: 2, setor: "CONCRETAGEM", situacao: "P" },
      { colaborador_id: 3, setor: "ARMACAO", situacao: "P" },
    ],
    producao_concretagem_pecas: [{ peca_id: 10, quantidade: 4, valor_unit: 10 }],
    producao_armacao: [{ colaborador_id: 3, peca_id: 10, quantidade: 3, valor_unit: 3 }],
  },
  {
    data: "2026-12-02",
    m3_concretado: 2,
    premio_concretagem_informado: 20,
    producao_presencas: [
      { colaborador_id: 1, setor: "CONCRETAGEM", situacao: "F" },
      { colaborador_id: 2, setor: "CONCRETAGEM", situacao: "P" },
      { colaborador_id: 3, setor: "CONCRETAGEM", situacao: "M" },
    ],
    producao_concretagem_pecas: [],
    producao_armacao: [],
  },
];

test("resumo do mês soma dias, faltas e prêmios por pessoa", () => {
  const r = resumoMes(diasExemplo, [{ colaborador_id: 2, valor: 200 }]);
  const p = (id) => r.linhas.find((l) => l.colaborador_id === id);
  assert.equal(p(1).dias, 1);
  assert.equal(p(1).faltas, 1);
  assert.equal(p(1).premioConcretagem, 20); // 40 ÷ 2
  assert.equal(p(2).premioConcretagem, r2(20 + 20 - 20 / 2 / 2)); // 20 + 15
  assert.equal(p(3).premioConcretagem, 5); // meio dia: 20 ÷ 2 ÷ 2
  assert.equal(p(3).premioArmacao, 9);
  assert.equal(p(2).total, 235);
  assert.equal(r.totais.m3, 10);
  assert.equal(r.totais.premioConcretagem, 60);
  assert.equal(r.totais.premioArmacao, 9);
  assert.equal(r.totais.total, 269);
  assert.equal(r.porPecaConcretada.get(10), 4);
});

test("custo da mão de obra reparte o salário pelos dias em cada setor", () => {
  const r = resumoMes(diasExemplo, []);
  const c = custoMaoObraMes(r, (id) => ({ 1: 3000, 2: 3000, 3: 4000 })[id]);
  // pessoa 3: 1 dia armação, 1 dia concretagem -> metade em cada
  assert.equal(c.concretagem.salarios, 3000 + 3000 + 2000);
  assert.equal(c.armacao.salarios, 2000);
  assert.equal(c.concretagem.porM3, r2((8000 + 60) / 10));
  assert.equal(c.armacao.porReal, 223.222); // (2000 + 9) ÷ 9
  assert.equal(custoMaoObraMes(r, () => null).semFuncao, 3);
});

test("avisos do dia apontam o que está faltando", () => {
  const pecas = [{ id: 10, nome: "Laje", valor_concretagem: null }];
  const a = avisosDoDia({
    m3: "",
    presencas: [{ colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" }, { colaborador_id: 3, setor: "ARMACAO", situacao: "P" }],
    concretagem: [{ peca_id: 10, quantidade: 2 }],
    armacao: [],
    pecas,
  });
  assert.equal(a.length, 4);
  assert.deepEqual(avisosDoDia({ m3: 5, presencas: [{ colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" }], concretagem: [{ peca_id: 11, quantidade: 1 }], armacao: [], pecas }), []);
});

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

test("setores do cadastro e % da meta de m³", async () => {
  const { listaSetores, rotuloSetor, percentualMeta } = await import("./regras.js");
  const lista = listaSetores([
    { id: "MONTAGEM", nome: "Montagem", ordem: 50, ativo: true },
    { id: "CONCRETAGEM", nome: "Concretagem", ordem: 1, fixo: true },
    { id: "ARMACAO", nome: "Armação", ordem: 2, fixo: true },
  ]);
  assert.deepEqual(lista.map((s) => s.id), ["CONCRETAGEM", "ARMACAO", "MONTAGEM"]);
  assert.equal(rotuloSetor("MONTAGEM", lista), "Montagem");
  assert.equal(rotuloSetor("OUTRO", lista), "Outro setor");
  assert.equal(listaSetores([]).length, 3);
  assert.equal(percentualMeta(8.5, 10), 85);
  assert.equal(percentualMeta(12, 10), 120);
  assert.equal(percentualMeta(5, null), null);
});

test("concretagem no valor fixo do dia (como a planilha): não cobra peça nem valor por peça", async () => {
  const { avisosDoDia, premioConcretagemDia, dividirPremio } = await import("./regras.js");
  const presencas = [{ colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" }];
  const pecas = [{ id: 9, nome: "PILAR", valor_concretagem: null }];
  const conc = [{ peca_id: 9, quantidade: 3 }];
  const fixo = avisosDoDia({ m3: 8, presencas, concretagem: [], armacao: [], pecas, premioFixo: true });
  assert.ok(!fixo.some((a) => a.includes("nenhuma peça concretada")));
  const fixo2 = avisosDoDia({ m3: 8, presencas, concretagem: conc, armacao: [], pecas, premioFixo: true });
  assert.ok(!fixo2.some((a) => a.includes("sem prêmio de concretagem")));
  const somaPecas = avisosDoDia({ m3: 8, presencas, concretagem: conc, armacao: [], pecas });
  assert.ok(somaPecas.some((a) => a.includes("sem prêmio de concretagem")));
  // valor fixo vale mesmo com peças lançadas (elas ficam só para controle)
  assert.equal(premioConcretagemDia(140, [{ quantidade: 5, valor_unit: 10 }]), 140);
  // 140 entre 7 do dia inteiro = 20 cada (dia 05/01 da planilha)
  assert.deepEqual(dividirPremio(140, Array(7).fill("P")).map((v) => Math.round(v * 100) / 100), Array(7).fill(20));
});
