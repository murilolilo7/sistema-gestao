// =====================================================================
// PILAR — FORMA 4 (pré-dimensionamento para ORÇAMENTO)
//
// Calcula quanto aço o pilar precisa a partir do galpão: vento (NBR 6123),
// carga da coberta e da laje, flexo-compressão (NBR 6118). Depois escolhe a
// armação padrão da fábrica que atende.
//
// NÃO é projeto estrutural: as hipóteses abaixo foram calibradas com os
// 307 pilares dos projetos de fabricação da MR7 (D:\GALPOES PARA VERIFICAÇÃO,
// out/2026) e precisam ser confirmadas pelo engenheiro responsável.
//
// Unidades: metros, kN, kN·m, cm² (aço).
// Funções puras — sem banco, sem React — testadas em calculo.test.js.
// =====================================================================

// Hipóteses padrão (valores mais comuns da norma; ver tela de parâmetros)
export const PARAMETROS_PADRAO = {
  fck: 35, // MPa — traço do sistema
  fyk: 500, // MPa — CA-50
  gamaC: 1.4,
  gamaS: 1.15,
  gamaF: 1.4,
  cobrimentoBarra: 0.04, // m — do centro da barra à face (3 cm + estribo + meia barra)
  cargaCoberta: 0.6, // kN/m² — telha + terça + tesoura (por área de planta)
  pesoConcreto: 25, // kN/m³
  cargaPermanenteLaje: 3.0, // kN/m² — laje + revestimento
  excentricidadeConsolo: 0.3, // m — do eixo do pilar ao apoio da viga no consolo
  // Parte do momento do consolo que chega ao pé do pilar. A tesoura amarra o
  // topo dos dois pilares do pórtico (os dois consolos puxam para dentro), o
  // que alivia a base — 0,7 deixou o aço calculado igual ao dos projetos
  // (mediana dos 70 pilares com laje).
  fatorMomentoLaje: 0.7,
  // Rigidez reduzida do pilar fissurado para o efeito de 2ª ordem (P-Δ)
  fatorRigidez: 0.7,
  coefFechado: 1.2, // barlavento +0,7 e sotavento −0,5 (NBR 6123, paredes)
  coefPilarIsolado: 2.0, // galpão aberto: vento direto no pilar
};

// Terreno ao redor (NBR 6123, fator S2). "Cidade" usa a categoria III, que
// é mais conservadora que a IV e foi a que melhor bateu com os projetos.
export const TERRENOS = {
  aberto: { rotulo: "Campo aberto", categoria: "II", b: 1.0, p: 0.085, Fr: 1.0 },
  cidade: { rotulo: "Cidade (casas em volta)", categoria: "III", b: 0.94, p: 0.1, Fr: 0.98 },
};

// Armações que a fábrica já usa, da mais leve para a mais pesada
// (levantadas dos projetos). Área por face ≈ metade da área total.
const AREA_BARRA = { 10: 0.785, 12.5: 1.227, 16: 2.011, 20: 3.142 };
const KG_POR_M = { 5: 0.154, 10: 0.617, 12.5: 0.963, 16: 1.578, 20: 2.466 };

function armacao(descricao) {
  const barras = [...descricao.matchAll(/(\d+)ø(\d+(?:[.,]\d)?)/g)].map((m) => ({
    n: Number(m[1]),
    d: Number(m[2].replace(",", ".")),
  }));
  const area = barras.reduce((s, b) => s + b.n * (AREA_BARRA[b.d] || 0), 0);
  const kgPorMetro = barras.reduce((s, b) => s + b.n * (KG_POR_M[b.d] || 0), 0);
  return { descricao, barras, area: Number(area.toFixed(2)), kgPorMetro: Number(kgPorMetro.toFixed(3)) };
}

export const SECOES = {
  "40x25": {
    h: 0.4,
    b: 0.25,
    perimetroEstribo: 1.21,
    armacoes: [
      "4ø16+2ø10",
      "4ø16+2ø12.5",
      "4ø16+4ø10",
      "4ø16+2ø12.5+2ø10",
      "4ø16+4ø12.5",
      "6ø16+2ø12.5",
      "8ø16",
      "4ø20+2ø16+2ø12.5",
      "4ø20+4ø16",
      "6ø20+2ø16",
      "8ø20",
    ].map(armacao),
  },
  "30x25": {
    h: 0.3,
    b: 0.25,
    perimetroEstribo: 1.01,
    armacoes: ["4ø12.5+2ø10", "6ø12.5", "6ø12.5+2ø10", "4ø16+2ø10", "4ø16+2ø12.5", "6ø16"].map(armacao),
  },
  "25x25": {
    h: 0.25,
    b: 0.25,
    perimetroEstribo: 0.86,
    armacoes: ["4ø12.5+2ø10", "6ø12.5", "4ø16+2ø10"].map(armacao),
  },
};

// ---------------------------------------------------------------------
// VENTO
// ---------------------------------------------------------------------

export function fatorS2(altura, terreno = "cidade") {
  const t = TERRENOS[terreno] || TERRENOS.cidade;
  const z = Math.max(altura, 5); // abaixo de 5 m a norma não reduz mais
  return t.b * t.Fr * Math.pow(z / 10, t.p);
}

// Pressão dinâmica q = 0,613·Vk² (N/m²) → devolve kN/m²
export function pressaoDinamica(V0, altura, terreno = "cidade") {
  const Vk = V0 * 1.0 * fatorS2(altura, terreno) * 1.0; // S1 = S3 = 1
  return (0.613 * Vk * Vk) / 1000;
}

// ---------------------------------------------------------------------
// ESFORÇOS NO PÉ DO PILAR (por pilar, valores característicos e de cálculo)
// ---------------------------------------------------------------------

export function esforcosPilar(entrada, parametros = PARAMETROS_PADRAO) {
  const P = { ...PARAMETROS_PADRAO, ...parametros };
  const {
    altura, // m — do chão ao topo do pilar
    vao, // m — largura do galpão (vão da tesoura)
    modulacao, // m — distância entre pórticos
    V0 = 30,
    terreno = "cidade",
    fechado = true,
    secao = "40x25",
    laje = null, // { carga: 300 | 500 (kg/m²) }
  } = entrada;
  const S = SECOES[secao] || SECOES["40x25"];

  const q = pressaoDinamica(V0, altura, terreno);
  // A tesoura apoia no dente a ~1,47 m do topo (1,16 + 0,31 nos projetos);
  // a faixa de cima (cabeça do pilar + ponta da tesoura/platibanda) pega
  // vento como uma tira na altura do topo.
  const cabeca = Math.min(P.alturaCabeca ?? 1.47, altura * 0.3);
  const hParede = altura - cabeca;
  const forcaTopo = P.coefFechado * q * modulacao * cabeca; // kN, no pórtico
  // Vento total no pórtico, dividido pelos dois pilares (a tesoura amarra os topos)
  let Mw;
  if (fechado) {
    const w = P.coefFechado * q * modulacao; // kN/m na altura da parede
    Mw = ((w * hParede * hParede) / 2 + forcaTopo * (altura - cabeca / 2)) / 2;
  } else {
    const wPilar = P.coefPilarIsolado * q * S.h; // vento só no próprio pilar
    Mw = (wPilar * altura * altura) / 2 + (forcaTopo * (altura - cabeca / 2)) / 2;
  }

  const Ncoberta = P.cargaCoberta * modulacao * (vao / 2);
  const Nproprio = S.b * S.h * P.pesoConcreto * altura;
  const cargaLaje = laje ? P.cargaPermanenteLaje + (Number(laje.carga) || 300) / 100 : 0;
  const Nlaje = laje ? cargaLaje * modulacao * (vao / 2) : 0;
  const Mlaje = Nlaje * P.excentricidadeConsolo * P.fatorMomentoLaje;

  const Nk = Ncoberta + Nproprio + Nlaje;
  const Nd = P.gamaF * Nk;
  const M1d = P.gamaF * (Mw + Mlaje);

  // 2ª ordem (P-Δ simplificado): deslocamento do topo pelo momento de 1ª
  // ordem, com rigidez reduzida, vezes a força normal de cálculo
  const Ec = 5600 * Math.sqrt(P.fck) * 1000; // kN/m²
  const I = (S.b * Math.pow(S.h, 3)) / 12;
  const EI = P.fatorRigidez * Ec * I;
  const deslocamento = (M1d * altura * altura) / (4 * EI);
  const M2d = Nd * deslocamento;
  // Deslocamento do topo só com o vento característico (para o aviso de pilar flexível)
  const deslocamentoVento = (Mw * altura * altura) / (4 * EI);

  return {
    q: arred(q, 3),
    Mw: arred(Mw, 1),
    Mlaje: arred(Mlaje, 1),
    Nk: arred(Nk, 1),
    Nd: arred(Nd, 1),
    M1d: arred(M1d, 1),
    M2d: arred(M2d, 1),
    Md: arred(M1d + M2d, 1),
    deslocamentoTopo: arred(deslocamentoVento, 3),
  };
}

// ---------------------------------------------------------------------
// FLEXO-COMPRESSÃO — seção retangular, armadura igual nas duas faces
// ---------------------------------------------------------------------

export function momentoResistente(asFaceCm2, Nd, secao = "40x25", parametros = PARAMETROS_PADRAO) {
  const P = { ...PARAMETROS_PADRAO, ...parametros };
  const S = SECOES[secao] || SECOES["40x25"];
  const fcd = (P.fck / P.gamaC) * 1000;
  const fyd = (P.fyk / P.gamaS) * 1000;
  const Es = 210e6;
  const As = asFaceCm2 / 1e4;
  const { b, h } = S;
  const dl = P.cobrimentoBarra;
  const d = h - dl;

  const resultante = (x) => {
    const tensao = (y) => Math.max(-fyd, Math.min(fyd, (0.0035 * (x - y) * Es) / x));
    const y = Math.min(0.8 * x, h);
    const C = 0.85 * fcd * b * y;
    const s1 = tensao(dl);
    const s2 = tensao(d);
    return {
      N: C + As * (s1 + s2),
      M: C * (h / 2 - y / 2) + As * s1 * (h / 2 - dl) - As * s2 * (d - h / 2),
    };
  };
  let lo = 1e-4;
  let hi = 3 * h;
  for (let i = 0; i < 80; i++) {
    const x = (lo + hi) / 2;
    if (resultante(x).N > Nd) hi = x;
    else lo = x;
  }
  return resultante((lo + hi) / 2).M;
}

// Menor área por face (cm²) que resiste a (Nd, Md). null = seção não atende.
export function asNecessariaPorFace(Nd, Md, secao = "40x25", parametros) {
  for (let k = 0; k <= 400; k++) {
    const as = k * 0.05;
    if (momentoResistente(as, Nd, secao, parametros) >= Md) return arred(as, 2);
  }
  return null;
}

// Armação padrão mais leve cuja área por face (≈ metade do total) atende
export function escolherArmacao(secao, asFace) {
  const S = SECOES[secao] || SECOES["40x25"];
  if (asFace === null) return null;
  return S.armacoes.find((a) => a.area / 2 >= asFace) || null;
}

// ---------------------------------------------------------------------
// CÁLCULO COMPLETO
// ---------------------------------------------------------------------

export function calcularPilarForma4(entrada, parametros) {
  const secao = SECOES[entrada.secao] ? entrada.secao : "40x25";
  const esf = esforcosPilar({ ...entrada, secao }, parametros);
  const asFace = asNecessariaPorFace(esf.Nd, esf.Md, secao, parametros);
  const escolhida = escolherArmacao(secao, asFace);
  const avisos = [];
  if (asFace === null || !escolhida) {
    avisos.push(`A seção ${secao} não atende esse pilar — precisa de seção maior (consultar o engenheiro).`);
  }
  if (esf.deslocamentoTopo > entrada.altura / 150) {
    // H/150 com o vento de projeto: bem acima do usual em galpão (H/300 a H/400)
    avisos.push("Pilar muito flexível para essa altura: o topo desloca muito com o vento.");
  }
  return { secao, ...esf, asFace, armacao: escolhida, avisos };
}

// Aço longitudinal + estribos (kg), para custo. Comprimento total = altura + fundação.
export function pesoAcoPilar(resultado, comprimentoTotal) {
  if (!resultado?.armacao) return null;
  const S = SECOES[resultado.secao];
  const longitudinal = resultado.armacao.kgPorMetro * comprimentoTotal;
  const estribos = (Math.floor((comprimentoTotal * 100) / 15) + 1) * S.perimetroEstribo * KG_POR_M[5];
  return arred(longitudinal + estribos, 1);
}

function arred(v, casas) {
  const f = Math.pow(10, casas);
  return Math.round(v * f) / f;
}
