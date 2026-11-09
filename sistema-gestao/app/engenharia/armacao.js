import { papelDoItem } from "../orcamentos-galpao/calculos.js";

// =====================================================================
// MÃO DE OBRA DE ARMAÇÃO POR PEÇA — só conferência, não entra no preço.
//
// O prêmio por peça (planilha do DP, jul–out/2026) mede quanto trabalho cada
// peça dá. O salário da equipe é rateado na mesma proporção:
//   custo da peça = prêmio × fator + prêmio
//   fator = custo da equipe no período ÷ prêmio pago no período
// Assim todo o custo da equipe fica dentro das peças, inclusive o tempo que
// não vira peça (virar estribo etc.). O valor não muda com o tamanho da peça.
// =====================================================================

export const PREMIO_ARMACAO = {
  TESOURA: { rotulo: "Tesoura", premio: 5.5 },
  CAPITEL: { rotulo: "Capitel", premio: 5 },
  PILAR_COM_CONSOLO: { rotulo: "Pilar com consolo", premio: 4 },
  LAJE: { rotulo: "Laje", premio: 3.5 },
  PILAR_SEM_CONSOLO: { rotulo: "Pilar sem consolo", premio: 3 },
  VIGA_LAJE: { rotulo: "Viga de laje", premio: 3 },
  ESTRUTURA_CAIXA: { rotulo: "Estrutura de caixa d'água", premio: 2.5 },
  BASE: { rotulo: "Base", premio: 1.5 },
  TERCA: { rotulo: "Terça", premio: 1 },
  VIGA_TRAVAMENTO: { rotulo: "Viga de travamento", premio: 1 },
  PLACA: { rotulo: "Placa", premio: 0.75 },
  MOURAO: { rotulo: "Mourão", premio: 0.75 },
};

// Período do rateio: Rafael, Adryan, Vitor e Davi, jul–out/2026
export const BASE_RATEIO = { armadores: 4, meses: 4, premioPago: 4008.5 };

// Laje entra no orçamento em m², mas é armada por painel (5,99 × 1,24 m)
export const AREA_PAINEL_LAJE = 7.43;

export function fatorSalario(valorHora, baseHorasMes = 220, base = BASE_RATEIO) {
  const hora = Number(valorHora) || 0;
  const horas = Number(baseHorasMes) || 220;
  return (hora * horas * base.armadores * base.meses) / base.premioPago;
}

export function custoArmacao(tipo, fator) {
  const premio = PREMIO_ARMACAO[tipo]?.premio ?? 0;
  return { premio, salario: premio * fator, total: premio * fator + premio };
}

// Tipo de armação do item do orçamento; null = peça sem armação (telha, calha,
// montagem…). O consolo da tesoura já faz parte do pilar.
export function tipoArmacao(item) {
  const papel = papelDoItem(item);
  const nome = String(item.nome || "").toUpperCase();
  switch (papel) {
    case "TESOURA":
    case "CAPITEL":
    case "LAJE":
    case "TERCA":
    case "VIGA_LAJE":
    case "VIGA_TRAVAMENTO":
      return papel;
    case "PILAR":
      // Consolo: recebe viga de laje ou, na cabeça, duas tesouras (galpão germinado)
      return item.secao === "laje" || nome.includes("SOB A LAJE") || nome.includes("2 TESOURAS") || nome.includes("COM CONSOLO")
        ? "PILAR_COM_CONSOLO"
        : "PILAR_SEM_CONSOLO";
    case "POSTE":
      return "ESTRUTURA_CAIXA";
    case "BASE_CALICE":
      return "BASE";
  }
  if (papel) return null;
  if (nome.startsWith("BASE")) return "BASE";
  if (nome.startsWith("CAPITEL")) return "CAPITEL";
  if (nome.startsWith("POSTE") || nome.startsWith("ESTRUTURA")) return "ESTRUTURA_CAIXA";
  if (nome.startsWith("PLACA")) return "PLACA";
  if (nome.startsWith("MOURÃO") || nome.startsWith("MOURAO") || nome.startsWith("MORÃO") || nome.startsWith("MORAO")) return "MOURAO";
  return null;
}

// Linhas de armação do orçamento, agrupadas por tipo de peça
export function resumoArmacao(itens, fator) {
  const grupos = new Map();
  for (const item of itens || []) {
    const tipo = tipoArmacao(item);
    const qtd = Number(item.quantidade) || 0;
    if (!tipo || qtd <= 0) continue;
    const pecas = tipo === "LAJE" ? qtd / AREA_PAINEL_LAJE : qtd;
    grupos.set(tipo, (grupos.get(tipo) || 0) + pecas);
  }
  const linhas = Object.keys(PREMIO_ARMACAO)
    .filter((tipo) => grupos.has(tipo))
    .map((tipo) => {
      const pecas = grupos.get(tipo);
      const c = custoArmacao(tipo, fator);
      return { tipo, rotulo: PREMIO_ARMACAO[tipo].rotulo, pecas, porPeca: c.total, total: pecas * c.total };
    });
  return { linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
}
