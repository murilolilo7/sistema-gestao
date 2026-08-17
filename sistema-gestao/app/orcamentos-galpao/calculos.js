// Regras de cálculo do orçamento de galpão.
//
// Este arquivo tem SÓ contas — nada de tela, nada de banco. Por isso pode ser
// testado sozinho (ver calculos.test.js). Toda regra de negócio que dá para
// isolar deve morar aqui: assim, quando um número sai errado, o teste aponta
// exatamente qual regra quebrou, em vez de caçar no meio da tela.

// ---------------------------------------------------------------------------
// MONTAGEM
// ---------------------------------------------------------------------------

// Peças montadas por dia. As que não estão aqui (telha, calha, capote,
// fundação) NÃO entram no cálculo das diárias.
export const MONTAGEM_POR_DIA = {
  PILAR: 3,
  TERCA: 30,
  VIGA_TRAVAMENTO: 10,
  VIGA_LAJE: 3,
  LAJE: 10,
};

// Área de uma peça de laje, em m². A laje entra no orçamento em m², mas a
// montagem é por PEÇA: 160 m² ÷ 7 = 22,85 → 23 peças.
export const M2_POR_PECA_LAJE = 7;

// Tesoura: quanto maior o vão, menos peças por dia.
// Até 16m → 4/dia · de 16 a 20m → 3/dia · 20m ou mais → 2/dia
// Vale também para as tesouras calculadas por proporção (que não estão no
// catálogo): o tamanho sai do próprio nome da peça.
export function montagemDaTesoura(nome) {
  const m = (nome || "").match(/(\d+(?:[.,]\d+)?)\s*M/i);
  const tam = m ? parseFloat(m[1].replace(",", ".")) : 0;
  if (!tam) return 4;
  if (tam >= 20) return 2;
  if (tam >= 16) return 3;
  return 4;
}

// Papel da peça: itens livres (sem peça do catálogo) têm o papel deduzido
// pelo nome.
export function papelDoItem(item) {
  if (item.papel) return item.papel;
  const nome = (item.nome || "").toUpperCase();
  // A ordem importa: "VIGA DE TRAVAMENTO" e "VIGA PARA LAJE" começam igual,
  // e "CONSOLO TESOURA" começa igual a "TESOURA".
  if (nome.startsWith("VIGA DE TRAVAMENTO")) return "VIGA_TRAVAMENTO";
  if (nome.startsWith("VIGA PARA LAJE")) return "VIGA_LAJE";
  if (nome.startsWith("CONSOLO TESOURA")) return "CONSOLO";
  if (nome.startsWith("TESOURA") || nome.includes("DE VÃO LIVRE")) return "TESOURA";
  // O PILAR calculado também entra sem papel: sem esta linha ele sumia do
  // checklist, levava a fundação junto (que é contada pelos pilares) e
  // aparecia fora de ordem na lista.
  if (nome.startsWith("PILAR")) return "PILAR";
  if (nome.startsWith("TERÇA") || nome.startsWith("TERCA")) return "TERCA";
  if (nome.startsWith("TELHA")) return "TELHA";
  if (nome.startsWith("CALHA")) return "CALHA";
  if (nome.startsWith("CAPOTE")) return "CAPOTE";
  if (nome.startsWith("FUNDAÇÃO") || nome.startsWith("FUNDACAO")) return "FUNDACAO";
  if (nome.startsWith("MONTAGEM")) return "MONTAGEM";
  if (nome.startsWith("LAJE")) return "LAJE";
  return null;
}

// Diárias de montagem de uma seção (estrutura ou laje), contadas separadamente
// porque cada uma tem a sua linha de montagem no orçamento.
export function diariasDeMontagem(listaItens, secaoAlvo) {
  const dias = listaItens.reduce((soma, i) => {
    const ehLaje = i.secao === "laje";
    if (secaoAlvo === "laje" ? !ehLaje : ehLaje) return soma;
    const papel = papelDoItem(i);
    if (papel === "MONTAGEM") return soma;
    const porDia =
      (papel === "TESOURA" ? montagemDaTesoura(i.nome) : 0) ||
      Number(MONTAGEM_POR_DIA[papel]) ||
      0;
    if (!porDia) return soma;
    // Laje: a quantidade está em m², mas monta-se por peça.
    const qtd =
      papel === "LAJE"
        ? Math.ceil((Number(i.quantidade) || 0) / M2_POR_PECA_LAJE)
        : Number(i.quantidade) || 0;
    return soma + qtd / porDia;
  }, 0);
  return dias > 0 ? Math.ceil(dias) : 0;
}

// ---------------------------------------------------------------------------
// MEDIDAS DO GALPÃO
// ---------------------------------------------------------------------------

// Terças por linha de vão: largura ÷ 1,6, arredondado pra cima e SEMPRE par.
export function qtdTercasPorLinhaDeVao(larguraGalpao) {
  const bruto = Math.ceil((Number(larguraGalpao) || 0) / 1.6);
  if (bruto <= 0) return 0;
  return bruto % 2 === 0 ? bruto : bruto + 1;
}

// Decompõe o comprimento em módulos de 5m e 6m (o galpão pode misturar os
// dois). Usa o mínimo de vãos de 6m para fechar a metragem.
// Comprimento quebrado (ex.: 27,4m): a sobra vira UM vão maior —
// 27,4 = 2×5m + 2×6m + 1 vão de 5,40m. Esse vão usa terça de 6,00M.
export function decomporComprimentoEmModulos(comprimentoTotal) {
  const c = Number(comprimentoTotal);
  if (!c || c <= 0) return null;
  const inteiro = Math.floor(c + 0.0001);
  const sobra = Math.round((c - inteiro) * 100) / 100;

  const emModulos = (n) => {
    if (n < 0) return null;
    for (let vaos6 = 0; vaos6 * 6 <= n; vaos6++) {
      const r = n - vaos6 * 6;
      if (r % 5 === 0) return { vaos5: r / 5, vaos6 };
    }
    return null;
  };

  if (sobra < 0.001) {
    const d = emModulos(inteiro);
    return d ? { ...d, quebrado: null } : null;
  }

  for (const base of [5, 6]) {
    const d = emModulos(inteiro - base);
    if (d) {
      return {
        vaos5: d.vaos5,
        vaos6: d.vaos6 + 1,
        quebrado: Math.round((base + sobra) * 100) / 100,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// VIGAS E PILARES DA LAJE
// ---------------------------------------------------------------------------

// A viga da laje nunca passa de 10m: acima disso ela se divide em trechos, e
// cada trecho a mais exige uma fila de pilar no meio.
// 12m → 2 trechos de 6m, 1 fila · 21m → 3 trechos de 7m, 2 filas.
export function trechosDaViga(larguraGalpao) {
  const larg = Number(larguraGalpao) || 0;
  if (larg <= 0) return { trechos: 0, vaoViga: 0, filasMeio: 0 };
  const trechos = Math.ceil(larg / 10);
  return {
    trechos,
    vaoViga: Math.round((larg / trechos) * 100) / 100,
    filasMeio: Math.max(0, trechos - 1),
  };
}

// ---------------------------------------------------------------------------
// PEÇAS AUTOMÁTICAS
// ---------------------------------------------------------------------------

// Reconhece a peça automática pelo NOME, ao reabrir um orçamento salvo. Sem
// isso o sistema não a identificava e lançava OUTRA por cima (peça duplicada).
export function chaveAutomatica(nome, secao) {
  const n = (nome || "").toUpperCase();
  if (n.startsWith("CONSOLO TESOURA")) return "consolo-tesoura-auto";
  if (n.startsWith("VIGA PARA LAJE")) return "viga-laje-auto";
  if (n.startsWith("VIGA DE TRAVAMENTO")) {
    const m = n.match(/X(\d+(?:[,.]\d+)?)M/);
    const comp = m ? parseFloat(m[1].replace(",", ".")) : 0;
    return comp > 5 ? "travamento-auto-6" : "travamento-auto-5";
  }
  if (n.startsWith("FUNDAÇÃO") && secao === "laje") return "fundacao-laje";
  if (n.startsWith("TERÇA") || n.startsWith("TERCA")) {
    if (/6[,.]00\s*M/.test(n)) return "terca-auto-6";
    if (/5[,.]00\s*M/.test(n)) return "terca-auto-5";
    return null;
  }
  if (n.startsWith("PILAR")) {
    if (secao === "laje") return "pilar-auto-meio";
    if (n.includes("REFORÇADO") || n.includes("PESADO")) return "pilar-auto-reforcado";
    if (n.includes("SOB A LAJE")) return "pilar-auto-comlaje";
    return "pilar-auto-padrao";
  }
  return null;
}

// ---------------------------------------------------------------------------
// QUANTIDADES DAS PEÇAS PELA MEDIDA
// ---------------------------------------------------------------------------

// Capote: comprimento + 2, por galpão.
export function qtdCapote(comprimento, totalGalpoes = 1) {
  const c = Number(comprimento) || 0;
  return c > 0 ? (c + 2) * totalGalpoes : 0;
}

// Calha: cada vão ganha meio metro de transpasse, e conta-se os dois lados.
// 27m com 5 vãos → 29,5m por lado × 2 = 59m.
export function qtdCalha(comprimento, numeroVaos, totalGalpoes = 1) {
  const c = Number(comprimento) || 0;
  const v = Number(numeroVaos) || 0;
  if (c <= 0) return 0;
  const porLado = c + 0.5 * v;
  return porLado * (totalGalpoes + 1);
}

// Telha: área coberta + perda (padrão 10%).
export function qtdTelha(areaCoberta, perdaPct = 10) {
  const a = Number(areaCoberta) || 0;
  return a > 0 ? Math.round(a * (1 + (Number(perdaPct) || 0) / 100) * 100) / 100 : 0;
}

// Valor por extenso, usado na proposta impressa.
export function valorPorExtenso(valor) {
  const n = Number(valor);
  if (!isFinite(n) || n < 0) return "";
  const unidades = [
    "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
    "dezessete", "dezoito", "dezenove",
  ];
  const dezenas = [
    "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
    "oitenta", "noventa",
  ];
  const centenas = [
    "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos",
  ];
  const ate999 = (num) => {
    if (num === 0) return "";
    if (num === 100) return "cem";
    const partes = [];
    const c = Math.floor(num / 100);
    const resto = num % 100;
    if (c > 0) partes.push(centenas[c]);
    if (resto > 0) {
      if (resto < 20) partes.push(unidades[resto]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(u > 0 ? dezenas[d] + " e " + unidades[u] : dezenas[d]);
      }
    }
    return partes.join(" e ");
  };
  const inteiro = Math.floor(n);
  const centavos = Math.round((n - inteiro) * 100);
  const escreverInteiro = (num) => {
    if (num === 0) return "zero";
    const grupos = [
      { valor: 1000000000, sing: "bilhão", plur: "bilhões" },
      { valor: 1000000, sing: "milhão", plur: "milhões" },
      { valor: 1000, sing: "mil", plur: "mil" },
    ];
    let resto = num;
    const partes = [];
    for (const g of grupos) {
      const qtd = Math.floor(resto / g.valor);
      if (qtd > 0) {
        const nome = qtd === 1 ? g.sing : g.plur;
        partes.push(g.valor === 1000 && qtd === 1 ? "mil" : ate999(qtd) + " " + nome);
        resto = resto % g.valor;
      }
    }
    if (resto > 0) partes.push(ate999(resto));
    if (partes.length > 1) {
      const ultima = partes[partes.length - 1];
      const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
      return partes.slice(0, -1).join(", ") + (ligaComE ? " e " : ", ") + ultima;
    }
    return partes[0] || "zero";
  };
  const terminaEmMilhaoRedondo = inteiro >= 1000000 && inteiro % 1000000 === 0;
  const textoInteiro =
    inteiro === 0
      ? ""
      : escreverInteiro(inteiro) +
        (inteiro === 1 ? " real" : terminaEmMilhaoRedondo ? " de reais" : " reais");
  const textoCentavos =
    centavos === 0
      ? ""
      : escreverInteiro(centavos) + (centavos === 1 ? " centavo" : " centavos");
  if (!textoInteiro && !textoCentavos) return "zero real";
  if (!textoCentavos) return textoInteiro;
  if (!textoInteiro) return textoCentavos;
  return textoInteiro + " e " + textoCentavos;
}
