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

// ---------------------------------------------------------------- meta de 7 m³ e regra por setor
import { metaBatida, metaDoMes, valorFixoDoDia, listaSetores, regraDoSetor, premioConcretagemDoDia, bonusDoMes } from "./regras.js";

const SETORES_TESTE = listaSetores([
  { id: "CONCRETAGEM", nome: "Concretagem", ordem: 1, fixo: true, regra_premio: "EQUIPE_META" },
  { id: "ARMACAO", nome: "Armação", ordem: 2, fixo: true, regra_premio: "POR_PECA" },
  { id: "QUALIDADE", nome: "Qualidade", ordem: 50, regra_premio: "FIXO_DIA", valor_dia: 14 },
  { id: "MONTAGEM", nome: "Montagem", ordem: 51, regra_premio: "SEM" },
]);

test("meta do dia: 7 m³ bate, 6,99 não; dia sem meta não trava", () => {
  assert.equal(metaBatida(7, 7), true);
  assert.equal(metaBatida(7.4, 7), true);
  assert.equal(metaBatida(6.99, 7), false);
  assert.equal(metaBatida(4, null), true);
});

test("meta do mês = 7 × dias trabalhados (10 dias = 70 m³, mesmo sem chegar a 140)", () => {
  const dias = Array.from({ length: 10 }, () => ({ m3_concretado: 7, meta_m3: 7 }));
  const m = metaDoMes(dias, 7);
  assert.equal(m.dias, 10);
  assert.equal(m.meta, 70);
  assert.equal(m.batida, true);
  assert.equal(m.diasAbaixo, 0);
});

test("dia abaixo da meta não paga ninguém, mesmo o mês batendo 140", () => {
  const dia = (data, m3, pres) => ({
    data,
    m3_concretado: m3,
    meta_m3: 7,
    premio_concretagem_informado: 140,
    producao_presencas: pres,
    producao_concretagem_pecas: [],
    producao_armacao: [],
  });
  const equipe = [1, 2, 3, 4].map((id) => ({ colaborador_id: id, setor: "CONCRETAGEM", situacao: "P" }));
  const dias = [dia("2026-01-05", 9, equipe), dia("2026-01-06", 6.5, equipe), dia("2026-01-07", 8, equipe)];
  const r = resumoMes(dias, [], SETORES_TESTE);
  // só 2 dias pagam: 2 × 140 = 280; cada um 70
  assert.equal(r.totais.premioConcretagem, 280);
  assert.equal(r.linhas.find((l) => l.colaborador_id === 1).premioConcretagem, 70);
  assert.equal(r.totais.diasSemPremioMeta, 1);
  assert.equal(metaDoMes(dias, 7).diasAbaixo, 1);
});

test("quem faltou perde o dia; a parte fica com quem trabalhou (meio dia = metade)", () => {
  const pres = [
    { colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" },
    { colaborador_id: 2, setor: "CONCRETAGEM", situacao: "P" },
    { colaborador_id: 3, setor: "CONCRETAGEM", situacao: "M" },
    { colaborador_id: 4, setor: "CONCRETAGEM", situacao: "F" },
  ];
  const r = resumoMes(
    [{ m3_concretado: 7.2, meta_m3: 7, premio_concretagem_informado: 140, producao_presencas: pres }],
    [],
    SETORES_TESTE
  );
  const de = (id) => r.linhas.find((l) => l.colaborador_id === id).premioConcretagem;
  assert.equal(de(4), 0);
  // 3 trabalharam: meio dia = 140 ÷ 3 ÷ 2 = 23,33; o resto (116,67) fica com os 2 do dia inteiro
  assert.ok(Math.abs(de(1) + de(2) + de(3) - 140) < 0.02);
  assert.equal(de(3), 23.33);
  assert.equal(de(1), 58.33);
});

test("setor com valor fixo por dia: Qualidade R$ 14, meio dia R$ 7; Montagem não ganha", () => {
  assert.equal(regraDoSetor("QUALIDADE", SETORES_TESTE), "FIXO_DIA");
  assert.equal(valorFixoDoDia({ setor: "QUALIDADE", situacao: "P" }, SETORES_TESTE), 14);
  assert.equal(valorFixoDoDia({ setor: "QUALIDADE", situacao: "M" }, SETORES_TESTE), 7);
  assert.equal(valorFixoDoDia({ setor: "QUALIDADE", situacao: "F" }, SETORES_TESTE), 0);
  // valor guardado no dia vale mais que o valor de hoje do setor
  assert.equal(valorFixoDoDia({ setor: "QUALIDADE", situacao: "P", valor_dia: 12 }, SETORES_TESTE), 12);
  assert.equal(valorFixoDoDia({ setor: "MONTAGEM", situacao: "P" }, SETORES_TESTE), 0);

  const dias = [
    { m3_concretado: 0, producao_presencas: [{ colaborador_id: 9, setor: "QUALIDADE", situacao: "P", valor_dia: 14 }] },
    { m3_concretado: 0, producao_presencas: [{ colaborador_id: 9, setor: "MONTAGEM", situacao: "P" }] },
    { m3_concretado: 0, producao_presencas: [{ colaborador_id: 9, setor: "QUALIDADE", situacao: "M", valor_dia: 14 }] },
  ];
  const r = resumoMes(dias, [], SETORES_TESTE);
  const l = r.linhas[0];
  assert.equal(l.premioFixo, 21);
  assert.equal(l.total, 21);
  assert.equal(l.porSetor.QUALIDADE.dias, 2);
  assert.equal(l.porSetor.MONTAGEM.dias, 1);
  assert.equal(r.porSetor.QUALIDADE, 21);
});

test("prêmio de cada setor fica separado (para o relatório por setor)", () => {
  const dias = [
    {
      m3_concretado: 8,
      meta_m3: 7,
      premio_concretagem_informado: 140,
      producao_presencas: [
        { colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" },
        { colaborador_id: 2, setor: "ARMACAO", situacao: "P" },
      ],
      producao_armacao: [{ colaborador_id: 2, peca_id: 5, quantidade: 3, valor_unit: 10 }],
    },
  ];
  const r = resumoMes(dias, [], SETORES_TESTE);
  assert.equal(r.porSetor.CONCRETAGEM, 140);
  assert.equal(r.porSetor.ARMACAO, 30);
  const arm = r.linhas.find((l) => l.colaborador_id === 2);
  assert.equal(arm.porSetor.ARMACAO.pecas, 3);
  assert.equal(arm.armadasPorPeca[5], 3);
});

test("concretagem: R$ 14 × pessoas lançadas na equipe (com faltosos), dividido entre quem trabalhou", () => {
  const pres = [
    ...Array.from({ length: 11 }, (_, i) => ({ colaborador_id: i + 1, setor: "CONCRETAGEM", situacao: "P" })),
    ...[12, 13, 14].map((id) => ({ colaborador_id: id, setor: "CONCRETAGEM", situacao: "F" })),
  ];
  assert.equal(premioConcretagemDoDia({ premio_por_pessoa: 14 }, [], pres.length), 196);
  const r = resumoMes(
    [{ m3_concretado: 8, meta_m3: 7, premio_por_pessoa: 14, producao_presencas: pres }],
    [],
    SETORES_TESTE
  );
  assert.equal(r.totais.premioConcretagem, 196);
  assert.equal(r.linhas.find((l) => l.colaborador_id === 1).premioConcretagem, 17.82);
  assert.equal(r.linhas.find((l) => l.colaborador_id === 12).premioConcretagem, 0);
  // dia antigo com valor total continua igual
  assert.equal(premioConcretagemDoDia({ premio_concretagem_informado: 140 }, [], 14), 140);
});

test("meta do mês fixa (140 m³) quando informada", () => {
  const dias = Array.from({ length: 20 }, () => ({ m3_concretado: 7.5, meta_m3: 7 }));
  const m = metaDoMes(dias, 7, 140);
  assert.equal(m.meta, 140);
  assert.equal(m.batida, true);
  assert.equal(metaDoMes(dias.slice(0, 10), 7, 140).batida, false);
});

test("bônus pelas vagas: só se bater a meta do mês, e vale quem ocupava a vaga no fim do mês", () => {
  const hist = [
    { id: 1, vaga_id: 1, desde: "2026-11-01", nome: "Vaga 1", valor: 200, colaborador_id: 10, ativo: true },
    { id: 2, vaga_id: 2, desde: "2026-11-01", nome: "Vaga 2", valor: 100, colaborador_id: 1, ativo: true },
    // em dezembro a vaga 2 passa para a pessoa 5
    { id: 3, vaga_id: 2, desde: "2026-12-10", nome: "Vaga 2", valor: 100, colaborador_id: 5, ativo: true },
  ];
  assert.equal(bonusDoMes("2026-11", hist, false).size, 0);
  const nov = bonusDoMes("2026-11", hist, true);
  assert.equal(nov.get(10).valor, 200);
  assert.equal(nov.get(1).valor, 100);
  const dez = bonusDoMes("2026-12", hist, true);
  assert.equal(dez.get(5).valor, 100);
  assert.equal(dez.has(1), false);
  // mês antes de existir a vaga: nada
  assert.equal(bonusDoMes("2026-10", hist, true).size, 0);
  // valor digitado no mês manda mais que o da vaga
  const r = resumoMes([], [{ colaborador_id: 10, valor: 0 }], SETORES_TESTE, nov);
  assert.equal(r.linhas.find((l) => l.colaborador_id === 10).premioMensal, 0);
  assert.equal(r.linhas.find((l) => l.colaborador_id === 1).premioMensal, 100);
  assert.equal(r.totais.premioMensal, 100);
});

test("custo por m³ conta o salário de quem está em setor sem divisão", () => {
  const setores = listaSetores([
    { id: "CONCRETAGEM", nome: "Concretagem", regra_premio: "EQUIPE_META" },
    { id: "ARMACAO", nome: "Armação", regra_premio: "POR_PECA" },
    { id: "SUPERVISAO", nome: "Supervisão", regra_premio: "SEM" },
  ]);
  const dias = [
    {
      m3_concretado: 10,
      meta_m3: 7,
      premio_por_pessoa: 14,
      producao_presencas: [
        { colaborador_id: 1, setor: "CONCRETAGEM", situacao: "P" },
        { colaborador_id: 2, setor: "SUPERVISAO", situacao: "P" },
        { colaborador_id: 3, setor: "ARMACAO", situacao: "P" },
      ],
    },
  ];
  const r = resumoMes(dias, [], setores);
  const c = custoMaoObraMes(r, () => 3000, setores);
  assert.equal(c.concretagem.salarios, 6000);
  assert.equal(c.concretagem.salariosOutros, 3000);
  assert.equal(c.armacao.salarios, 3000);
  assert.equal(c.concretagem.porM3, r2((6000 + 14) / 10));
});
