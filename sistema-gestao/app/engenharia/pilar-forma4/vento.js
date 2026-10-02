// Velocidade básica do vento (V0, m/s) por estado — NBR 6123, mapa de isopletas.
//
// "conferido": estado inteiro dentro da mesma faixa do mapa (Nordeste
// litorâneo, 30 m/s). Os demais são o valor predominante no estado e
// precisam ser conferidos no mapa da norma pelo engenheiro — no orçamento
// o V0 sempre pode ser trocado à mão para o município da obra.
// Fonte da lista de municípios: IBGE (municipios.json, out/2026).

export const V0_POR_UF = {
  AL: { v0: 30, conferido: true },
  PE: { v0: 30, conferido: true },
  SE: { v0: 30, conferido: true },
  PB: { v0: 30, conferido: true },
  RN: { v0: 30, conferido: true },
  CE: { v0: 30, conferido: true },
  BA: { v0: 30, conferido: false, obs: "oeste e sul da Bahia podem estar na faixa de 35 m/s" },
  PI: { v0: 30, conferido: false },
  MA: { v0: 30, conferido: false },
  PA: { v0: 30, conferido: false },
  AM: { v0: 30, conferido: false },
  AP: { v0: 30, conferido: false },
  RR: { v0: 30, conferido: false },
  AC: { v0: 30, conferido: false },
  RO: { v0: 30, conferido: false },
  TO: { v0: 30, conferido: false },
  MT: { v0: 30, conferido: false },
  GO: { v0: 35, conferido: false },
  DF: { v0: 35, conferido: false },
  MG: { v0: 35, conferido: false },
  ES: { v0: 35, conferido: false },
  RJ: { v0: 35, conferido: false },
  MS: { v0: 40, conferido: false },
  SP: { v0: 40, conferido: false },
  PR: { v0: 45, conferido: false },
  SC: { v0: 45, conferido: false },
  RS: { v0: 45, conferido: false },
};

// Exceções por município (preencher conforme o engenheiro conferir no mapa).
// Chave: "UF|Nome do município"
export const V0_POR_MUNICIPIO = {};

export function velocidadeBasica(uf, municipio) {
  const exc = V0_POR_MUNICIPIO[`${uf}|${municipio}`];
  if (exc) return { v0: exc, conferido: true };
  return V0_POR_UF[uf] || { v0: 30, conferido: false };
}
