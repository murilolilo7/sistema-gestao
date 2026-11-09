// ORÇAR POR PROJETO: obra fora do padrão (grade irregular, castelo d'água...),
// em que as quantidades vêm do quadro "Informações importantes" da folha de
// compatibilização, e não das medidas do galpão. Cada função devolve a peça
// pronta para entrar na lista do orçamento, ou { erro }. Só contas, sem tela.
import { papelDoItem, precoTercaInterpolado, volumeVigaLaje } from "./calculos.js";

const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const inteiro = (v) => Math.floor(num(v));
const virgula = (n, casas = 2) => Number(n).toFixed(casas).replace(".", ",");
const centavos = (v) => Math.round(v * 100) / 100;

export const ESPESSURA_PLATIBANDA_PADRAO = 0.15;

// Comprimento = peça inteira, com fundação e platibanda (como na folha: 10,50 m).
// Na platibanda só uma fatia da seção sobe, por isso ela entra com a espessura
// própria, como no pilar calculado. Preço = volume × valor do m³ armado.
export function pilarDoProjeto({
  qtd,
  comprimento,
  platibanda = 0,
  espessuraPlatibanda = ESPESSURA_PLATIBANDA_PADRAO,
  largura = 0.25,
  altura = 0.4,
  comConsolo = false,
  deLaje = false,
  valorM3,
}) {
  const q = inteiro(qtd);
  const L = num(comprimento);
  const plat = num(platibanda);
  const b = num(largura);
  const h = num(altura);
  if (q <= 0 || L <= 0) return { erro: "Informe a quantidade e o comprimento do pilar." };
  if (b <= 0 || h <= 0) return { erro: "Informe a seção do pilar." };
  if (plat >= L) return { erro: "A platibanda não pode ser maior que o pilar." };
  const volume = b * h * (L - plat) + b * num(espessuraPlatibanda) * plat;
  return {
    composicao_id: null,
    nome:
      `PILAR ${virgula(b)}x${virgula(h)} - ${virgula(L)}m` +
      (plat > 0 ? ` (${virgula(plat)} platibanda)` : "") +
      (deLaje ? " — de laje" : comConsolo ? " — com consolo" : ""),
    unidade: "PÇ",
    papel: "PILAR",
    quantidade: q,
    preco_unitario: centavos(volume * num(valorM3)),
    secao: deLaje ? "laje" : "estrutura",
  };
}

export function referenciaMaisProxima(comprimento, referencias) {
  const L = num(comprimento);
  const validas = (referencias || []).filter((r) => num(r.comprimento_referencia) > 0 && num(r.preco) > 0);
  if (L <= 0 || validas.length === 0) return null;
  return [...validas].sort(
    (a, b) => Math.abs(num(a.comprimento_referencia) - L) - Math.abs(num(b.comprimento_referencia) - L)
  )[0];
}

// Mesma conta da tesoura proporcional do orçamento: R$ por metro da referência.
export function tesouraDoProjeto({ qtd, comprimento, referencia }) {
  const q = inteiro(qtd);
  const L = num(comprimento);
  if (q <= 0 || L <= 0) return { erro: "Informe a quantidade e o comprimento da tesoura." };
  if (!referencia) return { erro: "Escolha a tesoura de referência." };
  return {
    composicao_id: null,
    nome: `Tesoura ${L}M de vão livre (calculada proporcionalmente a partir da ${referencia.nome})`,
    unidade: "PÇ",
    papel: "TESOURA",
    quantidade: q,
    preco_unitario: centavos((num(referencia.preco) / num(referencia.comprimento_referencia)) * L),
    secao: "estrutura",
  };
}

// pontos = terças do catálogo: [{ medida, preco }]
export function tercaDoProjeto({ qtd, comprimento, pontos }) {
  const q = inteiro(qtd);
  const L = num(comprimento);
  if (q <= 0 || L <= 0) return { erro: "Informe a quantidade e o comprimento da terça." };
  const preco = precoTercaInterpolado(L, pontos);
  if (preco <= 0) return { erro: "Não há terça no catálogo para calcular o preço." };
  return {
    composicao_id: null,
    nome: `TERÇA ${virgula(L)}M`,
    unidade: "PÇ",
    papel: "TERCA",
    quantidade: q,
    preco_unitario: preco,
    secao: "estrutura",
  };
}

export function travamentoDoProjeto({ qtd, comprimento, valorM3 }) {
  const q = inteiro(qtd);
  const L = num(comprimento);
  if (q <= 0 || L <= 0) return { erro: "Informe a quantidade e o comprimento da viga." };
  return {
    composicao_id: null,
    nome: `VIGA DE TRAVAMENTO 0,15X0,30X${virgula(L)}M`,
    unidade: "UND",
    papel: "VIGA_TRAVAMENTO",
    quantidade: q,
    preco_unitario: centavos(0.15 * 0.3 * L * num(valorM3)),
    secao: "estrutura",
  };
}

// A folha traz as vigas em METROS (65 m). Os trechos são as peças de fato, e é
// por peça que contam a montagem e a armação; o preço usa o comprimento médio.
export function vigaDoProjeto({ trechos, metros, altura, valorM3, aproveitamento }) {
  const q = inteiro(trechos);
  const m = num(metros);
  const h = num(altura);
  if (q <= 0 || m <= 0) return { erro: "Informe os metros de viga e em quantos trechos ela se divide." };
  if (h <= 0) return { erro: "Informe a altura da viga." };
  const medio = m / q;
  const { volume } = volumeVigaLaje(medio, h, aproveitamento);
  return {
    composicao_id: null,
    nome:
      `VIGA PARA LAJE 0,25X${virgula(h)}X${virgula(medio)}M` +
      ` — ${virgula(m)} m no total, ${q} trecho${q > 1 ? "s" : ""} · adicionada à mão`,
    unidade: "UND",
    papel: "VIGA_LAJE",
    quantidade: q,
    preco_unitario: centavos(volume * num(valorM3)),
    secao: "laje",
  };
}

// Com "local" (ex.: Castelo) a linha sai descrita, para não confundir com a
// laje principal do mesmo tipo.
export function lajeDoProjeto({ composicao, area, local }) {
  const a = num(area);
  if (!composicao) return { erro: "Escolha o tipo de laje." };
  if (a <= 0) return { erro: "Informe a área da laje." };
  const texto = String(local || "").trim();
  return {
    composicao_id: texto ? null : composicao.id,
    nome: texto ? `${composicao.nome} — ${texto}` : composicao.nome,
    unidade: composicao.unidade,
    papel: "LAJE",
    quantidade: centavos(a),
    preco_unitario: num(composicao.preco),
    secao: "laje",
  };
}

export function telhaDoProjeto({ composicao, area, perda = 0 }) {
  const a = num(area);
  if (!composicao) return { erro: "Escolha o tipo de telha." };
  if (a <= 0) return { erro: "Informe a área da coberta." };
  return {
    composicao_id: composicao.id,
    nome: composicao.nome,
    unidade: composicao.unidade,
    papel: composicao.papel,
    quantidade: centavos(a * (1 + Math.max(0, num(perda)) / 100)),
    preco_unitario: num(composicao.preco),
    secao: "estrutura",
  };
}

// Totais do que já foi lançado, para conferir com o quadro da folha.
export function resumoProjeto(itens) {
  const r = { pilares: 0, tesouras: 0, tercas: 0, travamentos: 0, vigas: 0, lajeM2: 0, telhaM2: 0 };
  const chave = {
    PILAR: "pilares",
    TESOURA: "tesouras",
    TERCA: "tercas",
    VIGA_TRAVAMENTO: "travamentos",
    VIGA_LAJE: "vigas",
    LAJE: "lajeM2",
    TELHA: "telhaM2",
  };
  for (const item of itens || []) {
    const c = chave[papelDoItem(item)];
    if (c) r[c] += num(item.quantidade);
  }
  return r;
}

// Área de laje lançada: é ela que divide o valor/m² da seção da laje.
export function areaLajeDoProjeto(itens) {
  return resumoProjeto(itens).lajeM2;
}
