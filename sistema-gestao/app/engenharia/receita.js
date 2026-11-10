// Contas da receita de uma peça (composição) — só números, sem tela, para
// poderem ser testadas (receita.test.js).

// Custo somado ao vivo da receita (nunca o campo `custo` gravado, que é só
// um cache que fica pra trás sempre que um insumo/salário muda de valor).
// Se area_referencia > 0, o custo vira "por m²" (caso da Laje).
export function custoAoVivo(c) {
  const itens = c.composicao_itens || [];
  if (itens.length === 0) return Number(c.custo) || 0;
  const soma = itens.reduce(
    (total, item) =>
      total +
      Number(item.quantidade || 0) *
        Number(item.insumos?.valor_unitario ?? item.mao_de_obra?.valor_hora ?? 0),
    0
  );
  const area = Number(c.area_referencia) || 0;
  return Math.round((area > 0 ? soma / area : soma) * 100) / 100;
}

// Preço que a receita pede: custo ao vivo × (1 + BDI da peça)
export function precoPelaReceita(c, bdiPct = c.bdi_pct) {
  const bdi = Number(String(bdiPct ?? 0).replace(",", ".")) || 0;
  return Math.round(custoAoVivo(c) * (1 + bdi / 100) * 100) / 100;
}

// Peças com receita cujo preço gravado ficou diferente do preço da receita
// (o preço gravado não muda sozinho quando aço, cimento ou salário mudam).
// Maior diferença primeiro.
export function pecasComPrecoDesatualizado(composicoes) {
  return (composicoes || [])
    .filter((c) => (c.composicao_itens || []).length > 0)
    .map((c) => {
      const precoAtual = Math.round((Number(c.preco) || 0) * 100) / 100;
      const precoNovo = precoPelaReceita(c);
      return {
        id: c.id,
        nome: c.nome,
        unidade: c.unidade,
        custo: custoAoVivo(c),
        precoAtual,
        precoNovo,
        diferenca: Math.round((precoNovo - precoAtual) * 100) / 100,
      };
    })
    .filter((p) => Math.abs(p.diferenca) > 0.01)
    .sort((a, b) => Math.abs(b.diferenca / (b.precoAtual || 1)) - Math.abs(a.diferenca / (a.precoAtual || 1)));
}
