// Conjunto de caixa d'água (regra do Murilo, 2026-11-24):
// cada conjunto = 1 POSTE + 1 CAPITEL + 1 CAIXA (fibra ou polietileno).
// A caixa é comprada pronta e revendida; poste e capitel são peças da MR7.
// Pode ser vendido sozinho (tipo "Só Caixa d'Água") ou junto com o galpão.
// As peças ficam na seção "caixa" do orçamento, separadas do galpão.

export const SECAO_CAIXA = "caixa";
export const CAPACIDADES_CAIXA = [5000, 10000, 15000, 20000];
export const MATERIAIS_CAIXA = [
  { id: "FIBRA", rotulo: "Fibra" },
  { id: "POLIETILENO", rotulo: "Polietileno" },
];
export const PAPEIS_CAIXA = ["POSTE", "CAPITEL", "CAIXA_AGUA"];

// "10.000L", "10000 L", "10.000 LITROS" -> 10000
export function capacidadeDoNome(nome) {
  const m = String(nome || "")
    .toUpperCase()
    .match(/(\d{1,3}(?:[.\s]?\d{3})+|\d+)\s*L(?:ITROS)?\b/);
  if (!m) return null;
  const n = Number(m[1].replace(/[.\s]/g, ""));
  return n >= 500 ? n : null;
}

export function rotuloCapacidade(litros) {
  return `${Number(litros).toLocaleString("pt-BR")} L`;
}

export function materialDoNome(nome) {
  const t = String(nome || "").toUpperCase();
  if (t.includes("POLIETILENO") || t.includes("POLIETANO")) return "POLIETILENO";
  if (t.includes("FIBRA")) return "FIBRA";
  return null;
}

// "POSTE ... — 6,50M" -> 6.5
export function alturaDoPoste(nome) {
  const m = String(nome || "").toUpperCase().match(/(\d+(?:,\d+)?)\s*M\b/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Peças do catálogo que formam o conjunto de uma capacidade/material.
// postes: todas as opções daquela capacidade (a 20.000 L tem duas alturas).
export function pecasDoConjunto(composicoes, capacidade, material) {
  const ativas = (composicoes || []).filter((c) => c.ativo !== false);
  const daCapacidade = (papel) =>
    ativas.filter((c) => c.papel === papel && capacidadeDoNome(c.nome) === Number(capacidade));
  const postes = daCapacidade("POSTE").sort((a, b) => (alturaDoPoste(a.nome) || 0) - (alturaDoPoste(b.nome) || 0));
  const capitel = daCapacidade("CAPITEL")[0] || null;
  const caixa = daCapacidade("CAIXA_AGUA").find((c) => materialDoNome(c.nome) === material) || null;
  return { postes, capitel, caixa };
}

// Linhas do orçamento para N conjuntos. Avisa o que está faltando no catálogo
// (ex.: capitel da 5.000 L ainda não cadastrado) ou sem preço.
export function itensDoConjunto({ composicoes, capacidade, material, posteId, quantidade }) {
  const { postes, capitel, caixa } = pecasDoConjunto(composicoes, capacidade, material);
  const poste = postes.find((p) => String(p.id) === String(posteId)) || postes[0] || null;
  const qtd = Math.max(1, Math.floor(Number(quantidade) || 1));
  const avisos = [];
  const rotulo = rotuloCapacidade(capacidade);
  if (!poste) avisos.push(`Não há poste cadastrado para a caixa de ${rotulo}.`);
  if (!capitel) avisos.push(`O capitel da caixa de ${rotulo} ainda não está cadastrado — entra só poste e caixa.`);
  if (!caixa) avisos.push(`A caixa de ${rotulo} (${material.toLowerCase()}) não está cadastrada.`);
  const itens = [poste, capitel, caixa].filter(Boolean).map((c) => ({
    composicao_id: c.id,
    nome: c.nome,
    unidade: c.unidade,
    papel: c.papel,
    quantidade: qtd,
    preco_unitario: Number(c.preco) || 0,
    secao: SECAO_CAIXA,
  }));
  for (const i of itens)
    if (!(i.preco_unitario > 0)) avisos.push(`"${i.nome}" está sem preço — preencha em Preços.`);
  return { itens, avisos };
}

// Soma as linhas novas na lista: a mesma peça da seção caixa só aumenta a
// quantidade, em vez de virar outra linha igual.
export function somarNaLista(lista, novos, gerarChave) {
  const resultado = [...lista];
  for (const n of novos) {
    const idx = resultado.findIndex(
      (i) => i.secao === SECAO_CAIXA && String(i.composicao_id) === String(n.composicao_id)
    );
    if (idx >= 0) {
      const atual = resultado[idx];
      resultado[idx] = { ...atual, quantidade: (Number(atual.quantidade) || 0) + n.quantidade };
    } else {
      resultado.push({ ...n, chave: gerarChave() });
    }
  }
  return resultado;
}

export function ehItemDaCaixa(item) {
  return item?.secao === SECAO_CAIXA;
}

// Agrupa as peças da seção caixa por capacidade: serve para o desenho
// (quantas caixas, de que tamanho, altura do poste) e para a proposta
// impressa (uma linha por conjunto). Itens: {nome, papel, quantidade, preco_unitario}.
export function conjuntosDaLista(itens) {
  const grupos = new Map();
  for (const i of itens || []) {
    const q = Number(i.quantidade) || 0;
    if (q <= 0) continue;
    const cap = capacidadeDoNome(i.nome);
    const chave = cap || "outros";
    if (!grupos.has(chave))
      grupos.set(chave, { capacidade: cap, material: null, quantidade: 0, total: 0, alturaPoste: null, pecas: [] });
    const g = grupos.get(chave);
    g.total += q * (Number(i.preco_unitario) || 0);
    g.pecas.push(i.papel);
    // nº de conjuntos = a maior quantidade entre as peças daquele tamanho
    g.quantidade = Math.max(g.quantidade, q);
    if (i.papel === "CAIXA_AGUA") g.material = materialDoNome(i.nome) || g.material;
    else if (i.papel === "POSTE") g.alturaPoste = alturaDoPoste(i.nome) || g.alturaPoste;
  }
  return [...grupos.values()].sort((a, b) => (a.capacidade || 0) - (b.capacidade || 0));
}

// Texto da proposta: "Conjunto caixa d'água 10.000 L — poste, capitel e caixa de fibra"
export function descricaoConjunto(g) {
  if (!g.capacidade) return "Peças da caixa d'água";
  const partes = [];
  if (g.pecas.includes("POSTE")) partes.push("poste");
  if (g.pecas.includes("CAPITEL")) partes.push("capitel");
  if (g.pecas.includes("CAIXA_AGUA"))
    partes.push(`caixa de ${g.material === "POLIETILENO" ? "polietileno" : "fibra"}`);
  const lista = partes.length > 1 ? partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1] : partes[0] || "";
  return `Conjunto caixa d'água ${rotuloCapacidade(g.capacidade)}${lista ? " — " + lista : ""}`;
}
