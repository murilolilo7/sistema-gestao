// Regras simples do módulo Produção (sem acesso ao banco, para poder testar).

export const SETORES = [
  { id: "CONCRETAGEM", rotulo: "Concretagem" },
  { id: "ARMACAO", rotulo: "Armação" },
  { id: "OUTRO", rotulo: "Outro setor" },
];

export function rotuloSetor(id) {
  return SETORES.find((s) => s.id === id)?.rotulo || id;
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

// Custo mensal da função = salário × (1 + encargos)
export function custoMensalFuncao(funcao) {
  if (!funcao) return null;
  const salario = Number(funcao.salario_bruto) || 0;
  const encargos = Number(funcao.encargos_pct) || 0;
  return salario * (1 + encargos / 100);
}
