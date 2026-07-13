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

// Ponto num plano oblíquo simplificado: comprimento corre na horizontal,
// largura recua na diagonal (ângulo fixo), altura sobe na vertical.
// Cada medida é escalada dentro de uma faixa fixa de pixels — assim um
// galpão muito comprido ou muito largo nunca distorce o desenho, só
// varia moderadamente dentro de um intervalo sempre legível.
const DESENHO_ANGULO = (35 * Math.PI) / 180;
const DESENHO_FATOR_PROFUNDIDADE = 0.55;

function escalarMedida(valorMetros, pxMin, pxMax, metroMin, metroMax) {
  const v = Math.max(metroMin, Math.min(metroMax, Number(valorMetros) || metroMin));
  const t = (v - metroMin) / (metroMax - metroMin);
  return pxMin + t * (pxMax - pxMin);
}

function calcularDesenhoGalpao(vao, comprimento, peDireito) {
  const larguraPx = escalarMedida(vao, 85, 175, 6, 20);
  const comprimentoPx = escalarMedida(comprimento, 150, 300, 8, 40);
  const alturaPx = escalarMedida(peDireito, 85, 145, 4, 10);
  const alturaTelhado = alturaPx * 0.22;

  const ox = 60;
  const oyBase = 235;
  const dx = Math.cos(DESENHO_ANGULO) * larguraPx * DESENHO_FATOR_PROFUNDIDADE;
  const dy = -Math.sin(DESENHO_ANGULO) * larguraPx * DESENHO_FATOR_PROFUNDIDADE;

  const fBL = [ox, oyBase];
  const fBR = [ox + comprimentoPx, oyBase];
  const fTL = [ox, oyBase - alturaPx];
  const fTR = [ox + comprimentoPx, oyBase - alturaPx];
  const bBL = [fBL[0] + dx, fBL[1] + dy];
  const bTL = [fTL[0] + dx, fTL[1] + dy];
  const ridgeLeft = [ox + dx / 2, oyBase - alturaPx + dy / 2 - alturaTelhado];
  const ridgeRight = [ox + comprimentoPx + dx / 2, oyBase - alturaPx + dy / 2 - alturaTelhado];

  const pStr = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

  // Colunas (indicação estrutural) — distribuídas ao longo da parede
  // frontal, só pra sugerir os módulos, não precisa bater exatamente
  // com a quantidade real de peças.
  const numColunas = 5;
  const colunas = Array.from({ length: numColunas }, (_, i) => {
    const x = ox + (comprimentoPx * i) / (numColunas - 1);
    return { x1: x, y1: oyBase, x2: x, y2: oyBase - alturaPx };
  });

  // Linhas de telhado (indicam o sentido da telha, correndo da cumeeira
  // até o beiral, acompanhando a direção da largura).
  const numLinhasTelha = 4;
  const linhasTelha = Array.from({ length: numLinhasTelha }, (_, i) => {
    const t = (i + 1) / (numLinhasTelha + 1);
    const x1 = fTL[0] + (fTR[0] - fTL[0]) * t;
    const y1 = fTL[1];
    return {
      x1,
      y1,
      x2: x1 + dx / 2,
      y2: y1 + dy / 2 - alturaTelhado,
    };
  });

  return {
    viewBoxLargura: 460,
    viewBoxAltura: 320,
    paredeLateral: `M${pStr(fBL)} L${pStr(bBL)} L${pStr(bTL)} L${pStr(fTL)} Z`,
    paredeFrontal: `M${pStr(fBL)} L${pStr(fBR)} L${pStr(fTR)} L${pStr(fTL)} Z`,
    frontao: `M${pStr(fTL)} L${pStr(bTL)} L${pStr(ridgeLeft)} Z`,
    telhado: `M${pStr(fTL)} L${pStr(fTR)} L${pStr(ridgeRight)} L${pStr(ridgeLeft)} Z`,
    cumeeira: `M${pStr(ridgeLeft)} L${pStr(ridgeRight)}`,
    chaoX1: ox - 15,
    chaoX2: ox + comprimentoPx + 15,
    chaoY: oyBase,
    colunas,
    linhasTelha,
    fBL,
    fBR,
    fTL,
    bBL,
    bTL,
    oyBase,
    comprimentoPx,
    larguraPx,
    alturaPx,
    dx,
    dy,
  };
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
  const desenho = calcularDesenhoGalpao(orcamento.vao, orcamento.comprimento, orcamento.pe_direito);

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
          width="230"
          viewBox={`0 0 ${desenho.viewBoxLargura} ${desenho.viewBoxAltura}`}
          role="img"
          aria-label="Desenho esquemático do galpão com as medidas do orçamento"
        >
          <line
            x1={desenho.chaoX1}
            y1={desenho.chaoY}
            x2={desenho.chaoX2}
            y2={desenho.chaoY}
            stroke="#0f172a"
            strokeWidth="1"
          />
          <path d={desenho.paredeLateral} fill="#f1f5f9" stroke="#0f172a" strokeWidth="1.3" />
          <path d={desenho.paredeFrontal} fill="#f8fafc" stroke="#0f172a" strokeWidth="1.3" />
          <path d={desenho.frontao} fill="#f1f5f9" stroke="#0f172a" strokeWidth="1.3" />
          <path d={desenho.telhado} fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.3" />
          <path d={desenho.cumeeira} stroke="#0f172a" strokeWidth="1.3" fill="none" />
          {desenho.colunas.map((c, i) => (
            <line
              key={i}
              x1={c.x1}
              y1={c.y1}
              x2={c.x2}
              y2={c.y2}
              stroke="#64748b"
              strokeWidth="1"
            />
          ))}
          {desenho.linhasTelha.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="#94a3b8"
              strokeWidth="0.8"
            />
          ))}
          {/* Cota: comprimento */}
          <line
            x1={desenho.fBL[0]}
            y1={desenho.oyBase + 22}
            x2={desenho.fBR[0]}
            y2={desenho.oyBase + 22}
            stroke="#059669"
            strokeWidth="1"
          />
          <text
            x={(desenho.fBL[0] + desenho.fBR[0]) / 2}
            y={desenho.oyBase + 38}
            textAnchor="middle"
            fontSize="11"
            fill="#059669"
            fontWeight="600"
          >
            {formatarMedida(orcamento.comprimento)}M
          </text>
          {/* Cota: altura */}
          <line
            x1={desenho.fBL[0] - 22}
            y1={desenho.fBL[1]}
            x2={desenho.fTL[0] - 22}
            y2={desenho.fTL[1]}
            stroke="#059669"
            strokeWidth="1"
          />
          <text
            x={desenho.fBL[0] - 28}
            y={(desenho.fBL[1] + desenho.fTL[1]) / 2}
            textAnchor="end"
            fontSize="11"
            fill="#059669"
            fontWeight="600"
          >
            {formatarMedida(orcamento.pe_direito)}M
          </text>
          {/* Cota: largura */}
          <text
            x={(desenho.fBL[0] + desenho.bBL[0]) / 2 - 6}
            y={(desenho.fBL[1] + desenho.bBL[1]) / 2 + 16}
            textAnchor="middle"
            fontSize="11"
            fill="#059669"
            fontWeight="600"
          >
            {formatarMedida(orcamento.vao)}M
          </text>
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
