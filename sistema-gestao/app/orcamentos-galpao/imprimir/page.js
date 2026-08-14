"use client";

import { Suspense, useEffect, useState } from "react";
import { calcularDesenhoGalpao } from "../desenho-galpao";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const EMPRESA_PADRAO = {
  nome: "MR7 PRÉ MOLDADOS LTDA",
  telefone: "(82) 98181-0774",
  endereco: "Rodovia AL485, Nº 400",
  cidadeUf: "57340000 - Feira Grande, AL",
  cnpj: "43.926.578/0001-86",
};

// Mescla os dados salvos em Configurações com os padrões (fallback):
// se o campo não foi preenchido lá, usa o valor fixo de sempre.
function dadosEmpresa(config) {
  return {
    nome: config?.nome_empresa || EMPRESA_PADRAO.nome,
    telefone: config?.telefone || EMPRESA_PADRAO.telefone,
    endereco: config?.endereco || EMPRESA_PADRAO.endereco,
    cidadeUf: config?.cidade_uf || EMPRESA_PADRAO.cidadeUf,
    cnpj: config?.cnpj || EMPRESA_PADRAO.cnpj,
    logo: config?.logo_base64 || null,
    rodape: config?.rodape_impressos || null,
  };
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Valor por extenso, para a proposta impressa.
// Ex.: 399371.43 -> "trezentos e noventa e nove mil, trezentos e setenta e
// um reais e quarenta e tres centavos".
function valorPorExtenso(valor) {
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

  // Escreve um numero de 0 a 999.
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
        partes.push(
          g.valor === 1000 && qtd === 1 ? "mil" : ate999(qtd) + " " + nome
        );
        resto = resto % g.valor;
      }
    }
    if (resto > 0) partes.push(ate999(resto));
    // "e" antes da ultima parte quando ela e menor que 100 ou centena redonda
    if (partes.length > 1) {
      const ultima = partes[partes.length - 1];
      const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
      return partes.slice(0, -1).join(", ") + (ligaComE ? " e " : ", ") + ultima;
    }
    return partes[0] || "zero";
  };

  // "um milhao DE reais" (e nao "um milhao reais"): milhao/bilhao redondos
  // pedem a preposicao. Mil nao pede: "mil reais".
  const terminaEmMilhaoRedondo =
    inteiro >= 1000000 && inteiro % 1000000 === 0;
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
// (quando houver) e coberta de duas águas por galpão — geminados ganham
// uma cumeeira para cada galpão, inclusive com LARGURAS DIFERENTES
// (lista em dados.larguras). As proporções são reais (metros projetados)
// e o enquadramento é automático, então nunca distorce.

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
        supabase.from("configuracao_empresa").select("nome_diretor, assinatura_base64, nome_empresa, cnpj, telefone, endereco, cidade_uf, logo_base64, rodape_impressos").eq("id", 1).single(),
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
      // Medidas no nome do arquivo (ex.: 10X18X4) para diferenciar dois
      // orcamentos do mesmo cliente.
      const num = (v) => {
        const x = Number(v);
        return isFinite(x) && x > 0
          ? String(x).replace(/\.0+$/, "").replace(".", ",")
          : null;
      };
      const medidas = [
        num(orcamento.vao),
        num(orcamento.comprimento),
        num(orcamento.pe_direito),
      ].filter(Boolean);
      const sufixo = medidas.length ? ` ${medidas.join("X")}` : "";
      document.title = nomeArquivoSeguro(
        `Orcamento Galpao ${orcamento.codigo} - ${nomeCliente}${sufixo}`
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

  const empresa = dadosEmpresa(config);

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
  // Geminados podem ter larguras diferentes (lista salva no orçamento);
  // sem a lista, repete a largura única para todos os galpões.
  const largurasGalpoes =
    Array.isArray(orcamento.larguras_galpoes) &&
    orcamento.larguras_galpoes.some((n) => Number(n) > 0)
      ? orcamento.larguras_galpoes.map((n) => Number(n) || 0).filter((n) => n > 0)
      : null;
  const larguraTotal = largurasGalpoes
    ? largurasGalpoes.reduce((s, n) => s + n, 0)
    : orcamento.vao
      ? Number(orcamento.vao) * (galpoesGerminados + 1)
      : null;
  const areaTotal =
    larguraTotal && orcamento.comprimento ? larguraTotal * Number(orcamento.comprimento) : null;
  const desenho = calcularDesenhoGalpao({
    vao: orcamento.vao,
    comprimento: orcamento.comprimento,
    peDireito: orcamento.pe_direito,
    galpoesGerminados,
    larguras: largurasGalpoes,
    modulacao: modulacaoNumerica(itensOrcamento),
    temLaje: possuiPapel(itensOrcamento, "LAJE"),
    temTravamento: possuiPapel(itensOrcamento, "VIGA_TRAVAMENTO"),
    // O desenho impresso segue as peças do orçamento, igual ao da tela:
    // sem telha/tesoura/terça não há coberta; as vigas de laje aparecem
    // assim que são lançadas, mesmo sem a laje.
    temCoberta:
      possuiPapel(itensOrcamento, "TELHA") ||
      possuiPapel(itensOrcamento, "TESOURA") ||
      possuiPapel(itensOrcamento, "TERCA"),
    temVigaLaje: possuiPapel(itensOrcamento, "VIGA_LAJE"),
    alturaLaje: orcamento.altura_laje,
    temSegundaLaje: !!orcamento.tem_segunda_laje,
    temLaje2: Number(orcamento.area_laje2) > 0 && !!orcamento.tipo_laje2_id,
    areaLaje2: orcamento.area_laje2,
    alturaLaje2: orcamento.altura_laje2,
    areaLaje: orcamento.area_laje,
    textoLargura: larguraTotal ? `${formatarMedida(larguraTotal)}M` : null,
    textoComprimento: orcamento.comprimento ? `${formatarMedida(orcamento.comprimento)}M` : null,
    textoAltura: orcamento.pe_direito ? `${formatarMedida(orcamento.pe_direito)}M` : null,
  });

  const especificacoes = [
    {
      rotulo: "Largura",
      valor: largurasGalpoes
        ? `${largurasGalpoes.map((n) => formatarMedida(n)).join("M + ")}M (${formatarMedida(larguraTotal)}M)`
        : orcamento.vao
          ? galpoesGerminados > 0
            ? `${galpoesGerminados + 1} x ${formatarMedida(orcamento.vao)}M (${formatarMedida(larguraTotal)}M)`
            : `${formatarMedida(orcamento.vao)}M`
          : "-",
    },
    {
      rotulo: "Comprimento",
      valor: orcamento.comprimento ? `${formatarMedida(orcamento.comprimento)}M` : "-",
    },
    {
      rotulo: "Altura",
      valor: orcamento.pe_direito ? `${formatarMedida(orcamento.pe_direito)}M` : "-",
    },
    {
      rotulo: "Modulação",
      valor: possuiPapel(itensOrcamento, "TERCA")
        ? calcularModulacao(itensOrcamento)
        : "NÃO CONTEMPLA",
    },
    {
      rotulo: "Telhas",
      valor: itemTelha
        ? simplificarNome(itemTelha.composicoes_galpao?.nome, "TELHA")
        : "NÃO CONTEMPLA",
    },
    {
      rotulo: "Terças",
      // Só afirma "em concreto armado" se houver terça no orçamento.
      valor: possuiPapel(itensOrcamento, "TERCA") ? "EM CONCRETO ARMADO" : "NÃO CONTEMPLA",
    },
    { rotulo: "Laje pré-moldada", valor: possuiPapel(itensOrcamento, "LAJE") ? "SIM" : "NÃO" },
    {
      rotulo: "Área",
      valor: areaTotal ? `${formatarMedida(areaTotal)}M²` : "-",
    },
    {
      rotulo: "Calha",
      valor: itemCalha
        ? simplificarNome(itemCalha.composicoes_galpao?.nome, "CALHA")
        : "NÃO CONTEMPLA",
    },
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
        <div className="flex items-center gap-3">
          {empresa.logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={empresa.logo} alt="Logo" className="max-h-16 max-w-[160px] object-contain" />
          ) : (
            <p className="font-bold text-xl">
              MR7 <span className="text-emerald-600">Pré-Moldados</span>
            </p>
          )}
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="font-semibold">{empresa.nome}</p>
          <p>{empresa.telefone}</p>
          <p>{empresa.endereco}</p>
          <p>{empresa.cidadeUf}</p>
          <p>CNPJ: {empresa.cnpj}</p>
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
          <tr>
            <td
              colSpan={4}
              className="border border-slate-300 px-2 py-1.5 text-xs italic text-slate-600"
            >
              {valorPorExtenso(orcamento.total)}.
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

      {empresa.rodape && (
        <div className="mt-8 pt-3 border-t border-slate-300 text-[11px] text-slate-600 whitespace-pre-line">
          {empresa.rodape}
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
            <p>{config?.nome_diretor || empresa.nome}</p>
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
