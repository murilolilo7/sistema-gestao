// =====================================================================
// CUSTO REAL DO PILAR — definição de cada campo da tela.
// Cada campo diz o que é, a unidade, um exemplo, de onde veio o número e a
// faixa "normal" (fora dela a tela pede confirmação antes de salvar, para
// pegar erro de digitação, ex.: 650 no lugar de 65).
// Funções puras, testadas em campos.test.js.
// =====================================================================

export const BLOCOS = [
  {
    id: "bdi",
    titulo: "1. BDI do pilar",
    resumo:
      "O BDI é o quanto se soma em cima do custo de fabricação para pagar o que ainda não está nas contas " +
      "(operacional: fôrma, energia, despesas fixas, administrativo) e o lucro. Conforme esses custos forem " +
      "cadastrados, o BDI pode ser reduzido. O BDI da tela do orçamento (25%) continua entrando por cima, à parte.",
    campos: [
      {
        campo: "bdi_pilar_pct",
        rotulo: "BDI do pilar",
        unidade: "%",
        exemplo: "65",
        fonte: "Combinado com o Murilo em 19/11/2026 (inicial, cobre o operacional ainda não cadastrado).",
        normal: [20, 150],
      },
    ],
  },
  {
    id: "aco",
    titulo: "2. Aço — barra, sobra e emenda",
    resumo:
      "As barras compridas do pilar são cortadas da barra comprada. Se o que sobra da barra dá para fazer " +
      "um puxador ou outra peça, volta para o estoque e não é cobrado; se for menor, vira sucata e o pilar " +
      "paga a barra inteira. Peça maior que a barra leva emenda por solda.",
    campos: [
      {
        campo: "aco_barra_m",
        rotulo: "Tamanho da barra comprada",
        unidade: "m",
        exemplo: "12",
        fonte: "Murilo: a fábrica compra barra de 12 m (padrão do fabricante).",
        normal: [6, 13],
      },
      {
        campo: "aco_desconto_pontas_m",
        rotulo: "Desconto nas pontas (cobrimento)",
        unidade: "m",
        exemplo: "0,06",
        fonte: "Projetos de fabricação: a barra tem o comprimento do pilar menos 6 cm (3 cm em cada ponta).",
        normal: [0, 0.2],
      },
      {
        campo: "aco_sobra_minima_m",
        rotulo: "Menor sobra que é reaproveitada",
        unidade: "m",
        exemplo: "0,88",
        fonte: "Murilo: sobra que dá para fazer o puxador (0,88 m) é reaproveitada.",
        normal: [0.3, 3],
      },
      {
        campo: "aco_emenda_solda_fator",
        rotulo: "Emenda por solda",
        unidade: "× bitola",
        exemplo: "15",
        fonte:
          "NBR 6118 (emenda soldada por traspasse: 2 cordões de 5 × bitola, afastados 5 × bitola = 15 × bitola). " +
          "Na Ø16: 15 × 1,6 cm = 24 cm a mais por emenda.",
        normal: [10, 30],
      },
      {
        campo: "perda_aco_pct",
        rotulo: "Perda de aço",
        unidade: "%",
        exemplo: "5",
        fonte: "Parâmetro da Engenharia. A sucata da barra já é contada à parte, então pode ser baixa.",
        normal: [0, 15],
      },
    ],
  },
  {
    id: "estribo",
    titulo: "3. Estribo (pela norma)",
    resumo:
      "O tamanho de cada estribo sai da seção do pilar: a volta por dentro do cobrimento, mais os dois ganchos " +
      "de amarração que a NBR 6118 exige. Se a seção do pilar mudar, o estribo muda junto.",
    campos: [
      {
        campo: "estribo_cobrimento_cm",
        rotulo: "Cobrimento",
        unidade: "cm",
        exemplo: "3",
        fonte: "NBR 6118, pilar em ambiente urbano (classe II) = 3 cm. Bate com os projetos (estribo de 1,21 m no 25x40).",
        normal: [1.5, 5],
      },
      {
        campo: "estribo_gancho_ponta_cm",
        rotulo: "Ponta reta do gancho",
        unidade: "cm",
        exemplo: "5",
        fonte: "NBR 6118: ponta reta de no mínimo 5 × bitola e 5 cm (o sistema sempre usa o maior dos dois).",
        normal: [5, 15],
      },
      {
        campo: "estribo_gancho_angulo",
        rotulo: "Dobra do gancho",
        unidade: "graus",
        exemplo: "135",
        fonte: "NBR 6118: gancho de 135° (45° para dentro) é o usado nos pilares. Outras opções: 90 ou 180.",
        normal: [90, 180],
      },
    ],
  },
  {
    id: "concreto",
    titulo: "4. Concreto",
    resumo:
      "O custo do m³ sai do traço cadastrado (cimento, areia, brita, água e aditivo) com os preços da tela Preços. " +
      "Aqui fica só a perda.",
    campos: [
      {
        campo: "perda_concreto_pct",
        rotulo: "Perda de concreto",
        unidade: "%",
        exemplo: "3",
        fonte: "Parâmetro da Engenharia.",
        normal: [0, 10],
      },
    ],
  },
  {
    id: "producao",
    titulo: "5. Mês de produção",
    resumo:
      "Quantos dias a fábrica produz por mês. O custo de um dia de trabalho de cada função é o salário do mês " +
      "com encargos (tela Preços → Mão de obra) dividido por esses dias.",
    campos: [
      {
        campo: "dias_producao_mes",
        rotulo: "Dias de produção por mês",
        unidade: "dias",
        exemplo: "20",
        fonte: "Produção de jan–out/2026 (sem julho): 180 dias em 9 meses = 20 dias.",
        normal: [15, 27],
      },
    ],
  },
  {
    id: "armacao",
    titulo: "6. Armação (o soldador faz a peça toda)",
    resumo:
      "O soldador faz a ferragem completa: esqueleto, emendas, puxador e consolo. O tempo de cada peça sai " +
      "da comissão: comissão da peça ÷ comissão que um armador faz em média por dia. " +
      "Custo = tempo × custo do dia do armador + a comissão da peça. O pilar entra como \"sem consolo\": o consolo é peça separada no orçamento.",
    campos: [
      {
        campo: "armacao_comissao_dia",
        rotulo: "Comissão que um armador faz por dia (média)",
        unidade: "R$/dia",
        exemplo: "11,47",
        fonte: "Levantamento de ferragem out/2025–out/2026: 1.033 dias de armador, média de 11,47.",
        normal: [3, 40],
      },
    ],
    funcao: { campo: "armacao_funcao_id", rotulo: "Função usada no salário" },
    tabelaComissao: true,
  },
  {
    id: "concretagem",
    titulo: "7. Fôrma, concretagem e desforma",
    resumo:
      "Não usa tempo de uma pessoa: usa o dia inteiro da equipe pelo que foi produzido no dia. " +
      "Custo por m³ = (pessoas por dia × custo do dia de cada uma + comissão de concretagem do dia) ÷ m³ do dia.",
    campos: [
      {
        campo: "concretagem_pessoas_dia",
        rotulo: "Pessoas na equipe por dia",
        unidade: "pessoas",
        exemplo: "9,54",
        fonte: "Produção de jan–out/2026 (sem julho): média de 9,54 pessoas por dia.",
        normal: [2, 30],
      },
      {
        campo: "concretagem_m3_dia",
        rotulo: "Concreto feito por dia",
        unidade: "m³/dia",
        exemplo: "8,25",
        fonte: "Produção de jan–out/2026 (sem julho): 8,25 m³ por dia.",
        normal: [2, 30],
      },
      {
        campo: "concretagem_comissao_dia",
        rotulo: "Comissão de concretagem paga por dia",
        unidade: "R$/dia",
        exemplo: "148,39",
        fonte: "Produção de jan–out/2026 (sem julho): soma das comissões ÷ dias.",
        normal: [0, 1500],
      },
    ],
    funcao: { campo: "concretagem_funcao_id", rotulo: "Função usada no salário" },
  },
];

export const TODOS_CAMPOS = BLOCOS.flatMap((b) => b.campos);

export function definicao(campo) {
  return TODOS_CAMPOS.find((c) => c.campo === campo) || null;
}

// Aceita "15.000", "15.000,50", "8,5", "8.5", "65%" e "R$ 12"
export function lerNumero(v) {
  const s = String(v ?? "").trim().replace(/[R$\s%]/g, "");
  if (!s) return null;
  let n;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Mensagem quando o valor sai da faixa normal (null = está ok)
export function foraDoNormal(def, valor) {
  if (!def || !def.normal || valor === null || valor === undefined) return null;
  const [min, max] = def.normal;
  if (valor < min || valor > max) {
    return `${def.rotulo}: ${String(valor).replace(".", ",")} ${def.unidade} está fora do normal (${String(min).replace(".", ",")} a ${String(max).replace(".", ",")}). Confirma?`;
  }
  return null;
}

// Validação para salvar: número válido, não negativo
export function validar(def, texto) {
  const valor = lerNumero(texto);
  if (valor === null) return { ok: false, erro: "Digite um número (ex.: " + (def?.exemplo ?? "10") + ")." };
  if (valor < 0) return { ok: false, erro: "O valor não pode ser negativo." };
  return { ok: true, valor, aviso: foraDoNormal(def, valor) };
}

// Valor do banco → texto do campo (vírgula)
export function paraTexto(v) {
  if (v === null || v === undefined || v === "") return "";
  return String(v).replace(".", ",");
}
