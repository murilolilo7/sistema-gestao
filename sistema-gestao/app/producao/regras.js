// Regras simples do módulo Produção (sem acesso ao banco, para poder testar).

// Como cada setor ganha prêmio. Todo setor tem uma regra (setor novo escolhe
// uma ao ser criado).
export const REGRAS_PREMIO = [
  { id: "SEM", rotulo: "Sem prêmio", curto: "sem prêmio" },
  { id: "FIXO_DIA", rotulo: "Valor fixo por dia de presença", curto: "valor fixo por dia" },
  {
    id: "EQUIPE_META",
    rotulo: "Prêmio do dia dividido pela equipe, se bater a meta de m³",
    curto: "dividido pela equipe, com meta",
  },
  { id: "POR_PECA", rotulo: "Por peça produzida (valor de cada peça)", curto: "por peça" },
];
const REGRA_PADRAO = { CONCRETAGEM: "EQUIPE_META", ARMACAO: "POR_PECA" };

// Setores padrão. Os setores vêm do cadastro (tabela producao_setores) e a
// fábrica pode criar outros.
export const SETORES = [
  { id: "CONCRETAGEM", rotulo: "Concretagem", regra: "EQUIPE_META", valorDia: null },
  { id: "ARMACAO", rotulo: "Armação", regra: "POR_PECA", valorDia: null },
  { id: "OUTRO", rotulo: "Outro setor", regra: "SEM", valorDia: null },
];

// Linhas do banco ({id, nome, ordem, ativo, regra_premio, valor_dia}) -> {id, rotulo, regra, valorDia}
export function listaSetores(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return SETORES;
  return [...linhas]
    .sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || String(a.nome).localeCompare(String(b.nome)))
    .map((s) => ({
      id: s.id,
      rotulo: s.nome,
      ativo: s.ativo !== false,
      fixo: !!s.fixo,
      regra: s.regra_premio || REGRA_PADRAO[s.id] || "SEM",
      valorDia: s.valor_dia === null || s.valor_dia === undefined ? null : Number(s.valor_dia),
    }));
}

export function regraDoSetor(id, setores = SETORES) {
  return setores.find((s) => s.id === id)?.regra || REGRA_PADRAO[id] || "SEM";
}

export function rotuloRegra(regra) {
  return REGRAS_PREMIO.find((r) => r.id === regra)?.curto || "sem prêmio";
}

// Quanto do dia a pessoa fez: dia inteiro 1, meio dia ½, sem prêmio/falta 0
export function fatorDoDia(situacao) {
  return situacao === "P" ? 1 : situacao === "M" ? 0.5 : 0;
}

// Valor fixo por dia: o valor guardado no dia (não muda se o setor mudar de
// valor depois) ou, em dia ainda não salvo, o valor atual do setor.
export function valorFixoDoDia(presenca, setores = SETORES) {
  if (regraDoSetor(presenca.setor, setores) !== "FIXO_DIA") return 0;
  const salvo = presenca.valor_dia;
  const valor =
    salvo !== null && salvo !== undefined ? Number(salvo) : setores.find((s) => s.id === presenca.setor)?.valorDia;
  return (Number(valor) || 0) * fatorDoDia(presenca.situacao);
}

// A meta do dia foi batida? Dia sem meta (histórico) não tem trava.
export function metaBatida(m3, meta) {
  const m = Number(meta);
  if (!(m > 0)) return true;
  return Math.round((Number(m3) || 0) * 1000) >= Math.round(m * 1000);
}

// Meta do mês: o valor do mês (padrão 140 m³) quando informado; sem ele,
// a soma da meta de cada dia trabalhado (7 m³ × dias).
// Também conta os dias abaixo da meta do dia (dia sem meta salva usa a padrão).
export function metaDoMes(dias, metaPadrao = 7, metaMensal = null) {
  let diasTrab = 0;
  let meta = 0;
  let feito = 0;
  let batidos = 0;
  for (const d of dias) {
    const m3 = Number(d.m3_concretado) || 0;
    if (!(m3 > 0)) continue;
    const metaDia = Number(d.meta_m3) > 0 ? Number(d.meta_m3) : Number(metaPadrao) || 0;
    diasTrab += 1;
    meta += metaDia;
    feito += m3;
    if (metaBatida(m3, metaDia)) batidos += 1;
  }
  if (Number(metaMensal) > 0) meta = Number(metaMensal);
  return {
    dias: diasTrab,
    meta: Math.round(meta * 1000) / 1000,
    feito: Math.round(feito * 1000) / 1000,
    pct: meta > 0 ? Math.round((feito / meta) * 100) : null,
    batida: meta > 0 && Math.round(feito * 1000) >= Math.round(meta * 1000),
    diasBatidos: batidos,
    diasAbaixo: diasTrab - batidos,
  };
}

export function rotuloSetor(id, setores = SETORES) {
  return setores.find((s) => s.id === id)?.rotulo || SETORES.find((s) => s.id === id)?.rotulo || id;
}

// % da meta de m³ do dia (null quando não há meta)
export function percentualMeta(m3, meta) {
  const m = Number(meta);
  if (!(m > 0)) return null;
  return Math.round(((Number(m3) || 0) / m) * 100);
}

// Tira espaços sobrando: "  josé   carlos " -> "josé carlos"
export function nomeLimpo(nome) {
  return String(nome ?? "").trim().replace(/\s+/g, " ");
}

// Chave para comparar nomes sem acento e sem diferença de maiúscula
function chave(nome) {
  return nomeLimpo(nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Mesmo nome (ignorando acento, maiúscula e espaços) já cadastrado
export function nomeRepetido(nome, lista, idIgnorar = null) {
  const k = chave(nome);
  if (!k) return null;
  return lista.find((p) => p.id !== idIgnorar && chave(p.nome) === k) || null;
}

// Nome que parece ser a mesma pessoa: "Luciano Joaquim" x "Luciano Joaquim da Silva"
export function nomeParecido(nome, lista, idIgnorar = null) {
  const k = chave(nome);
  if (!k) return null;
  return (
    lista.find((p) => {
      if (p.id === idIgnorar) return false;
      const o = chave(p.nome);
      return o !== k && (o.startsWith(k + " ") || k.startsWith(o + " "));
    }) || null
  );
}

// Código interno da peça a partir do nome: "Viga de base" -> "VIGA_DE_BASE"
export function gerarTipo(nome) {
  return chave(nome).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export const SITUACOES = [
  { id: "P", rotulo: "Dia inteiro", curto: "P", cor: "bg-emerald-600 text-white border-emerald-600" },
  { id: "M", rotulo: "Meio dia", curto: "M", cor: "bg-sky-500 text-white border-sky-500" },
  { id: "S", rotulo: "Sem prêmio", curto: "S", cor: "bg-slate-500 text-white border-slate-500" },
  { id: "F", rotulo: "Falta", curto: "F", cor: "bg-rose-500 text-white border-rose-500" },
];

const trabalhou = (s) => s === "P" || s === "M";

// Divide o prêmio do dia entre quem trabalhou (igual à planilha):
// cada um fica com total ÷ presentes; quem fez meio dia (M) recebe metade
// dessa parte e o que sobra vai para quem fez o dia inteiro (P).
// S (sem prêmio) e F (falta) ficam com 0. Devolve um valor por item da lista.
export function dividirPremio(total, situacoes) {
  const t = Number(total) || 0;
  const p = situacoes.filter((s) => s === "P").length;
  const m = situacoes.filter((s) => s === "M").length;
  if (t <= 0 || p + m === 0) return situacoes.map(() => 0);
  if (p === 0) return situacoes.map((s) => (s === "M" ? t / m : 0));
  const meio = t / (p + m) / 2;
  const inteiro = (t - m * meio) / p;
  return situacoes.map((s) => (s === "P" ? inteiro : s === "M" ? meio : 0));
}

// Prêmio da concretagem no dia: o valor digitado (dias vindos da planilha)
// ou a soma das peças concretadas × valor de cada peça.
export function premioConcretagemDia(informado, pecas) {
  if (informado !== null && informado !== undefined && informado !== "") return Number(informado) || 0;
  return pecas.reduce((s, x) => s + (Number(x.quantidade) || 0) * (Number(x.valor_unit) || 0), 0);
}

// Prêmio da concretagem do dia, já com o tamanho da equipe:
// valor por pessoa × pessoas lançadas na equipe (contando quem faltou);
// dia antigo = valor total digitado; sem nenhum dos dois = soma das peças.
export function premioConcretagemDoDia(dia, pecas, pessoasNaEquipe) {
  const pp = dia?.premio_por_pessoa;
  if (pp !== null && pp !== undefined && pp !== "") return (Number(pp) || 0) * (Number(pessoasNaEquipe) || 0);
  return premioConcretagemDia(dia?.premio_concretagem_informado, pecas || []);
}

const arred = (v) => Math.round(v * 100) / 100;

// Junta o mês: por pessoa (dias, faltas, prêmios), por setor e totais.
// dias: [{data, m3_concretado, meta_m3, premio_concretagem_informado,
//         producao_presencas:[], producao_concretagem_pecas:[], producao_armacao:[]}]
// Concretagem: o prêmio do dia só é pago se o m³ bater a meta do dia; quem
// faltou não recebe e a parte dele fica com quem trabalhou.
export function resumoMes(dias, premiosMensais = [], setores = SETORES) {
  const regra = (id) => regraDoSetor(id, setores);
  const pessoas = new Map();
  const pegar = (id) => {
    if (!pessoas.has(id))
      pessoas.set(id, {
        colaborador_id: id,
        dias: 0,
        meios: 0,
        semPremio: 0,
        faltas: 0,
        diasPorSetor: { CONCRETAGEM: 0, ARMACAO: 0, OUTRO: 0 },
        porSetor: {},
        premioConcretagem: 0,
        premioArmacao: 0,
        premioFixo: 0,
        pecasArmadas: 0,
        armadasPorPeca: {},
        premioMensal: 0,
      });
    return pessoas.get(id);
  };
  const noSetor = (r, setor) =>
    (r.porSetor[setor] ||= { dias: 0, meios: 0, semPremio: 0, faltas: 0, premio: 0, pecas: 0 });
  const tot = {
    diasComProducao: 0,
    m3: 0,
    premioConcretagem: 0,
    premioArmacao: 0,
    premioFixo: 0,
    pecasConcretadas: 0,
    pecasArmadas: 0,
    diasSemPremioMeta: 0,
  };
  const porSetorTot = {};
  const somaSetor = (setor, v) => (porSetorTot[setor] = (porSetorTot[setor] || 0) + v);
  const porPecaConcretada = new Map();
  const porPecaArmada = new Map();

  for (const d of dias) {
    const pres = d.producao_presencas || [];
    const conc = d.producao_concretagem_pecas || [];
    const arm = d.producao_armacao || [];
    const m3 = Number(d.m3_concretado) || 0;
    if (m3 > 0 || arm.length > 0) tot.diasComProducao += 1;
    tot.m3 += m3;

    for (const x of pres) {
      const r = pegar(x.colaborador_id);
      const s = noSetor(r, x.setor);
      if (x.situacao === "F") {
        r.faltas += 1;
        s.faltas += 1;
      } else {
        r.dias += 1;
        s.dias += 1;
        if (x.situacao === "M") (r.meios += 1), (s.meios += 1);
        if (x.situacao === "S") (r.semPremio += 1), (s.semPremio += 1);
        r.diasPorSetor[x.setor] = (r.diasPorSetor[x.setor] || 0) + 1;
      }
      const fixo = valorFixoDoDia(x, setores);
      if (fixo > 0) {
        r.premioFixo += fixo;
        s.premio += fixo;
        tot.premioFixo += fixo;
        somaSetor(x.setor, fixo);
      }
    }

    const equipe = pres.filter((x) => regra(x.setor) === "EQUIPE_META");
    const bateu = metaBatida(m3, d.meta_m3);
    const premioDia = bateu ? premioConcretagemDoDia(d, conc, equipe.length) : 0;
    if (!bateu && equipe.some((x) => trabalhou(x.situacao))) tot.diasSemPremioMeta += 1;
    const partes = dividirPremio(premioDia, equipe.map((x) => x.situacao));
    equipe.forEach((x, i) => {
      const r = pegar(x.colaborador_id);
      r.premioConcretagem += partes[i];
      noSetor(r, x.setor).premio += partes[i];
      somaSetor(x.setor, partes[i]);
    });
    if (equipe.some((x) => trabalhou(x.situacao))) tot.premioConcretagem += premioDia;

    for (const c of conc) {
      tot.pecasConcretadas += Number(c.quantidade) || 0;
      porPecaConcretada.set(c.peca_id, (porPecaConcretada.get(c.peca_id) || 0) + (Number(c.quantidade) || 0));
    }
    for (const a of arm) {
      const r = pegar(a.colaborador_id);
      const q = Number(a.quantidade) || 0;
      const v = q * (Number(a.valor_unit) || 0);
      const setor = pres.find((x) => x.colaborador_id === a.colaborador_id)?.setor || "ARMACAO";
      const s = noSetor(r, setor);
      r.premioArmacao += v;
      r.pecasArmadas += q;
      r.armadasPorPeca[a.peca_id] = (r.armadasPorPeca[a.peca_id] || 0) + q;
      s.premio += v;
      s.pecas += q;
      somaSetor(setor, v);
      tot.premioArmacao += v;
      tot.pecasArmadas += q;
      porPecaArmada.set(a.peca_id, (porPecaArmada.get(a.peca_id) || 0) + q);
    }
  }

  let premioMensal = 0;
  for (const pm of premiosMensais) {
    pegar(pm.colaborador_id).premioMensal += Number(pm.valor) || 0;
    premioMensal += Number(pm.valor) || 0;
  }

  const linhas = [...pessoas.values()].map((r) => ({
    ...r,
    porSetor: Object.fromEntries(Object.entries(r.porSetor).map(([k, s]) => [k, { ...s, premio: arred(s.premio) }])),
    premioConcretagem: arred(r.premioConcretagem),
    premioArmacao: arred(r.premioArmacao),
    premioFixo: arred(r.premioFixo),
    total: arred(r.premioConcretagem + r.premioArmacao + r.premioFixo + r.premioMensal),
  }));
  return {
    linhas,
    totais: {
      ...tot,
      m3: Math.round(tot.m3 * 1000) / 1000,
      premioConcretagem: arred(tot.premioConcretagem),
      premioArmacao: arred(tot.premioArmacao),
      premioFixo: arred(tot.premioFixo),
      premioMensal: arred(premioMensal),
      total: arred(tot.premioConcretagem + tot.premioArmacao + tot.premioFixo + premioMensal),
    },
    porSetor: Object.fromEntries(Object.entries(porSetorTot).map(([k, v]) => [k, arred(v)])),
    porPecaConcretada,
    porPecaArmada,
  };
}

// Custo real da mão de obra do mês.
// O custo de cada pessoa (salário da função + encargos) é repartido entre os
// setores pelos dias em que ela foi marcada em cada um. Assim quem ajuda em
// outro setor só pesa nos dias em que esteve lá.
//   concretagem R$/m³ = (custo da equipe + prêmios da concretagem) ÷ m³
//   armação: custo de cada R$ 1 de prêmio = (custo dos armadores + prêmios) ÷ prêmios
export function custoMaoObraMes(resumo, custoMensalPorPessoa) {
  const setor = { CONCRETAGEM: { custo: 0, pessoas: 0 }, ARMACAO: { custo: 0, pessoas: 0 } };
  let semFuncao = 0;
  for (const r of resumo.linhas) {
    const total = r.dias + r.faltas;
    if (total === 0) continue;
    const custo = custoMensalPorPessoa(r.colaborador_id);
    if (custo === null || custo === undefined) {
      semFuncao += 1;
      continue;
    }
    for (const s of ["CONCRETAGEM", "ARMACAO"]) {
      // faltas contam no setor principal (o maior)
      const diasSetor = r.diasPorSetor[s] || 0;
      const principal = Object.entries(r.diasPorSetor).sort((a, b) => b[1] - a[1])[0][0];
      const peso = (diasSetor + (principal === s ? r.faltas : 0)) / total;
      if (peso > 0) {
        setor[s].custo += custo * peso;
        setor[s].pessoas += 1;
      }
    }
  }
  const t = resumo.totais;
  const premioMensalConc = resumo.linhas
    .filter((r) => (r.diasPorSetor.CONCRETAGEM || 0) >= (r.diasPorSetor.ARMACAO || 0))
    .reduce((s, r) => s + r.premioMensal, 0);
  const custoConc = setor.CONCRETAGEM.custo + t.premioConcretagem + premioMensalConc;
  const custoArm = setor.ARMACAO.custo + t.premioArmacao + (t.premioMensal - premioMensalConc);
  return {
    concretagem: {
      pessoas: setor.CONCRETAGEM.pessoas,
      salarios: arred(setor.CONCRETAGEM.custo),
      premios: arred(t.premioConcretagem + premioMensalConc),
      total: arred(custoConc),
      porM3: t.m3 > 0 ? arred(custoConc / t.m3) : null,
    },
    armacao: {
      pessoas: setor.ARMACAO.pessoas,
      salarios: arred(setor.ARMACAO.custo),
      premios: arred(t.premioArmacao),
      total: arred(custoArm),
      porReal: t.premioArmacao > 0 ? Math.round((custoArm / t.premioArmacao) * 1000) / 1000 : null,
    },
    semFuncao,
  };
}

// Avisos do dia antes de salvar (não impedem salvar)
export function avisosDoDia({ m3, presencas, concretagem, armacao, pecas, premioFixo = false, setores = SETORES }) {
  const avisos = [];
  const regra = (id) => regraDoSetor(id, setores);
  const equipe = presencas.filter((p) => regra(p.setor) === "EQUIPE_META" && trabalhou(p.situacao));
  const temM3 = (Number(m3) || 0) > 0;
  if (temM3 && equipe.length === 0) avisos.push("Tem m³ concretado, mas ninguém marcado na concretagem.");
  if (!temM3 && equipe.length > 0) avisos.push("Tem gente marcada na concretagem, mas o m³ do dia está vazio.");
  if (!temM3 && concretagem.length > 0) avisos.push("Tem peças concretadas, mas o m³ do dia está vazio.");
  if (!premioFixo && temM3 && concretagem.length === 0)
    avisos.push("Tem m³, mas nenhuma peça concretada lançada (o prêmio da equipe fica zero).");
  const semValor = (premioFixo ? [] : concretagem)
    .map((c) => pecas.find((p) => p.id === c.peca_id))
    .filter((p) => p && (p.valor_concretagem === null || p.valor_concretagem === undefined));
  if (semValor.length)
    avisos.push(`Peça sem prêmio de concretagem cadastrado: ${semValor.map((p) => p.nome).join(", ")} (conta como R$ 0).`);
  const armadores = new Set(armacao.map((a) => a.colaborador_id));
  const parados = presencas.filter(
    (p) => regra(p.setor) === "POR_PECA" && trabalhou(p.situacao) && !armadores.has(p.colaborador_id)
  );
  if (parados.length) avisos.push(`${parados.length} na armação sem nenhuma peça lançada.`);
  return avisos;
}

// Custo mensal da função = salário × (1 + encargos)
export function custoMensalFuncao(funcao) {
  if (!funcao) return null;
  const salario = Number(funcao.salario_bruto) || 0;
  const encargos = Number(funcao.encargos_pct) || 0;
  return salario * (1 + encargos / 100);
}
