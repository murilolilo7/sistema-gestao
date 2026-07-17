"use client";

// ============================================================================
// Motor de desenho técnico das peças de concreto (pré-moldados de linha).
// Mesma projeção do desenho do galpão (desenho-galpao.js): comprimento
// sobe para a direita, largura recua para a esquerda, altura na vertical.
// O desenho é gerado só pelas MEDIDAS (cm) — mudou a medida, muda o desenho.
//
// Moldes disponíveis (campo "molde" do produto):
//   bloco        Bloco maciço / Paver
//   bloco_vazado Bloco vazado (2 furos)
//   canaleta     Canaleta (perfil U)
//   meio_fio     Meio-fio (chanfro no topo)
//   tubo         Tubo / Manilha (largura = diâmetro)
//   mourao       Mourão (topo chanfrado)
//   poste        Poste cônico (largura = Ø base, altura = Ø topo)
//   lajota       Lajota sextavada (comprimento = medida entre faces)
// ============================================================================

const UX = [-0.78, -0.3]; // eixo da largura (recua p/ esquerda)
const UZ = [0.94, -0.34]; // eixo do comprimento (sobe p/ direita)

const CORES = {
  topo: "#F4F2EB",
  frente: "#E6E4DB",
  lado: "#CDCBC1",
  interno: "#AFADA3",
  furo: "#8A8880",
  chanfro: "#EDEBE2",
  aguaFrente: "#EFEDE4",
  paredeFundo: "#B8B6AC",
  paredeLateral: "#BEBCB2",
  boca: "#E9E7DE",
  traco: "#3F3E3A",
  cota: "#85837A",
};

export const MOLDES = [
  { valor: "bloco", rotulo: "Bloco maciço / Paver", dica: "comprimento × largura × altura" },
  { valor: "bloco_vazado", rotulo: "Bloco vazado (2 furos)", dica: "comprimento × largura × altura" },
  { valor: "canaleta", rotulo: "Canaleta (perfil U)", dica: "comprimento × largura × altura" },
  { valor: "meio_fio", rotulo: "Meio-fio", dica: "comprimento × largura × altura" },
  { valor: "tubo", rotulo: "Tubo / Manilha", dica: "comprimento × largura (= diâmetro); altura não é usada" },
  { valor: "mourao", rotulo: "Mourão", dica: "comprimento × largura × altura" },
  { valor: "poste", rotulo: "Poste cônico", dica: "comprimento × largura (= Ø base) × altura (= Ø topo)" },
  { valor: "lajota", rotulo: "Lajota sextavada", dica: "comprimento (= medida entre faces) × altura; largura não é usada" },
];

function P(l, w, h) {
  return [l * UZ[0] + w * UX[0], l * UZ[1] + w * UX[1] - h];
}

function norm(v) {
  const m = Math.hypot(v[0], v[1]);
  return [v[0] / m, v[1] / m];
}

let pCompr = norm([-UZ[1], UZ[0]]);
if (pCompr[1] < 0) pCompr = [-pCompr[0], -pCompr[1]];
let pLarg = norm([UX[1], -UX[0]]);
if (pLarg[1] < 0) pLarg = [-pLarg[0], -pLarg[1]];

// ---------------------------------------------------------------------------
// Construção: cada peça devolve { formas, linhas, textos } e os pontos usados
// (para o enquadramento automático).
// ---------------------------------------------------------------------------
function novaCena() {
  return { formas: [], linhas: [], textos: [], pontos: [] };
}

function addPoly(cena, pts, fill, sw) {
  cena.formas.push({
    pts: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "),
    fill,
    sw: sw != null ? sw : 1.1,
  });
  cena.pontos.push(...pts);
}

function addCota(cena, a, b, offDir, label) {
  const off = [offDir[0] * 10, offDir[1] * 10];
  const a2 = [a[0] + off[0], a[1] + off[1]];
  const b2 = [b[0] + off[0], b[1] + off[1]];
  const lin = (p, q) => cena.linhas.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], w: 0.7 });
  const tick = (p) =>
    cena.linhas.push({ x1: p[0] - 2.2, y1: p[1] + 2.2, x2: p[0] + 2.2, y2: p[1] - 2.2, w: 0.9 });
  lin(a, a2);
  lin(b, b2);
  lin(a2, b2);
  tick(a2);
  tick(b2);
  const mx = (a2[0] + b2[0]) / 2 + off[0] * 0.85;
  const my = (a2[1] + b2[1]) / 2 + off[1] * 0.85 + 3;
  cena.textos.push({ x: mx, y: my, txt: label });
  cena.pontos.push(a2, b2, [mx - 14, my - 8], [mx + 14, my + 2]);
}

function cotasPadrao(cena, L, W, Hf) {
  addCota(cena, P(0, 0, 0), P(L, 0, 0), pCompr, `${fmt(L)} cm`);
  addCota(cena, P(0, 0, 0), P(0, W, 0), pLarg, fmt(W));
  addCota(cena, P(L, 0, 0), P(L, 0, Hf), [1, 0], fmt(Hf));
}

function fmt(n) {
  return Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1).replace(".", ",");
}

function circulo(l, cw, ch, R, N) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI;
    pts.push(P(l, cw + R * Math.cos(a), ch + R * Math.sin(a)));
  }
  return pts;
}

function corpoCilindro(F, B, N) {
  const dir = norm(UZ);
  const n = [-dir[1], dir[0]];
  const sv = F.map((p) => p[0] * n[0] + p[1] * n[1]);
  let imax = 0;
  let imin = 0;
  sv.forEach((v, i) => {
    if (v > sv[imax]) imax = i;
    if (v < sv[imin]) imin = i;
  });
  const arco = (arr, i0, i1) => {
    const out = [];
    let i = i0;
    for (;;) {
      out.push(arr[i]);
      if (i === i1) break;
      i = (i + 1) % N;
    }
    return out;
  };
  return arco(F, imin, imax).concat(arco(B, imax, imin));
}

// ------------------------------- moldes ------------------------------------
function moldeBloco(cena, L, W, H, furos) {
  addPoly(cena, [P(0, 0, 0), P(0, W, 0), P(0, W, H), P(0, 0, H)], CORES.lado);
  addPoly(cena, [P(0, 0, H), P(L, 0, H), P(L, W, H), P(0, W, H)], CORES.topo);
  if (furos) {
    const m = L * 0.1;
    const gap = L * 0.07;
    const fw = (L - 2 * m - gap) / 2;
    const fy = W * 0.22;
    const fh = W * 0.56;
    [m, m + fw + gap].forEach((fl) => {
      addPoly(
        cena,
        [P(fl, fy, H), P(fl + fw, fy, H), P(fl + fw, fy + fh, H), P(fl, fy + fh, H)],
        CORES.furo,
        0.9
      );
    });
  }
  addPoly(cena, [P(0, 0, 0), P(L, 0, 0), P(L, 0, H), P(0, 0, H)], CORES.frente);
  cotasPadrao(cena, L, W, H);
}

function moldeCanaleta(cena, L, W, H) {
  const t = Math.max(W * 0.22, 1.2);
  const d = H * 0.68;
  addPoly(cena, [P(0, t, H - d), P(L, t, H - d), P(L, W - t, H - d), P(0, W - t, H - d)], CORES.interno, 0.9);
  addPoly(cena, [P(L, t, H - d), P(L, W - t, H - d), P(L, W - t, H), P(L, t, H)], CORES.paredeFundo, 0.9);
  addPoly(cena, [P(0, W - t, H - d), P(L, W - t, H - d), P(L, W - t, H), P(0, W - t, H)], CORES.paredeLateral, 0.9);
  const U = [[0, 0], [W, 0], [W, H], [W - t, H], [W - t, H - d], [t, H - d], [t, H], [0, H]].map((wh) =>
    P(0, wh[0], wh[1])
  );
  addPoly(cena, U, CORES.lado);
  addPoly(cena, [P(0, W - t, H), P(L, W - t, H), P(L, W, H), P(0, W, H)], CORES.topo, 0.9);
  addPoly(cena, [P(0, 0, H), P(L, 0, H), P(L, t, H), P(0, t, H)], CORES.topo, 0.9);
  addPoly(cena, [P(0, 0, 0), P(L, 0, 0), P(L, 0, H), P(0, 0, H)], CORES.frente);
  cotasPadrao(cena, L, W, H);
}

function moldeMeioFio(cena, L, W, H) {
  const ch = Math.min(H * 0.17, W * 0.45);
  const E = [[0, 0], [W, 0], [W, H], [ch, H], [0, H - ch]].map((wh) => P(0, wh[0], wh[1]));
  addPoly(cena, E, CORES.lado);
  addPoly(cena, [P(0, ch, H), P(L, ch, H), P(L, W, H), P(0, W, H)], CORES.topo);
  addPoly(cena, [P(0, 0, H - ch), P(L, 0, H - ch), P(L, ch, H), P(0, ch, H)], CORES.chanfro);
  addPoly(cena, [P(0, 0, 0), P(L, 0, 0), P(L, 0, H - ch), P(0, 0, H - ch)], CORES.frente);
  cotasPadrao(cena, L, W, H);
}

function moldeTubo(cena, L, D) {
  const R = D / 2;
  const t = Math.max(D * 0.12, 1.5);
  const N = 28;
  const cw = R;
  const chp = R;
  const F = circulo(0, cw, chp, R, N);
  const B = circulo(L, cw, chp, R, N);
  addPoly(cena, B, CORES.lado, 1);
  addPoly(cena, corpoCilindro(F, B, N), CORES.frente, 1.1);
  addPoly(cena, F, CORES.boca, 1.1);
  addPoly(cena, circulo(0, cw, chp, R - t, N), CORES.furo, 0.9);
  addCota(cena, P(0, cw, 0), P(L, cw, 0), pCompr, `${fmt(L)} cm`);
  addCota(cena, P(0, cw, 0), P(0, cw, D), [-1, 0], `Ø ${fmt(D)}`);
}

function moldeMourao(cena, L, W, H) {
  const ch = Math.min(H * 0.3, 4);
  const hb = H - ch;
  const E = [[0, 0], [W, 0], [W, hb], [W / 2, H], [0, hb]].map((wh) => P(0, wh[0], wh[1]));
  addPoly(cena, E, CORES.lado);
  addPoly(cena, [P(0, W / 2, H), P(L, W / 2, H), P(L, W, hb), P(0, W, hb)], CORES.topo);
  addPoly(cena, [P(0, 0, hb), P(L, 0, hb), P(L, W / 2, H), P(0, W / 2, H)], CORES.aguaFrente);
  addPoly(cena, [P(0, 0, 0), P(L, 0, 0), P(L, 0, hb), P(0, 0, hb)], CORES.frente);
  addCota(cena, P(0, 0, 0), P(L, 0, 0), pCompr, `${fmt(L)} cm`);
  addCota(cena, P(0, 0, 0), P(0, W, 0), pLarg, fmt(W));
  addCota(cena, P(L, 0, 0), P(L, 0, hb), [1, 0], fmt(H));
}

function moldePoste(cena, L, D1, D2) {
  const R1 = D1 / 2;
  const R2 = (D2 > 0 ? D2 : D1 * 0.7) / 2;
  const N = 28;
  const cw = R1;
  const chp = R1;
  const F = circulo(0, cw, chp, R1, N);
  const B = circulo(L, cw, chp, R2, N);
  addPoly(cena, B, CORES.lado, 1);
  addPoly(cena, corpoCilindro(F, B, N), CORES.frente, 1.1);
  addPoly(cena, F, CORES.boca, 1.1);
  addCota(cena, P(0, cw, 0), P(L, cw, 0), pCompr, `${fmt(L)} cm`);
  addCota(cena, P(0, cw, chp - R1), P(0, cw, chp + R1), [-1, 0], `Ø ${fmt(D1)}/${fmt(R2 * 2)}`);
}

function moldeLajota(cena, A, H) {
  const R = A / Math.sqrt(3);
  const c = A / 2;
  const ang = [30, 90, 150, 210, 270, 330];
  const vs = ang.map((g) => {
    const r = (g * Math.PI) / 180;
    return [c + R * Math.cos(r), c + R * Math.sin(r)];
  });
  const faces = [];
  for (let i = 0; i < 6; i++) {
    const a = vs[i];
    const b = vs[(i + 1) % 6];
    const base = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], H), P(a[0], a[1], H)];
    faces.push({ my: (base[0][1] + base[1][1]) / 2, base });
  }
  faces.sort((x, y) => x.my - y.my);
  faces.forEach((f, idx) => addPoly(cena, f.base, idx < 3 ? "#C5C3B9" : CORES.frente, 1));
  addPoly(cena, vs.map((v) => P(v[0], v[1], H)), CORES.topo, 1.1);
  addCota(cena, P(vs[4][0], vs[4][1], 0), P(vs[5][0], vs[5][1], 0), pCompr, `${fmt(A)} cm`);
  addCota(cena, P(vs[5][0], vs[5][1], 0), P(vs[5][0], vs[5][1], H), [1, 0], fmt(H));
}

// ---------------------------------------------------------------------------
// Cálculo completo de uma peça: formas + enquadramento automático.
// Devolve null se o molde/medidas não permitirem desenhar.
// ---------------------------------------------------------------------------
export function calcularDesenhoPeca({ molde, comprimento, largura, altura }) {
  const L = Number(comprimento) || 0;
  const W = Number(largura) || 0;
  const H = Number(altura) || 0;
  if (!molde) return null;

  const cena = novaCena();
  if (molde === "bloco" && L > 0 && W > 0 && H > 0) moldeBloco(cena, L, W, H, false);
  else if (molde === "bloco_vazado" && L > 0 && W > 0 && H > 0) moldeBloco(cena, L, W, H, true);
  else if (molde === "canaleta" && L > 0 && W > 0 && H > 0) moldeCanaleta(cena, L, W, H);
  else if (molde === "meio_fio" && L > 0 && W > 0 && H > 0) moldeMeioFio(cena, L, W, H);
  else if (molde === "tubo" && L > 0 && W > 0) moldeTubo(cena, L, W);
  else if (molde === "mourao" && L > 0 && W > 0 && H > 0) moldeMourao(cena, L, W, H);
  else if (molde === "poste" && L > 0 && W > 0) moldePoste(cena, L, W, H);
  else if (molde === "lajota" && L > 0 && H > 0) moldeLajota(cena, L, H);
  else return null;

  const xs = cena.pontos.map((p) => p[0]);
  const ys = cena.pontos.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const margem = 4;
  const x0 = minX - margem;
  const y0 = minY - margem;
  const wv = maxX - minX + margem * 2;
  const hv = maxY - minY + margem * 2;
  return { ...cena, viewBox: `${x0.toFixed(1)} ${y0.toFixed(1)} ${wv.toFixed(1)} ${hv.toFixed(1)}`, wv, hv };
}

// ---------------------------------------------------------------------------
// <DesenhoPeca/> — uma peça (usada na prévia do cadastro de produtos).
// escala = pixels por cm; larguraMax limita peças muito compridas.
// ---------------------------------------------------------------------------
export function DesenhoPeca({ molde, comprimento, largura, altura, escala = 1.6, larguraMax = 260 }) {
  const d = calcularDesenhoPeca({ molde, comprimento, largura, altura });
  if (!d) return null;
  const wPx = Math.min(d.wv * escala, larguraMax);
  return (
    <svg viewBox={d.viewBox} style={{ width: wPx }} role="img" aria-label="Desenho da peça">
      {d.formas.map((f, i) => (
        <polygon
          key={i}
          points={f.pts}
          fill={f.fill}
          stroke={CORES.traco}
          strokeWidth={f.sw}
          strokeLinejoin="round"
        />
      ))}
      {d.linhas.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={CORES.cota} strokeWidth={l.w} />
      ))}
      {d.textos.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor="middle" fontSize="9" fill={CORES.cota}>
          {t.txt}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// <QuadroPecas/> — o quadro do impresso: várias peças na MESMA escala,
// acomodando-se em linhas. Peças muito compridas ganham teto de largura
// (a cota continua mostrando a medida real).
// pecas = [{ nome, molde, comprimento, largura, altura }]
// ---------------------------------------------------------------------------
export function QuadroPecas({ pecas, escala = 1.15, larguraMaxPeca = 190 }) {
  const desenhaveis = (pecas || []).filter((p) =>
    calcularDesenhoPeca({
      molde: p.molde,
      comprimento: p.comprimento,
      largura: p.largura,
      altura: p.altura,
    })
  );
  if (desenhaveis.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "center",
        columnGap: 12,
        rowGap: 2,
      }}
    >
      {desenhaveis.map((p, i) => (
        <div key={i} style={{ textAlign: "center" }}>
          <DesenhoPeca
            molde={p.molde}
            comprimento={p.comprimento}
            largura={p.largura}
            altura={p.altura}
            escala={escala}
            larguraMax={larguraMaxPeca}
          />
          <div style={{ fontSize: 9, fontWeight: 500, color: "#3C3C39", marginTop: 1 }}>{p.nome}</div>
        </div>
      ))}
    </div>
  );
}
