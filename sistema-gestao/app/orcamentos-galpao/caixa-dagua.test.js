// Testes do conjunto de caixa d'água (1 poste + 1 capitel + 1 caixa).
// COMO RODAR:  node --test app/orcamentos-galpao/caixa-dagua.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capacidadeDoNome,
  materialDoNome,
  alturaDoPoste,
  pecasDoConjunto,
  itensDoConjunto,
  somarNaLista,
  conjuntosDaLista,
  descricaoConjunto,
  precoPostePorAltura,
} from "./caixa-dagua.js";

// Catálogo como está no banco (nomes reais)
const CATALOGO = [
  { id: 29, nome: "POSTE P/ESTRUTURA CAIXA D'ÁGUA 5.000L — 6,50M", papel: "POSTE", unidade: "UN", preco: 1691.57 },
  { id: 30, nome: "POSTE P/ESTRUTURA CAIXA D'ÁGUA 10.000L — 10,00M", papel: "POSTE", unidade: "UN", preco: 3043.49 },
  { id: 31, nome: "POSTE P/ESTRUTURA CAIXA D'ÁGUA 20.000L — 6,90M", papel: "POSTE", unidade: "UN", preco: 3396.46 },
  { id: 33, nome: "POSTE P/ESTRUTURA CAIXA D'ÁGUA 20.000L — 6,50M", papel: "POSTE", unidade: "UN", preco: 2911 },
  { id: 35, nome: "CAPITEL P/ESTRUTURA CAIXA D'ÁGUA 10.000L", papel: "CAPITEL", unidade: "UN", preco: 2105.03 },
  { id: 36, nome: "CAPITEL P/ESTRUTURA CAIXA D'ÁGUA 20.000L", papel: "CAPITEL", unidade: "UN", preco: 2158.86 },
  { id: 59, nome: "CAIXA D'ÁGUA FIBRA 10.000L", papel: "CAIXA_AGUA", unidade: "UN", preco: 0 },
  { id: 60, nome: "CAIXA D'ÁGUA POLIETILENO 10.000L", papel: "CAIXA_AGUA", unidade: "UN", preco: 5000 },
  { id: 56, nome: "CAIXA D'ÁGUA FIBRA 5.000L", papel: "CAIXA_AGUA", unidade: "UN", preco: 3000 },
];

test("lê capacidade, material e altura pelos nomes do catálogo", () => {
  assert.equal(capacidadeDoNome("POSTE P/ESTRUTURA CAIXA D'ÁGUA 15.000L — 6,90M"), 15000);
  assert.equal(capacidadeDoNome("CAIXA D'ÁGUA FIBRA 5.000L"), 5000);
  assert.equal(capacidadeDoNome("CAIXA 20000 L"), 20000);
  assert.equal(capacidadeDoNome("TERÇA 5,00M"), null);
  assert.equal(materialDoNome("CAIXA D'ÁGUA POLIETILENO 10.000L"), "POLIETILENO");
  assert.equal(materialDoNome("CAIXA D'ÁGUA FIBRA 10.000L"), "FIBRA");
  assert.equal(alturaDoPoste("POSTE P/ESTRUTURA CAIXA D'ÁGUA 20.000L — 6,90M"), 6.9);
});

test("conjunto = 1 poste + 1 capitel + 1 caixa, na quantidade pedida", () => {
  const { itens, avisos } = itensDoConjunto({ composicoes: CATALOGO, capacidade: 10000, material: "POLIETILENO", quantidade: 2 });
  assert.deepEqual(itens.map((i) => [i.composicao_id, i.quantidade, i.secao]), [
    [30, 2, "caixa"],
    [35, 2, "caixa"],
    [60, 2, "caixa"],
  ]);
  assert.equal(avisos.length, 0);
});

test("caixa sem preço e capitel não cadastrado geram aviso, sem travar", () => {
  const r10 = itensDoConjunto({ composicoes: CATALOGO, capacidade: 10000, material: "FIBRA", quantidade: 1 });
  assert.equal(r10.itens.length, 3);
  assert.ok(r10.avisos.some((a) => a.includes("sem preço")));
  const r5 = itensDoConjunto({ composicoes: CATALOGO, capacidade: 5000, material: "FIBRA", quantidade: 1 });
  assert.deepEqual(r5.itens.map((i) => i.papel), ["POSTE", "CAIXA_AGUA"]);
  assert.ok(r5.avisos.some((a) => a.includes("capitel")));
});

test("20.000 L: escolhe o poste pedido; sem escolha, o mais baixo", () => {
  assert.deepEqual(pecasDoConjunto(CATALOGO, 20000, "FIBRA").postes.map((p) => p.id), [33, 31]);
  const padrao = itensDoConjunto({ composicoes: CATALOGO, capacidade: 20000, material: "FIBRA", quantidade: 1 });
  assert.equal(padrao.itens[0].composicao_id, 33);
  const escolhido = itensDoConjunto({ composicoes: CATALOGO, capacidade: 20000, material: "FIBRA", posteId: 31, quantidade: 1 });
  assert.equal(escolhido.itens[0].composicao_id, 31);
});

test("adicionar o mesmo conjunto de novo soma a quantidade", () => {
  let chave = 1;
  const { itens } = itensDoConjunto({ composicoes: CATALOGO, capacidade: 10000, material: "FIBRA", quantidade: 1 });
  const lista1 = somarNaLista([{ chave: 0, nome: "MONTAGEM", secao: "estrutura", quantidade: 3 }], itens, () => chave++);
  const lista2 = somarNaLista(lista1, itens, () => chave++);
  assert.equal(lista2.length, 4);
  assert.deepEqual(lista2.filter((i) => i.secao === "caixa").map((i) => i.quantidade), [2, 2, 2]);
});

test("agrupa por tamanho para a proposta e o desenho", () => {
  const a = itensDoConjunto({ composicoes: CATALOGO, capacidade: 10000, material: "POLIETILENO", quantidade: 2 }).itens;
  const b = itensDoConjunto({ composicoes: CATALOGO, capacidade: 5000, material: "FIBRA", quantidade: 1 }).itens;
  const g = conjuntosDaLista([...a, ...b]);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].capacidade, g[0].quantidade, g[0].alturaPoste], [5000, 1, 6.5]);
  assert.equal(g[1].quantidade, 2);
  assert.equal(g[1].total, 2 * (3043.49 + 2105.03 + 5000));
  assert.equal(descricaoConjunto(g[1]), "Conjunto caixa d'água 10.000 L — poste, capitel e caixa de polietileno");
  assert.equal(descricaoConjunto(g[0]), "Conjunto caixa d'água 5.000 L — poste e caixa de fibra");
});

test("altura livre: poste vendido por 6 m livre; outra altura muda nome e preço pelo comprimento", () => {
  const cat = [
    { id: 29, nome: "POSTE P/ESTRUTURA CAIXA D'ÁGUA 5.000L — 6,00M LIVRE", papel: "POSTE", unidade: "UN", preco: 1691.57 },
    { id: 56, nome: "CAIXA D'ÁGUA FIBRA 5.000L", papel: "CAIXA_AGUA", unidade: "UN", preco: 3000 },
  ];
  // 6 m: item do catálogo, sem mudança
  const seis = itensDoConjunto({ composicoes: cat, capacidade: 5000, material: "FIBRA", quantidade: 1, alturaLivre: "6" });
  assert.equal(seis.itens[0].composicao_id, 29);
  assert.equal(seis.itens[0].preco_unitario, 1691.57);
  // 8 m: peça de 9,50 m em vez de 7,50 m
  const oito = itensDoConjunto({ composicoes: cat, capacidade: 5000, material: "FIBRA", quantidade: 2, alturaLivre: "8,00" });
  assert.equal(oito.itens[0].composicao_id, null);
  assert.equal(oito.itens[0].nome, "POSTE P/ESTRUTURA CAIXA D'ÁGUA 5.000L — 8,00M LIVRE");
  assert.equal(oito.itens[0].preco_unitario, precoPostePorAltura(1691.57, 8));
  assert.equal(precoPostePorAltura(1691.57, 8), 2142.66);
  assert.equal(precoPostePorAltura(1691.57, 7), 1917.11);
  // o desenho e a proposta leem a altura livre pelo nome
  assert.equal(conjuntosDaLista(oito.itens)[0].alturaLivre, 8);
  // somar o mesmo poste de 8 m de novo aumenta a quantidade (não duplica linha)
  let k = 1;
  const l = somarNaLista(somarNaLista([], oito.itens, () => k++), oito.itens, () => k++);
  assert.deepEqual(l.map((i) => i.quantidade), [4, 4]);
});
