"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const EMPRESA = {
  nome: "MR7 PRÉ MOLDADOS LTDA",
  telefone: "(82) 98181-0774",
  endereco: "Rodovia AL485, Nº 400",
  cidadeUf: "57340000 - Feira Grande, AL",
  cnpj: "43.926.578/0001-86",
};

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleDateString("pt-BR");
}

function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

function nomeArquivoSeguro(texto) {
  return texto.replace(/[\\/:*?"<>|]/g, "").trim();
}

function formatarMedida(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Extrai a medida (ex: "5,00" de "TERÇA INTERMEDIÁRIA 5,00M")
function extrairMedidaDoNome(nome) {
  const match = (nome || "").match(/(\d+(?:,\d+)?)\s*M\b/i);
  return match ? match[1] : null;
}

// Modulação = os tamanhos de terça que realmente estão no orçamento
// (ex: intermediária 5,00M + início/final 6,00M). Não é uma fórmula —
// é lida direto da lista de peças, então nunca destoa do que foi
// montado de verdade.
function calcularModulacao(itensOrcamento) {
  const tercas = (itensOrcamento || []).filter(
    (item) => item.composicoes_galpao?.papel === "TERCA" && Number(item.quantidade) > 0
  );
  if (tercas.length === 0) return "-";
  const medidas = [
    ...new Set(
      tercas.map((t) => extrairMedidaDoNome(t.composicoes_galpao?.nome)).filter(Boolean)
    ),
  ].sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")));
  if (medidas.length === 0) return "-";
  return medidas.map((m) => `${m}M`).join(" E ");
}

// "TELHAS METÁLICAS" -> "METÁLICAS" | "CALHA FIBRA" -> "FIBRA"
function simplificarNome(nome, prefixo) {
  if (!nome) return "-";
  return nome.replace(new RegExp(`^${prefixo}S?\\s+`, "i"), "").trim();
}

function possuiPapel(itens, papel) {
  return (itens || []).some(
    (item) => item.composicoes_galpao?.papel === papel && Number(item.quantidade) > 0
  );
}

function primeiraComPapel(itens, papel) {
  return (itens || []).find((item) => item.composicoes_galpao?.papel === papel);
}

// Modulação em número (maior terça do orçamento) — usada só para
// espaçar os pilares no desenho. Se não houver terça, assume 5m.
function modulacaoNumerica(itensOrcamento) {
  const tercas = (itensOrcamento || []).filter(
    (item) => item.composicoes_galpao?.papel === "TERCA" && Number(item.quantidade) > 0
  );
  const medidas = tercas
    .map((t) => extrairMedidaDoNome(t.composicoes_galpao?.nome))
    .filter(Boolean)
    .map((m) => parseFloat(m.replace(",", ".")));
  if (medidas.length === 0) return 5;
  return Math.max(...medidas);
}

// Desenho isométrico do galpão pré-moldado, gerado só com os dados do
// orçamento: estrutura aberta com pilares, vigas de travamento, laje
// (quando houver) e coberta de duas águas por vão — galpões germinados
// ganham uma cumeeira para cada vão. As proporções são reais (metros
// projetados) e o enquadramento é automático, então nunca distorce.
function calcularDesenhoGalpao(dados) {
  const vaos = Math.max(1, (Number(dados.galpoesGerminados) || 0) + 1);
  const Wv = Math.max(4, Number(dados.vao) || 10); // largura de cada vão
  const W = Wv * vaos; // largura total
  const C = Math.max(6, Number(dados.comprimento) || 20);
  const H = Math.max(3, Number(dados.peDireito) || 6);
  const hc = (Wv / 2) * 0.15; // cumeeira: 15% de caimento
  const nMod = Math.max(1, Math.round(C / (Number(dados.modulacao) || 5)));
  const passo = C / nMod;

  // Projeção: largura recua para a esquerda/cima, comprimento para a
  // direita/cima, altura sobe na vertical (mesmo ângulo da referência).
  const ux = [-0.78, -0.3];
  const uz = [0.94, -0.34];
  const proj = (x, y, z) => [x * ux[0] + z * uz[0], x * ux[1] + z * uz[1] - y];

  // Enquadramento automático dentro do viewBox
  const cantos = [];
  for (const x of [0, W])
    for (const y of [0, H + hc]) for (const z of [0, C]) cantos.push(proj(x, y, z));
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
  const MARGEM = 46;
  const esc = Math.min((VB_L - 2 * MARGEM) / (maxX - minX), (VB_A - 2 * MARGEM) / (maxY - minY));
  const T = (x, y, z) => {
    const p = proj(x, y, z);
    return [(p[0] - minX) * esc + MARGEM, (p[1] - minY) * esc + MARGEM];
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

  // Linhas longitudinais de pilares: bordas externas + divisas dos vãos
  const linhasX = [];
  for (let v = 0; v <= vaos; v++) linhasX.push(v * Wv);

  // 1) Fundo: empena traseira e lateral distante, em traço mais claro
  for (const x of linhasX) linha(T(x, 0, C), T(x, H, C), CONCRETO_CLARO, wPilar * 0.8);
  for (let i = 1; i < nMod; i++)
    linha(T(W, 0, i * passo), T(W, H, i * passo), CONCRETO_CLARO, wPilar * 0.8);
  linha(T(W, H, 0), T(W, H, C), CONCRETO_CLARO, wViga);
  if (dados.temTravamento) linha(T(W, H * 0.5, 0), T(W, H * 0.5, C), CONCRETO_CLARO, wViga * 0.9);
  linha(T(0, H, C), T(W, H, C), CONCRETO_CLARO, wViga);

  // 2) Laje pré-moldada (plano leve a meia altura, quando houver)
  if (dados.temLaje) {
    const yl = H * 0.5;
    poligono(
      [T(0, yl, 0), T(W, yl, 0), T(W, yl, C), T(0, yl, C)],
      "rgba(214, 221, 228, 0.5)",
      CONCRETO_CLARO,
      0.8
    );
  }

  // 3) Pilares internos (divisas entre galpões germinados)
  for (let v = 1; v < vaos; v++)
    for (let i = 0; i <= nMod; i++)
      linha(T(v * Wv, 0, i * passo), T(v * Wv, H, i * passo), CONCRETO, wPilar * 0.9);

  // 4) Coberta: duas águas por vão, dos vãos mais distantes para os
  // mais próximos, com as linhas das telhas no sentido do caimento
  for (let v = vaos - 1; v >= 0; v--) {
    const x0 = v * Wv;
    const x1 = (v + 1) * Wv;
    const xm = (x0 + x1) / 2;
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
    linha(T(x0, H, 0), T(xm, H + hc, 0), CONCRETO, wViga); // empena frontal
    linha(T(x1, H, 0), T(xm, H + hc, 0), CONCRETO, wViga);
    linha(T(xm, H, 0), T(xm, H + hc, 0), CONCRETO, wViga * 0.9); // pilarete
  }

  // 5) Frente: vigas de topo/travamento e pilares próximos por último
  linha(T(0, H, 0), T(W, H, 0), CONCRETO, wViga);
  linha(T(0, H, 0), T(0, H, C), CONCRETO, wViga);
  if (dados.temTravamento) {
    linha(T(0, H * 0.5, 0), T(W, H * 0.5, 0), CONCRETO, wViga * 0.9);
    linha(T(0, H * 0.5, 0), T(0, H * 0.5, C), CONCRETO, wViga * 0.9);
  }
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

function ConteudoImpressao() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo");
  const [orcamento, setOrcamento] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!codigo) {
        setErro("Código do orçamento não informado na URL.");
        setLoading(false);
        return;
      }
      const [resOrcamento, resConfig] = await Promise.all([
        supabase
          .from("orcamentos_galpao")
          .select(
            "*, clientes(nome, cpf_cnpj, telefone, email, endereco, numero, bairro, cidade, uf, cep), modelos_galpao(nome), itens_orcamento_galpao(id, quantidade, preco_unitario, descricao_livre, unidade_livre, composicoes_galpao(nome, codigo, unidade, papel))"
          )
          .eq("codigo", codigo)
          .single(),
        supabase.from("configuracao_empresa").select("nome_diretor, assinatura_base64").eq("id", 1).single(),
      ]);
      if (!ativo) return;
      if (resOrcamento.error) {
        setErro("Orçamento não encontrado.");
      } else {
        setOrcamento(resOrcamento.data);
        setConfig(resConfig.data || null);
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [codigo]);

  useEffect(() => {
    if (orcamento) {
      const nomeCliente = orcamento.clientes?.nome || "Consumidor Final";
      document.title = nomeArquivoSeguro(
        `Orcamento Galpao ${orcamento.codigo} - ${nomeCliente}`
      );
    }
  }, [orcamento]);

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Carregando...</p>;
  }
  if (erro) {
    return <p className="p-8 text-sm text-red-600">{erro}</p>;
  }
  if (!orcamento) return null;

  const cliente = orcamento.clientes;
  const enderecoCliente = [cliente?.endereco, cliente?.numero, cliente?.bairro]
    .filter(Boolean)
    .join(", ");
  const cidadeUfCliente = [cliente?.cidade, cliente?.uf].filter(Boolean).join("/");
  const vencido =
    orcamento.status !== "aprovado" &&
    orcamento.validade &&
    new Date(orcamento.validade + "T00:00:00") < new Date(new Date().setHours(0, 0, 0, 0));
  const rotuloStatus =
    orcamento.status === "aprovado" ? "Aprovado" : vencido ? "Vencido" : "Pendente";

  const itensOrcamento = orcamento.itens_orcamento_galpao || [];
  const itemTelha = primeiraComPapel(itensOrcamento, "TELHA");
  const itemCalha = primeiraComPapel(itensOrcamento, "CALHA");
  const galpoesGerminados = Math.max(0, Number(orcamento.numero_galpoes_germinados) || 0);
  const larguraTotal = orcamento.vao ? Number(orcamento.vao) * (galpoesGerminados + 1) : null;
  const desenho = calcularDesenhoGalpao({
    vao: orcamento.vao,
    comprimento: orcamento.comprimento,
    peDireito: orcamento.pe_direito,
    galpoesGerminados,
    modulacao: modulacaoNumerica(itensOrcamento),
    temLaje: possuiPapel(itensOrcamento, "LAJE"),
    temTravamento: possuiPapel(itensOrcamento, "VIGA_TRAVAMENTO"),
    textoLargura: larguraTotal ? `${formatarMedida(larguraTotal)}M` : null,
    textoComprimento: orcamento.comprimento ? `${formatarMedida(orcamento.comprimento)}M` : null,
    textoAltura: orcamento.pe_direito ? `${formatarMedida(orcamento.pe_direito)}M` : null,
  });

  const especificacoes = [
    { rotulo: "Largura", valor: orcamento.vao ? `${formatarMedida(orcamento.vao)}M` : "-" },
    {
      rotulo: "Comprimento",
      valor: orcamento.comprimento ? `${formatarMedida(orcamento.comprimento)}M` : "-",
    },
    {
      rotulo: "Altura",
      valor: orcamento.pe_direito ? `${formatarMedida(orcamento.pe_direito)}M` : "-",
    },
    { rotulo: "Modulação", valor: calcularModulacao(itensOrcamento) },
    { rotulo: "Telhas", valor: simplificarNome(itemTelha?.composicoes_galpao?.nome, "TELHA") },
    { rotulo: "Terças", valor: "EM CONCRETO ARMADO" },
    { rotulo: "Laje pré-moldada", valor: possuiPapel(itensOrcamento, "LAJE") ? "SIM" : "NÃO" },
    {
      rotulo: "Área",
      valor:
        orcamento.vao && orcamento.comprimento
          ? `${formatarMedida(Number(orcamento.vao) * Number(orcamento.comprimento))}M²`
          : "-",
    },
    { rotulo: "Calha", valor: simplificarNome(itemCalha?.composicoes_galpao?.nome, "CALHA") },
    {
      rotulo: "Viga de travamento",
      valor: possuiPapel(itensOrcamento, "VIGA_TRAVAMENTO") ? "SIM" : "NÃO",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto p-8 print:p-4 text-slate-900 bg-white">
      <button
        onClick={() => window.print()}
        className="print:hidden mb-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 transition"
      >
        Imprimir / Salvar como PDF
      </button>

      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-4">
        <div>
          <p className="font-bold text-xl">
            MR7 <span className="text-emerald-600">Pré-Moldados</span>
          </p>
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="font-semibold">{EMPRESA.nome}</p>
          <p>{EMPRESA.telefone}</p>
          <p>{EMPRESA.endereco}</p>
          <p>{EMPRESA.cidadeUf}</p>
          <p>CNPJ: {EMPRESA.cnpj}</p>
        </div>
      </div>

      <h1 className="text-center text-lg font-bold mb-1">
        Orçamento de Galpão Nº {orcamento.codigo}
      </h1>
      {orcamento.titulo && (
        <p className="text-center text-sm text-slate-600 mb-6">{orcamento.titulo}</p>
      )}

      <div className="border border-slate-300 rounded-md p-4 mb-6 text-sm grid grid-cols-2 gap-6">
        <div>
          <p className="font-semibold text-xs text-slate-500 mb-1">CLIENTE</p>
          <p className="font-medium">{cliente?.nome || "Consumidor Final"}</p>
          {cliente?.cpf_cnpj && <p className="text-xs">{cliente.cpf_cnpj}</p>}
          {enderecoCliente && <p className="text-xs">{enderecoCliente}</p>}
          {cidadeUfCliente && <p className="text-xs">{cidadeUfCliente}</p>}
          {cliente?.telefone && <p className="text-xs">{cliente.telefone}</p>}
        </div>
        <div className="text-xs space-y-1">
          <p>
            <span className="font-semibold">Data:</span> {formatarDataHora(orcamento.created_at)}
          </p>
          <p>
            <span className="font-semibold">Válido até:</span>{" "}
            {formatarDataSimples(orcamento.validade)}
          </p>
          {orcamento.area_m2 && (
            <p>
              <span className="font-semibold">Área coberta:</span> {orcamento.area_m2} m²
            </p>
          )}
          <p>
            <span className="font-semibold">Vendedor:</span> {orcamento.vendedor || "-"}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {rotuloStatus}
          </p>
        </div>
      </div>

      <div className="border border-slate-300 rounded-md p-4 mb-6 grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="text-xs leading-relaxed">
          {especificacoes.map((e) => (
            <p key={e.rotulo}>
              <span className="font-semibold">{e.rotulo.toUpperCase()}:</span> {e.valor}
            </p>
          ))}
        </div>
        <svg
          width="250"
          viewBox={`0 0 ${desenho.viewBoxLargura} ${desenho.viewBoxAltura}`}
          role="img"
          aria-label="Desenho do galpão pré-moldado com as medidas do orçamento"
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
                  fontSize="11"
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
      </div>

      <table className="w-full border-collapse text-xs mb-2">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 px-2 py-1.5 text-left">Descrição</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Quantidade</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Valor Unitário</th>
            <th className="border border-slate-400 px-2 py-1.5 text-right">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-300 px-2 py-1.5">
              {orcamento.titulo || "Galpão pré-moldado"}
            </td>
            <td className="border border-slate-300 px-2 py-1.5 text-right">1</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right">
              {formatarMoeda(orcamento.total)}
            </td>
            <td className="border border-slate-300 px-2 py-1.5 text-right">
              {formatarMoeda(orcamento.total)}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right font-bold">
              TOTAL
            </td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">
              {formatarMoeda(orcamento.total)}
            </td>
          </tr>
        </tbody>
      </table>

      {orcamento.observacao && (
        <div className="mb-8">
          <p className="font-semibold text-xs text-slate-500 mb-1">OBSERVAÇÕES</p>
          <div className="border border-slate-300 rounded-md p-3 text-xs whitespace-pre-line">
            {orcamento.observacao}
          </div>
        </div>
      )}

      <div className="mt-16 text-xs">
        <div className="text-center max-w-xs">
          {config?.assinatura_base64 && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={config.assinatura_base64}
              alt="Assinatura"
              className="max-h-16 mx-auto mb-1"
            />
          )}
          <div className="border-t border-slate-800 pt-2">
            <p>{config?.nome_diretor || EMPRESA.nome}</p>
            <p className="text-slate-500">Diretor</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ImprimirOrcamentoGalpaoPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Carregando...</p>}>
      <ConteudoImpressao />
    </Suspense>
  );
}
