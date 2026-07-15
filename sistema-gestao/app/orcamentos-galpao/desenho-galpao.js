"use client";

// Componente compartilhado: desenho isométrico do galpão pré-moldado.
// Usado ao vivo na janela do orçamento (prévia enquanto digita) — a
// página de impressão tem a própria cópia da função e não depende daqui.

// Desenho isométrico do galpão pré-moldado, gerado só com os dados do
// orçamento: estrutura aberta com pilares, vigas de travamento, laje
// (quando houver) e coberta de duas águas por galpão — geminados ganham
// uma cumeeira para cada galpão, inclusive com LARGURAS DIFERENTES
// (lista em dados.larguras). As proporções são reais (metros projetados)
// e o enquadramento é automático, então nunca distorce.
function calcularDesenhoGalpao(dados) {
  const qtdGalpoes = Math.max(1, (Number(dados.galpoesGerminados) || 0) + 1);
  // Larguras: aceita uma lista (galpões geminados de tamanhos diferentes)
  // ou repete a largura única informada para todos os galpões.
  let larguras = Array.isArray(dados.larguras)
    ? dados.larguras.map((n) => Number(n) || 0).filter((n) => n > 0)
    : [];
  if (larguras.length === 0) {
    larguras = Array(qtdGalpoes).fill(Math.max(4, Number(dados.vao) || 10));
  } else {
    larguras = larguras.map((n) => Math.max(4, n));
    while (larguras.length < qtdGalpoes) larguras.push(larguras[larguras.length - 1]);
  }
  // Posições acumuladas das divisas entre galpões (0, l1, l1+l2, ...)
  const divisas = [0];
  for (const l of larguras) divisas.push(divisas[divisas.length - 1] + l);
  const W = divisas[divisas.length - 1]; // largura total
  const C = Math.max(6, Number(dados.comprimento) || 20);
  const H = Math.max(3, Number(dados.peDireito) || 6);
  const hcMax = (Math.max(...larguras) / 2) * 0.15; // maior cumeeira
  const nMod = Math.max(1, Math.round(C / (Number(dados.modulacao) || 5)));
  const passo = C / nMod;

  // Níveis verticais das vigas horizontais — são peças DIFERENTES:
  // a laje sempre vem com a sua viga de laje (nível da laje) e a viga
  // de travamento é outra peça, que fica um pouco ACIMA da laje.
  // Quando não há laje, o travamento fica a meia altura do pilar.
  // REGRA: pé-direito acima de 12m => viga de travamento DUPLICADA
  // (dois níveis de travamento nas laterais).
  const yLaje = H * 0.45;
  // Laje/mezanino pode ser PARCIAL: a profundidade desenhada é a área
  // da laje ÷ largura total (ex.: 100m² num galpão de 10m de largura
  // = laje até 10m de profundidade, cobrindo só os primeiros vãos).
  // Sem área informada, desenha a laje no galpão inteiro.
  const areaLajeNum = Number(dados.areaLaje) || 0;
  const zLaje = areaLajeNum > 0 ? Math.max(1, Math.min(C, areaLajeNum / W)) : C;
  let niveisTravamento = [];
  if (dados.temTravamento) {
    if (H > 12) {
      niveisTravamento = dados.temLaje ? [H * 0.62, H * 0.84] : [H * 0.38, H * 0.7];
    } else {
      niveisTravamento = [dados.temLaje ? H * 0.72 : H * 0.5];
    }
  }

  // Projeção: largura recua para a esquerda/cima, comprimento para a
  // direita/cima, altura sobe na vertical (mesmo ângulo da referência).
  const ux = [-0.78, -0.3];
  const uz = [0.94, -0.34];
  const proj = (x, y, z) => [x * ux[0] + z * uz[0], x * ux[1] + z * uz[1] - y];

  // Enquadramento automático dentro do viewBox
  const cantos = [];
  for (const x of [0, W])
    for (const y of [0, H + hcMax]) for (const z of [0, C]) cantos.push(proj(x, y, z));
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [px, py] of cantos) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const VB_L = 460;
  const VB_A = 330;
  // Margens assimétricas: sobra maior à esquerda e embaixo para as
  // cotas (altura, largura e comprimento) nunca saírem cortadas.
  const M_ESQ = 74;
  const M_DIR = 22;
  const M_TOPO = 22;
  const M_BASE = 56;
  const esc = Math.min(
    (VB_L - M_ESQ - M_DIR) / (maxX - minX),
    (VB_A - M_TOPO - M_BASE) / (maxY - minY)
  );
  const T = (x, y, z) => {
    const p = proj(x, y, z);
    return [(p[0] - minX) * esc + M_ESQ, (p[1] - minY) * esc + M_TOPO];
  };

  const CONCRETO = "#8f9aa6";
  const CONCRETO_CLARO = "#c2cbd3";
  const TRACO_TELHA = "#b6bec6";
  const VERDE = "#059669";
  const wPilar = Math.max(1.4, 0.3 * esc);
  const wViga = Math.max(1, 0.2 * esc);

  // Lista única de formas, na ordem de pintura (fundo -> frente)
  const formas = [];
  const linha = (a, b, stroke, w) =>
    formas.push({
      tipo: "linha",
      x1: +a[0].toFixed(1),
      y1: +a[1].toFixed(1),
      x2: +b[0].toFixed(1),
      y2: +b[1].toFixed(1),
      stroke,
      w: +w.toFixed(2),
    });
  const poligono = (pts, fill, stroke, w) =>
    formas.push({
      tipo: "poligono",
      pts: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "),
      fill,
      stroke,
      w,
    });
  const texto = (x, y, txt, anchor) =>
    formas.push({ tipo: "texto", x: +x.toFixed(1), y: +y.toFixed(1), txt, anchor });

  // Linhas longitudinais de pilares: bordas externas + divisas dos galpões
  const linhasX = divisas;

  // 1) Fundo: empena traseira e lateral distante, em traço mais claro
  for (const x of linhasX) linha(T(x, 0, C), T(x, H, C), CONCRETO_CLARO, wPilar * 0.8);
  for (let i = 1; i < nMod; i++)
    linha(T(W, 0, i * passo), T(W, H, i * passo), CONCRETO_CLARO, wPilar * 0.8);
  linha(T(W, H, 0), T(W, H, C), CONCRETO_CLARO, wViga);
  for (const yT of niveisTravamento)
    linha(T(W, yT, 0), T(W, yT, C), CONCRETO_CLARO, wViga * 0.9);
  if (dados.temLaje) linha(T(W, yLaje, 0), T(W, yLaje, zLaje), CONCRETO_CLARO, wViga);
  linha(T(0, H, C), T(W, H, C), CONCRETO_CLARO, wViga);

  // 2) Laje pré-moldada: o plano da laje apoiado nas VIGAS DE LAJE
  // (uma viga por linha de pilares, no nível da laje)
  if (dados.temLaje) {
    poligono(
      [T(0, yLaje, 0), T(W, yLaje, 0), T(W, yLaje, zLaje), T(0, yLaje, zLaje)],
      "rgba(214, 221, 228, 0.5)",
      CONCRETO_CLARO,
      0.8
    );
    for (const x of linhasX) linha(T(x, yLaje, 0), T(x, yLaje, zLaje), CONCRETO, wViga * 1.1);
    linha(T(0, yLaje, 0), T(W, yLaje, 0), CONCRETO, wViga * 1.1);
    // viga de fechamento no fim da laje (quando parcial)
    if (zLaje < C - 0.01) linha(T(0, yLaje, zLaje), T(W, yLaje, zLaje), CONCRETO, wViga * 1.1);
  }

  // 3) Pilares internos (divisas entre galpões geminados)
  for (let v = 1; v < larguras.length; v++)
    for (let i = 0; i <= nMod; i++)
      linha(T(divisas[v], 0, i * passo), T(divisas[v], H, i * passo), CONCRETO, wPilar * 0.9);

  // 4) Coberta: duas águas por galpão, dos mais distantes para os mais
  // próximos, cada um com a própria largura e a própria cumeeira
  for (let v = larguras.length - 1; v >= 0; v--) {
    const x0 = divisas[v];
    const x1 = divisas[v + 1];
    const xm = (x0 + x1) / 2;
    const hc = (larguras[v] / 2) * 0.15;
    poligono(
      [T(x1, H, 0), T(xm, H + hc, 0), T(xm, H + hc, C), T(x1, H, C)],
      "#eef1f4",
      TRACO_TELHA,
      1
    );
    poligono(
      [T(x0, H, 0), T(xm, H + hc, 0), T(xm, H + hc, C), T(x0, H, C)],
      "#f8fafc",
      TRACO_TELHA,
      1
    );
    const nTelhas = Math.max(3, Math.round(C / 2.5));
    for (let i = 1; i < nTelhas; i++) {
      const z = (C / nTelhas) * i;
      linha(T(x0, H, z), T(xm, H + hc, z), TRACO_TELHA, 0.7);
    }
    linha(T(xm, H + hc, 0), T(xm, H + hc, C), CONCRETO, wViga); // cumeeira
    // Empena frontal FECHADA (a tesoura não fica oca): painel de
    // fechamento no triângulo da frente de cada galpão
    poligono([T(x0, H, 0), T(xm, H + hc, 0), T(x1, H, 0)], "#eef1f4", CONCRETO, wViga);
    linha(T(xm, H, 0), T(xm, H + hc, 0), CONCRETO_CLARO, wViga * 0.8); // emenda do painel
  }

  // 5) Frente: viga de topo e pilares próximos por último. A viga de
  // travamento existe SÓ nas laterais (nunca na frente/empena) e é
  // desenhada em todos os seus níveis (duplicada acima de 12m).
  linha(T(0, H, 0), T(W, H, 0), CONCRETO, wViga);
  linha(T(0, H, 0), T(0, H, C), CONCRETO, wViga);
  for (const yT of niveisTravamento) linha(T(0, yT, 0), T(0, yT, C), CONCRETO, wViga * 0.9);
  for (let i = nMod; i >= 1; i--) linha(T(0, 0, i * passo), T(0, H, i * passo), CONCRETO, wPilar);
  for (const x of linhasX) linha(T(x, 0, 0), T(x, H, 0), CONCRETO, wPilar);

  // 6) Cotas em verde (largura total, comprimento e altura)
  const cota = (A, B, txt) => {
    const a = T(...A);
    const b = T(...B);
    const dxl = b[0] - a[0];
    const dyl = b[1] - a[1];
    const L = Math.hypot(dxl, dyl) || 1;
    let nx = -dyl / L;
    let ny = dxl / L;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const off = 12;
    const a2 = [a[0] + nx * off, a[1] + ny * off];
    const b2 = [b[0] + nx * off, b[1] + ny * off];
    linha(a2, b2, VERDE, 1);
    linha(a, [a[0] + nx * (off + 3), a[1] + ny * (off + 3)], VERDE, 1);
    linha(b, [b[0] + nx * (off + 3), b[1] + ny * (off + 3)], VERDE, 1);
    texto((a2[0] + b2[0]) / 2 + nx * 11, (a2[1] + b2[1]) / 2 + ny * 11 + 3, txt, "middle");
  };
  if (dados.textoLargura) cota([0, 0, 0], [W, 0, 0], dados.textoLargura);
  if (dados.textoComprimento) cota([0, 0, 0], [0, 0, C], dados.textoComprimento);
  if (dados.textoAltura) {
    const a = T(W, 0, 0);
    const b = T(W, H, 0);
    linha([a[0] - 14, a[1]], [b[0] - 14, b[1]], VERDE, 1);
    linha([a[0] - 17, a[1]], [a[0] - 9, a[1]], VERDE, 1);
    linha([b[0] - 17, b[1]], [b[0] - 9, b[1]], VERDE, 1);
    texto(b[0] - 20, (a[1] + b[1]) / 2 + 3, dados.textoAltura, "end");
  }

  return { viewBoxLargura: VB_L, viewBoxAltura: VB_A, formas };
}

// Componente pronto: recebe as medidas e desenha o galpão.
// temLaje / temTravamento vêm das peças já lançadas no orçamento.
export default function DesenhoGalpao({
  vao,
  comprimento,
  peDireito,
  galpoesGerminados = 0,
  larguras = null,
  modulacao = 5,
  temLaje = false,
  temTravamento = false,
  areaLaje = null,
  largura = 300,
}) {
  const fmt = (n) =>
    Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalGalpoes = Math.max(0, Number(galpoesGerminados) || 0) + 1;
  const listaLarguras =
    Array.isArray(larguras) && larguras.some((n) => Number(n) > 0)
      ? larguras.map((n) => Number(n) || Number(vao) || 0)
      : null;
  const larguraTotal = listaLarguras
    ? listaLarguras.reduce((s, n) => s + n, 0)
    : (Number(vao) || 0) * totalGalpoes;

  const desenho = calcularDesenhoGalpao({
    vao,
    comprimento,
    peDireito,
    galpoesGerminados,
    larguras: listaLarguras,
    modulacao,
    temLaje,
    temTravamento,
    areaLaje,
    textoLargura: larguraTotal > 0 ? `${fmt(larguraTotal)}M` : null,
    textoComprimento: comprimento ? `${fmt(comprimento)}M` : null,
    textoAltura: peDireito ? `${fmt(peDireito)}M` : null,
  });

  return (
    <svg
      width={largura}
      viewBox={`0 0 ${desenho.viewBoxLargura} ${desenho.viewBoxAltura}`}
      role="img"
      aria-label="Prévia do galpão com as medidas digitadas"
    >
      {desenho.formas.map((f, i) => {
        if (f.tipo === "poligono") {
          return (
            <polygon
              key={i}
              points={f.pts}
              fill={f.fill}
              stroke={f.stroke}
              strokeWidth={f.w}
              strokeLinejoin="round"
            />
          );
        }
        if (f.tipo === "texto") {
          return (
            <text
              key={i}
              x={f.x}
              y={f.y}
              textAnchor={f.anchor || "middle"}
              fontSize="12.5"
              fill="#059669"
              fontWeight="600"
            >
              {f.txt}
            </text>
          );
        }
        return (
          <line
            key={i}
            x1={f.x1}
            y1={f.y1}
            x2={f.x2}
            y2={f.y2}
            stroke={f.stroke}
            strokeWidth={f.w}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
