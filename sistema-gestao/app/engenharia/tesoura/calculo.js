// =====================================================================
// TESOURA — cálculo pelo formato real e pela carga (em teste)
//
// A tesoura da MR7 é uma viga de duas águas: baixa nas pontas (~0,29 m),
// alta no meio (altura padrão por vão), com aberturas na alma, 20 cm de
// espessura (editável). Aqui saem: concreto (pela geometria), aço (armação
// padrão dos projetos + barra de baixo escolhida pela carga) e o peso de
// cada item, para custo.
//
// Calibrado com 42 tesouras dos projetos de fabricação (out/2026) e com os
// volumes dos moldes informados pelo Murilo (15 m ≈ 0,9–1,2 m³; 20 m ≈
// 1,55–1,65 m³). Não substitui o projeto do engenheiro.
// Unidades: m, kN, kN·m, cm², kg. Funções puras, testadas em calculo.test.js.
// =====================================================================

export const PARAMETROS_TESOURA = {
  espessura: 0.2, // m — vem de parametros_engenharia.tesoura_espessura
  alturaPonta: 0.29, // m — altura nas pontas (quase todos os projetos)
  // Parte do "contorno cheio" que é concreto (o resto são as aberturas da
  // alma). 0,71 bateu com os moldes de 15 m e 20 m e com a receita de 11,5 m.
  aproveitamento: 0.71,
  aproveitamentoMacica: 0.9, // tesouras baixas (≤ 40 cm no meio) quase não têm aberturas
  pesoConcreto: 25, // kN/m³
  cargaTerca: 0.2, // kN/m² — terças de concreto (estimativa, a confirmar)
  sobrecarga: 0.25, // kN/m² — NBR 6120, cobertura sem acesso
  gamaF: 1.3, // NBR 9062: peça pré-moldada com controle de fábrica
  fyd: 500 / 1.15 * 1000, // kN/m²
  // Braço de alavanca ≈ 0,95 × (altura no meio − 5 cm): a tesoura trabalha
  // como banzo de cima + banzo de baixo. Com estes três ajustes a barra de
  // baixo calculada ficou igual à dos 40 projetos (mediana 1,00).
  braco: 0.95,
};

// Peso da telha (kN/m², já com sobreposição)
export const TELHAS = {
  metalica: { rotulo: "Metálica", peso: 0.06 },
  fibro5: { rotulo: "Fibrocimento 5 mm", peso: 0.18 },
  fibro6: { rotulo: "Fibrocimento 6 mm (a pedido)", peso: 0.21 },
  sanduiche: { rotulo: "Sanduíche (a pedido)", peso: 0.13 },
};

// Altura padrão no meio, pelo maior estribo dos projetos (estribo + 5 cm)
export const ALTURAS_PADRAO = [
  { ate: 10, estribo: 31 },
  { ate: 12, estribo: 51 },
  { ate: 13.5, estribo: 58 },
  { ate: 15.2, estribo: 60 },
  { ate: 18.5, estribo: 72 },
  { ate: 99, estribo: 79 },
];

export function alturaNoMeio(vao) {
  const f = ALTURAS_PADRAO.find((a) => vao <= a.ate) || ALTURAS_PADRAO[ALTURAS_PADRAO.length - 1];
  return { estribo: f.estribo, altura: (f.estribo + 5) / 100 };
}

const KG_M = { 5: 0.154, 6.3: 0.245, 10: 0.617, 12.5: 0.963, 16: 1.578, 20: 2.466 };
const AREA = { 16: 2.011, 20: 3.142 };

// Barra de baixo (a que trabalha na tração) — opções usadas nos projetos
export const OPCOES_INFERIOR = [
  { n: 2, d: 16 },
  { n: 3, d: 16 },
  { n: 2, d: 20 },
  { n: 4, d: 16 },
  { n: 3, d: 20 },
  { n: 4, d: 20 },
  { n: 5, d: 20 },
  { n: 6, d: 20 },
].map((o) => ({ ...o, descricao: `${o.n}ø${o.d}`, area: o.n * AREA[o.d] }));

export function concretoTesoura(vao, alturaMeio, P = PARAMETROS_TESOURA) {
  const contorno = vao * ((P.alturaPonta + alturaMeio) / 2) * P.espessura;
  const ap = alturaMeio <= 0.4 ? P.aproveitamentoMacica : P.aproveitamento;
  return arred(contorno * ap, 3);
}

// Comprimento de uma linha de barras ao longo da tesoura: o vão + emenda
// quando passa de 12 m (barra comercial) + dobras nas pontas
function comprimentoLinha(vao, d) {
  const emenda = vao > 11.8 ? (d >= 20 ? 1.0 : 0.6) : 0;
  return vao + emenda + 0.1;
}

export function calcularTesoura(entrada, parametros = {}) {
  const P = { ...PARAMETROS_TESOURA, ...parametros };
  const { vao, modulacao, telha = "fibro5" } = entrada;
  const { estribo, altura } = entrada.alturaMeio
    ? { estribo: Math.round(entrada.alturaMeio * 100 - 5), altura: entrada.alturaMeio }
    : alturaNoMeio(vao);
  const volume = concretoTesoura(vao, altura, P);

  // Carga por metro de tesoura e momento no meio
  const cargaArea = (TELHAS[telha]?.peso ?? TELHAS.fibro5.peso) + P.cargaTerca + P.sobrecarga;
  const pesoProprio = (volume * P.pesoConcreto) / vao;
  const q = cargaArea * modulacao + pesoProprio; // kN/m
  const Md = (P.gamaF * q * vao * vao) / 8;
  const z = P.braco * (altura - 0.05);
  const asNecessaria = arred((Md / (z * P.fyd)) * 1e4, 2); // cm²

  const grande = vao > 13;
  const minimo = vao <= 7 ? 0 : grande ? 2 : 1; // índice mínimo em OPCOES_INFERIOR
  const inferior =
    OPCOES_INFERIOR.find((o, i) => i >= minimo && o.area >= asNecessaria) || null;

  // Armação padrão dos projetos (fora a barra de baixo, que vem da carga)
  const linhas = [];
  const add = (tipo, descricao, n, d, comprimento) =>
    linhas.push({ tipo, descricao, bitola: d, quantidade: n, metros: arred(n * comprimento, 2), kg: arred(n * comprimento * KG_M[d], 2) });

  if (grande) {
    add("SUPERIOR", "Barra de cima 2 ø12,5", 2, 12.5, comprimentoLinha(vao, 12.5));
    add("PELE", "Pele 6 ø5", 6, 5, comprimentoLinha(vao, 5));
    add("APOIO", "Reforço do apoio 4 ø12,5", 4, 12.5, 1.2);
    add("MEIO", "Barra do meio 1 ø16", 1, 16, Math.min(8, vao * 0.5));
  } else {
    add("SUPERIOR", "Barra de cima 2 ø10", 2, 10, vao + 0.05);
    add("APOIO", "Reforço do apoio 4 ø10", 4, 10, 1.0);
  }
  if (inferior) {
    add("INFERIOR", `Barra de baixo ${inferior.n} ø${String(inferior.d).replace(".", ",")}`, inferior.n, inferior.d, comprimentoLinha(vao, inferior.d));
  }

  // Estribos: altura varia da ponta ao meio; c/20 (grandes, ø6,3) ou c/15
  // (pequenas, ø5), e c/5 em 0,5 m de cada ponta (ø6,3)
  const dEst = grande ? 6.3 : 5;
  const esp = grande ? 0.2 : 0.15;
  const hMedio = (P.alturaPonta + altura) / 2;
  const compEstribo = 2 * (hMedio - 0.05 + (P.espessura - 0.05)) + 0.1;
  const nMeio = Math.ceil((vao - 1) / esp);
  const nPontas = 20;
  linhas.push({
    tipo: "ESTRIBO",
    descricao: `Estribo ø${String(dEst).replace(".", ",")} c/${esp * 100} (${nMeio} un) + pontas ø6,3 c/5 (${nPontas} un)`,
    bitola: dEst,
    quantidade: nMeio + nPontas,
    metros: arred((nMeio + nPontas) * compEstribo, 2),
    kg: arred(nMeio * compEstribo * KG_M[dEst] + nPontas * compEstribo * KG_M[6.3], 2),
  });

  // Alças de içamento
  if (grande) {
    add("ALCA", "Alças 1 ø20 + 2 ø16", 1, 20, 2.0);
    linhas[linhas.length - 1].kg = arred(2.0 * KG_M[20] + 2 * 1.6 * KG_M[16], 2);
    linhas[linhas.length - 1].metros = arred(2.0 + 3.2, 2);
  } else {
    add("ALCA", vao > 10 ? "Alças 1 ø16 + 2 ø16" : "Alça 1 ø20", 1, vao > 10 ? 16 : 20, vao > 10 ? 1.5 + 2.56 : 1.3);
  }

  const kgAco = arred(linhas.reduce((s, l) => s + l.kg, 0), 1);
  const avisos = [];
  if (!inferior) avisos.push("Nenhuma armação padrão atende essa carga — consultar o engenheiro.");
  if (vao > 22.5) avisos.push("Vão acima das tesouras já fabricadas (22,35 m) — conferir com o engenheiro.");
  return {
    vao,
    estriboMeio: estribo,
    alturaMeio: arred(altura, 2),
    volume,
    q: arred(q, 2),
    Md: arred(Md, 1),
    asNecessaria,
    inferior,
    aproveitamento: inferior ? arred((asNecessaria / inferior.area) * 100, 0) : null,
    linhas,
    kgAco,
    avisos,
  };
}

function arred(v, c) {
  const f = 10 ** c;
  return Math.round(v * f) / f;
}
