"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Printer, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const PAPEIS_EXCLUIDOS = ["POSTE", "CAPITEL"]; // caixa d'água, tratado à parte

// Ordem fixa das peças dentro de cada seção, seguindo a planilha da
// empresa. Peças novas do mesmo tipo entram logo abaixo das existentes
// (ex: outra terça vai parar embaixo da terça que já está na lista).
const ORDEM_ESTRUTURA = [
  "TESOURA", "PILAR", "TERCA", "VIGA_TRAVAMENTO",
  "TELHA", "CAPOTE", "CALHA", "MONTAGEM", "FUNDACAO",
];
const ORDEM_LAJE = ["PILAR", "VIGA_LAJE", "LAJE", "MONTAGEM"];

// Itens livres (sem peça do catálogo) têm papel deduzido pelo nome.
function papelDoItem(item) {
  if (item.papel) return item.papel;
  const nome = (item.nome || "").toUpperCase();
  if (nome.startsWith("VIGA PARA LAJE")) return "VIGA_LAJE";
  if (nome.startsWith("TESOURA")) return "TESOURA";
  return null;
}

function ordenarItensPorPapel(lista, ordem) {
  const posicaoMontagem = ordem.indexOf("MONTAGEM");
  const posicao = (item) => {
    const idx = ordem.indexOf(papelDoItem(item));
    // Tipos fora da lista (peças avulsas) ficam antes da montagem/fundação.
    return idx !== -1 ? idx : posicaoMontagem - 0.5;
  };
  return [...lista].sort((a, b) => posicao(a) - posicao(b) || a.chave - b.chave);
}
// Categorias tratadas em campos dedicados (telha, calha, capote,
// montagem, fundação) — excluídas do seletor genérico de peças pra não
// duplicar, não importa o nome específico de cada uma.
const PAPEIS_COM_CAMPO_DEDICADO = ["TELHA", "CALHA", "CAPOTE", "MONTAGEM", "FUNDACAO"];

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

function calcularDataFutura(dias) {
  const n = Number(dias);
  if (!n || n <= 0) return "";
  const data = new Date();
  data.setDate(data.getDate() + n);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasAPartirDeHoje(dataISO) {
  if (!dataISO) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataISO + "T00:00:00");
  const diffDias = Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? String(diffDias) : "";
}

function estaVencido(orcamento) {
  if (orcamento.status === "aprovado" || !orcamento.validade) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(orcamento.validade + "T00:00:00") < hoje;
}

function BadgeStatus({ status }) {
  const estilos = {
    pendente: "bg-amber-50 text-amber-700 border-amber-200",
    vencido: "bg-rose-50 text-rose-700 border-rose-200",
    aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const rotulos = { pendente: "Pendente", vencido: "Vencido", aprovado: "Aprovado" };
  const classe = estilos[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}>
      {rotulos[status] || status || "-"}
    </span>
  );
}

// Recalcula a quantidade de FUNDAÇÃO = soma das quantidades de todos os
// itens cujo papel é PILAR (1 dia de fundação por pilar).
function recalcularFundacao(listaItens) {
  const totalPilares = listaItens.reduce(
    (soma, i) => (i.papel === "PILAR" ? soma + Number(i.quantidade || 0) : soma),
    0
  );
  return listaItens.map((i) => (i.nome === "FUNDAÇÃO" ? { ...i, quantidade: totalPilares } : i));
}

export default function OrcamentosGalpaoPage() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [clientes, setClientes] = useState([]);
  const [composicoes, setComposicoes] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [convertendoId, setConvertendoId] = useState(null);
  const [expandidoId, setExpandidoId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState("");

  const [clienteId, setClienteId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [vao, setVao] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [peDireito, setPeDireito] = useState("");
  const [numeroVaos, setNumeroVaos] = useState("");
  const [numeroGalpoesGerminados, setNumeroGalpoesGerminados] = useState("0");
  const [telhaId, setTelhaId] = useState("");
  const [areaLaje, setAreaLaje] = useState("");
  const [tipoLajeId, setTipoLajeId] = useState("");
  const [pilarLajeId, setPilarLajeId] = useState("");
  const [pilarLajeQtd, setPilarLajeQtd] = useState("1");
  const [montagemLajeQtd, setMontagemLajeQtd] = useState("");
  const [diasValidade, setDiasValidade] = useState("");
  const [itens, setItens] = useState([]);
  const [composicaoParaAdicionar, setComposicaoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("1");
  const [desconto, setDesconto] = useState("");
  const [margemComercial, setMargemComercial] = useState("25");
  const [observacao, setObservacao] = useState("");
  const [observacaoInterna, setObservacaoInterna] = useState("");

  const [vigaLargura, setVigaLargura] = useState("");
  const [vigaAltura, setVigaAltura] = useState("");
  const [vigaVao, setVigaVao] = useState("");
  const [vigaValorM3, setVigaValorM3] = useState("");
  const [vigaQtd, setVigaQtd] = useState("1");

  const [tesouraRefId, setTesouraRefId] = useState("");
  const [tesouraTamanho, setTesouraTamanho] = useState("");
  const [tesouraQtd, setTesouraQtd] = useState("1");

  const proximaChave = useRef(1);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nome =
        data.session?.user?.user_metadata?.nome_completo ||
        data.session?.user?.email ||
        "";
      setNomeUsuario(nome);
    });
  }, []);

  function buscarClientes() {
    return supabase.from("clientes").select("id, nome").order("nome");
  }
  function buscarComposicoes() {
    return supabase
      .from("composicoes_galpao")
      .select("id, codigo, nome, unidade, preco, papel, comprimento_referencia")
      .order("nome");
  }
  function buscarModelos() {
    return supabase.from("modelos_galpao").select("id, nome, tipo").order("id");
  }
  function buscarOrcamentosGalpao() {
    return supabase
      .from("orcamentos_galpao")
      .select(
        "*, clientes(nome), modelos_galpao(nome, tipo), itens_orcamento_galpao(id, composicao_id, descricao_livre, unidade_livre, quantidade, preco_unitario, secao, composicoes_galpao(nome, unidade, papel))"
      )
      .order("codigo", { ascending: false });
  }

  function aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos) {
    const erroEncontrado =
      resClientes.error || resComposicoes.error || resModelos.error || resOrcamentos.error;
    if (erroEncontrado) {
      setErro("Não foi possível carregar os dados: " + erroEncontrado.message);
    } else {
      setClientes(resClientes.data);
      setComposicoes(resComposicoes.data);
      setModelos(resModelos.data);
      setOrcamentos(resOrcamentos.data);
    }
    setLoading(false);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    const [resClientes, resComposicoes, resModelos, resOrcamentos] = await Promise.all([
      buscarClientes(),
      buscarComposicoes(),
      buscarModelos(),
      buscarOrcamentosGalpao(),
    ]);
    aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos);
  }

  useEffect(() => {
    let ativo = true;
    Promise.all([buscarClientes(), buscarComposicoes(), buscarModelos(), buscarOrcamentosGalpao()]).then(
      ([resClientes, resComposicoes, resModelos, resOrcamentos]) => {
        if (ativo) aplicarResultados(resClientes, resComposicoes, resModelos, resOrcamentos);
      }
    );
    return () => {
      ativo = false;
    };
  }, []);

  const modeloSelecionado = modelos.find((m) => String(m.id) === String(modeloId));
  const tipoSelecionado = modeloSelecionado?.tipo || "";
  const areaCalculada = vao && comprimento ? Number(vao) * Number(comprimento) : null;

  // Recalcula telha/calha/capote automaticamente, ao vivo, sempre que as
  // medidas, o nº de galpões germinados ou o tipo de telha mudam.
  useEffect(() => {
    if (!vao || !comprimento) return;
    const area = Number(vao) * Number(comprimento);
    // O campo é "quantos galpões germinados A MAIS" (0 = avulso, sem
    // germinação). +1 converte pro total de unidades físicas coladas,
    // que é o que as fórmulas de calha/capote realmente precisam.
    const germinados = Math.max(0, Number(numeroGalpoesGerminados) || 0) + 1;

    setItens((atual) => {
      if (atual.length === 0) return atual;
      let novos = [...atual];

      // Remove qualquer linha de um tipo de telha diferente do que está
      // selecionado agora (evita duplicar se o usuário trocar o tipo).
      novos = novos.filter(
        (i) => !(i.papel === "TELHA" && (!telhaId || i.composicao_id !== Number(telhaId)))
      );

      const telha = telhaId ? composicoes.find((c) => String(c.id) === String(telhaId)) : null;
      if (telha) {
        const qtdTelha = Math.round(area * 1.1 * 100) / 100;
        const jaExiste = novos.some((i) => i.composicao_id === telha.id);
        if (jaExiste) {
          novos = novos.map((i) =>
            i.composicao_id === telha.id ? { ...i, quantidade: qtdTelha } : i
          );
        } else {
          novos.push({
            chave: proximaChave.current++,
            composicao_id: telha.id,
            nome: telha.nome,
            unidade: telha.unidade,
            papel: telha.papel,
            quantidade: qtdTelha,
            preco_unitario: Number(telha.preco) || 0,
            secao: "estrutura",
            automatico: true,
          });
        }
      }

      // Calha: cada galpão germinado soma mais uma "linha" de calha (as
      // bordas externas + 1 calha central por cada junção entre galpões).
      // multiplicador = nº de galpões germinados + 1 (1 galpão => 2, como
      // antes; 2 galpões germinados => 3; 3 => 4; e assim por diante).
      if (numeroVaos) {
        const multiplicadorCalha = germinados + 1;
        const qtdCalha =
          Math.round(
            (multiplicadorCalha * Number(comprimento) +
              0.5 * multiplicadorCalha * Number(numeroVaos)) *
              100
          ) / 100;
        novos = novos.map((i) => (i.nome === "CALHA FIBRA" ? { ...i, quantidade: qtdCalha } : i));
      }

      // Capote: um jogo de capotes por galpão (multiplicador = nº de
      // galpões germinados, direto — 1 galpão => 1x, 2 germinados => 2x).
      const qtdCapote = Math.round((Number(comprimento) + 2) * germinados * 100) / 100;
      novos = novos.map((i) => (i.nome === "CAPOTE" ? { ...i, quantidade: qtdCapote } : i));

      // Laje/mezanino: vendida por m² direto (o preço já é por m², a
      // área de referência de cada painel só entra no cálculo de custo
      // por trás) — mesma lógica da telha, sem multiplicador de perda.
      novos = novos.filter(
        (i) => !(i.papel === "LAJE" && (!tipoLajeId || i.composicao_id !== Number(tipoLajeId)))
      );
      if (tipoLajeId && areaLaje) {
        const laje = composicoes.find((c) => String(c.id) === String(tipoLajeId));
        if (laje) {
          const qtdLaje = Math.round(Number(areaLaje) * 100) / 100;
          const jaExisteLaje = novos.some((i) => i.composicao_id === laje.id);
          if (jaExisteLaje) {
            novos = novos.map((i) =>
              i.composicao_id === laje.id ? { ...i, quantidade: qtdLaje } : i
            );
          } else {
            novos.push({
              chave: proximaChave.current++,
              composicao_id: laje.id,
              nome: laje.nome,
              unidade: laje.unidade,
              papel: laje.papel,
              quantidade: qtdLaje,
              preco_unitario: Number(laje.preco) || 0,
              secao: "laje",
              automatico: true,
            });
          }
        }
      }

      return novos;
    });
  }, [
    vao,
    comprimento,
    numeroVaos,
    numeroGalpoesGerminados,
    telhaId,
    areaLaje,
    tipoLajeId,
    composicoes,
  ]);

  const composicoesSelecionaveis = composicoes.filter((c) => {
    if (PAPEIS_EXCLUIDOS.includes(c.papel)) return false;
    if (PAPEIS_COM_CAMPO_DEDICADO.includes(c.papel)) return false;
    if (c.papel === "LAJE" && tipoSelecionado === "simples") return false;
    return true;
  });
  const composicoesPorPapel = composicoesSelecionaveis.reduce((acc, c) => {
    const grupo = c.papel || "Outras peças";
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(c);
    return acc;
  }, {});
  // Papel = TELHA é a forma de marcar um tipo de telha/cobertura no
  // catálogo (em Preços). Adicionar um tipo novo lá já aparece aqui.
  const telhasDisponiveis = composicoes.filter((c) => c.papel === "TELHA");
  const lajesDisponiveis = composicoes.filter((c) => c.papel === "LAJE");
  const tesourasComReferencia = composicoes.filter(
    (c) => c.papel === "TESOURA" && Number(c.comprimento_referencia) > 0
  );

  function buscarComposicao(nome) {
    return composicoes.find((c) => c.nome === nome);
  }

  function itensObrigatoriosBase() {
    const nomes = ["MONTAGEM", "FUNDAÇÃO", "CALHA FIBRA", "CAPOTE"];
    return nomes
      .map((nome) => buscarComposicao(nome))
      .filter(Boolean)
      .map((c) => ({
        chave: proximaChave.current++,
        composicao_id: c.id,
        nome: c.nome,
        unidade: c.unidade,
        papel: c.papel,
        quantidade: 0,
        preco_unitario: Number(c.preco) || 0,
        secao: "estrutura",
        obrigatorio: true,
      }));
  }

  function adicionarItem() {
    if (!composicaoParaAdicionar) return;
    const composicao = composicoes.find(
      (c) => String(c.id) === String(composicaoParaAdicionar)
    );
    if (!composicao) return;
    const quantidade = Math.max(1, Number(quantidadeParaAdicionar) || 1);
    setItens((atual) => {
      const novos = [
        ...atual,
        {
          chave: proximaChave.current++,
          composicao_id: composicao.id,
          nome: composicao.nome,
          unidade: composicao.unidade,
          papel: composicao.papel,
          quantidade,
          preco_unitario: Number(composicao.preco) || 0,
          secao: "estrutura",
        },
      ];
      return composicao.papel === "PILAR" ? recalcularFundacao(novos) : novos;
    });
    setComposicaoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
  }

  function adicionarVigaLaje() {
    const l = Number(vigaLargura) || 0;
    const a = Number(vigaAltura) || 0;
    const v = Number(vigaVao) || 0;
    const valorM3 = Number(vigaValorM3) || 0;
    const qtd = Math.max(1, Number(vigaQtd) || 1);
    if (l <= 0 || a <= 0 || v <= 0 || valorM3 <= 0) {
      setErro("Preencha largura, altura, vão e valor do m³ para adicionar a viga para laje.");
      return;
    }
    // O volume (m³) serve pra chegar no PREÇO de cada viga; no orçamento
    // ela entra como PEÇA: quantidade de vigas × preço por viga.
    const volume = Math.round(l * a * v * 10000) / 10000;
    const precoPorViga = Math.round(volume * valorM3 * 100) / 100;
    setItens((atual) => [
      ...atual,
      {
        chave: proximaChave.current++,
        composicao_id: null,
        nome: `VIGA PARA LAJE ${l.toFixed(2)}X${a.toFixed(2)}X${v.toFixed(2)}M`,
        unidade: "UND",
        papel: "VIGA_LAJE",
        quantidade: qtd,
        preco_unitario: precoPorViga,
        secao: "laje",
      },
    ]);
    setVigaLargura("");
    setVigaAltura("");
    setVigaVao("");
    setVigaValorM3("");
    setVigaQtd("1");
    setErro("");
  }

  function adicionarTesouraProporcional() {
    const ref = tesourasComReferencia.find((t) => String(t.id) === String(tesouraRefId));
    const tamanho = Number(tesouraTamanho) || 0;
    const qtd = Math.max(1, Number(tesouraQtd) || 1);
    if (!ref || tamanho <= 0) {
      setErro("Selecione uma tesoura de referência e informe o tamanho desejado.");
      return;
    }
    const precoProporcional =
      Math.round((Number(ref.preco) / Number(ref.comprimento_referencia)) * tamanho * 100) / 100;
    setItens((atual) => [
      ...atual,
      {
        chave: proximaChave.current++,
        composicao_id: null,
        nome: `Tesoura ${tamanho}M de vão livre (calculada proporcionalmente a partir da ${ref.nome})`,
        unidade: "PÇ",
        papel: "TESOURA",
        quantidade: qtd,
        preco_unitario: precoProporcional,
        secao: "estrutura",
      },
    ]);
    setTesouraRefId("");
    setTesouraTamanho("");
    setTesouraQtd("1");
    setErro("");
  }

  function adicionarPilarLaje() {
    const pilar = composicoes.find((c) => String(c.id) === String(pilarLajeId));
    const qtd = Math.max(1, Number(pilarLajeQtd) || 1);
    if (!pilar) {
      setErro("Selecione o pilar da laje/mezanino.");
      return;
    }
    setItens((atual) => {
      const novos = [
        ...atual,
        {
          chave: proximaChave.current++,
          composicao_id: pilar.id,
          nome: pilar.nome,
          unidade: pilar.unidade,
          papel: pilar.papel,
          quantidade: qtd,
          preco_unitario: Number(pilar.preco) || 0,
          secao: "laje",
        },
      ];
      // Pilar da laje também precisa de fundação (1 dia por pilar).
      return recalcularFundacao(novos);
    });
    setPilarLajeId("");
    setPilarLajeQtd("1");
    setErro("");
  }

  function adicionarMontagemLaje() {
    const montagem = buscarComposicao("MONTAGEM");
    const qtd = Math.max(1, Number(montagemLajeQtd) || 0);
    if (!montagem || !montagemLajeQtd || qtd <= 0) {
      setErro("Informe a quantidade (VB) da montagem da laje/mezanino.");
      return;
    }
    setItens((atual) => {
      const jaExiste = atual.some((i) => i.nome === "MONTAGEM" && i.secao === "laje");
      if (jaExiste) {
        // Já tem montagem na seção da laje — só atualiza a quantidade.
        return atual.map((i) =>
          i.nome === "MONTAGEM" && i.secao === "laje" ? { ...i, quantidade: qtd } : i
        );
      }
      return [
        ...atual,
        {
          chave: proximaChave.current++,
          composicao_id: montagem.id,
          nome: montagem.nome,
          unidade: montagem.unidade,
          papel: montagem.papel,
          quantidade: qtd,
          preco_unitario: Number(montagem.preco) || 0,
          secao: "laje",
        },
      ];
    });
    setMontagemLajeQtd("");
    setErro("");
  }

  function removerItem(chave) {
    setItens((atual) => {
      const itemRemovido = atual.find((i) => i.chave === chave);
      const restantes = atual.filter((i) => i.chave !== chave);
      return itemRemovido?.papel === "PILAR" ? recalcularFundacao(restantes) : restantes;
    });
  }

  function atualizarItem(chave, campo, valor) {
    setItens((atual) => {
      const itemAlvo = atual.find((i) => i.chave === chave);
      const atualizados = atual.map((i) =>
        i.chave === chave ? { ...i, [campo]: Math.max(0, Number(valor) || 0) } : i
      );
      // Só recalcula a fundação sozinha quando quem mudou foi um PILAR —
      // editar a fundação diretamente não é sobrescrito (fica manual).
      if (campo === "quantidade" && itemAlvo?.papel === "PILAR") {
        return recalcularFundacao(atualizados);
      }
      return atualizados;
    });
  }

  const subtotal = itens.reduce((soma, i) => soma + i.quantidade * i.preco_unitario, 0);
  const margemNumerica = Math.max(0, Number(margemComercial) || 0);
  const totalComMargem = subtotal * (1 + margemNumerica / 100);
  const descontoNumerico = Math.min(Math.max(0, Number(desconto) || 0), totalComMargem);
  const totalFinal = totalComMargem - descontoNumerico;

  // Seções separadas, como na planilha da empresa: a estrutura do galpão
  // tem valor/m² pela área do galpão; a laje/mezanino tem subtotal e
  // valor/m² próprios, pela área da laje.
  const itensEstrutura = itens.filter((i) => i.secao !== "laje");
  const itensLaje = itens.filter((i) => i.secao === "laje");
  const itensEstruturaOrdenados = ordenarItensPorPapel(itensEstrutura, ORDEM_ESTRUTURA);
  const itensLajeOrdenados = ordenarItensPorPapel(itensLaje, ORDEM_LAJE);
  const subtotalEstrutura = itensEstrutura.reduce(
    (soma, i) => soma + i.quantidade * i.preco_unitario, 0
  );
  const subtotalLaje = itensLaje.reduce((soma, i) => soma + i.quantidade * i.preco_unitario, 0);
  const areaLajeNumerica = Number(areaLaje) || 0;
  const fatorMargem = 1 + margemNumerica / 100;
  const valorPorM2 =
    areaCalculada && areaCalculada > 0
      ? (subtotalEstrutura * fatorMargem) / areaCalculada
      : null;
  const valorPorM2Laje =
    itensLaje.length > 0 && areaLajeNumerica > 0
      ? (subtotalLaje * fatorMargem) / areaLajeNumerica
      : null;

  function limparFormulario() {
    setClienteId("");
    setModeloId("");
    setVao("");
    setComprimento("");
    setPeDireito("");
    setNumeroVaos("");
    setNumeroGalpoesGerminados("0");
    setTelhaId("");
    setAreaLaje("");
    setTipoLajeId("");
    setPilarLajeId("");
    setPilarLajeQtd("1");
    setMontagemLajeQtd("");
    setDiasValidade("");
    setItens([]);
    setComposicaoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setDesconto("");
    setMargemComercial("25");
    setObservacao("");
    setObservacaoInterna("");
    setVigaLargura("");
    setVigaAltura("");
    setVigaVao("");
    setVigaValorM3("");
    setVigaQtd("1");
    setTesouraRefId("");
    setTesouraTamanho("");
    setTesouraQtd("1");
  }

  function abrirNovo() {
    limparFormulario();
    setEditingId(null);
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setItens(itensObrigatoriosBase());
    setModo("novo");
  }

  function abrirEdicao(orcamento) {
    setEditingId(orcamento.id);
    setEditingCodigo(orcamento.codigo);
    setClienteId(String(orcamento.cliente_id || ""));
    setModeloId(orcamento.modelo_id ? String(orcamento.modelo_id) : "");
    setVao(orcamento.vao ? String(orcamento.vao) : "");
    setComprimento(orcamento.comprimento ? String(orcamento.comprimento) : "");
    setPeDireito(orcamento.pe_direito ? String(orcamento.pe_direito) : "");
    setNumeroVaos(orcamento.numero_vaos ? String(orcamento.numero_vaos) : "");
    setNumeroGalpoesGerminados(
      orcamento.numero_galpoes_germinados === null || orcamento.numero_galpoes_germinados === undefined
        ? "0"
        : String(orcamento.numero_galpoes_germinados)
    );
    setDiasValidade(diasAPartirDeHoje(orcamento.validade));
    setDesconto(orcamento.desconto ? String(orcamento.desconto) : "");
    setMargemComercial(
      orcamento.margem_comercial_pct ? String(orcamento.margem_comercial_pct) : ""
    );
    setObservacao(orcamento.observacao || "");
    setObservacaoInterna(orcamento.observacao_interna || "");
    const itensCarregados = (orcamento.itens_orcamento_galpao || []).map((item) => ({
      chave: proximaChave.current++,
      composicao_id: item.composicao_id,
      nome: item.composicoes_galpao?.nome || item.descricao_livre || "Item removido",
      unidade: item.composicoes_galpao?.unidade || item.unidade_livre,
      papel: item.composicoes_galpao?.papel || null,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco_unitario),
      secao: item.secao === "laje" ? "laje" : "estrutura",
      // Obrigatórios são só os da estrutura base — a montagem da laje,
      // por exemplo, pode ser removida sem travar o orçamento.
      obrigatorio:
        item.secao !== "laje" &&
        ["MONTAGEM", "FUNDAÇÃO", "CALHA FIBRA", "CAPOTE"].includes(
          item.composicoes_galpao?.nome
        ),
    }));
    // IMPORTANTE: preencher os seletores de telha e laje a partir dos
    // itens salvos — sem isso, o recálculo ao vivo (que confia nesses
    // seletores) removeria as linhas de telha/laje ao editar.
    const itemTelha = itensCarregados.find((i) => i.papel === "TELHA");
    setTelhaId(itemTelha ? String(itemTelha.composicao_id) : "");
    const itemLaje = itensCarregados.find((i) => i.papel === "LAJE");
    setTipoLajeId(itemLaje ? String(itemLaje.composicao_id) : "");
    setAreaLaje(
      orcamento.area_laje
        ? String(orcamento.area_laje)
        : itemLaje
          ? String(itemLaje.quantidade)
          : ""
    );
    setItens(itensCarregados);
    setErro("");
    setMensagem("");
    setModo("editar");
  }

  function voltar() {
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }
    if (!modeloId) {
      setErro("Selecione o tipo de galpão.");
      return;
    }
    const itensValidos = itens.filter((i) => i.quantidade > 0);
    const obrigatorioFaltando = itens.find((i) => i.obrigatorio && i.quantidade <= 0);
    if (obrigatorioFaltando) {
      setErro(
        `Informe a quantidade de "${obrigatorioFaltando.nome}" antes de salvar (esse item é obrigatório e não pode ficar zerado).`
      );
      return;
    }
    if (itensValidos.length === 0) {
      setErro("Adicione ao menos uma peça com quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    setMensagem("");

    const itensPayload = itensValidos.map((i) => ({
      composicao_id: i.composicao_id || null,
      descricao_livre: i.composicao_id ? null : i.nome,
      unidade_livre: i.composicao_id ? null : i.unidade,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      secao: i.secao === "laje" ? "laje" : "estrutura",
    }));
    const validadeCalculada = calcularDataFutura(diasValidade) || null;

    const { error } = editingId
      ? await supabase.rpc("atualizar_orcamento_galpao", {
          orcamento_id_input: editingId,
          cliente_id_input: Number(clienteId),
          modelo_id_input: Number(modeloId),
          vao_input: vao ? Number(vao) : null,
          comprimento_input: comprimento ? Number(comprimento) : null,
          pe_direito_input: peDireito ? Number(peDireito) : null,
          numero_vaos_input: numeroVaos ? Number(numeroVaos) : null,
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          margem_comercial_pct_input: margemNumerica,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
          observacao_interna_input: observacaoInterna.trim() || null,
          numero_galpoes_germinados_input: Math.max(0, Number(numeroGalpoesGerminados) || 0),
          area_laje_input: areaLaje ? Number(areaLaje) : null,
        })
      : await supabase.rpc("criar_orcamento_galpao", {
          cliente_id_input: Number(clienteId),
          modelo_id_input: Number(modeloId),
          vao_input: vao ? Number(vao) : null,
          comprimento_input: comprimento ? Number(comprimento) : null,
          pe_direito_input: peDireito ? Number(peDireito) : null,
          numero_vaos_input: numeroVaos ? Number(numeroVaos) : null,
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          margem_comercial_pct_input: margemNumerica,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
          observacao_interna_input: observacaoInterna.trim() || null,
          numero_galpoes_germinados_input: Math.max(0, Number(numeroGalpoesGerminados) || 0),
          area_laje_input: areaLaje ? Number(areaLaje) : null,
        });

    if (error) {
      setErro(
        (editingId ? "Erro ao atualizar orçamento: " : "Erro ao salvar orçamento: ") +
          error.message
      );
      setSalvando(false);
      return;
    }

    setMensagem(
      editingId ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso."
    );
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setSalvando(false);
    await carregarTudo();
  }

  async function handleConverter(orcamentoId) {
    const confirmar = window.confirm(
      "Converter este orçamento em venda? Essa ação não pode ser desfeita."
    );
    if (!confirmar) return;

    setConvertendoId(orcamentoId);
    setErro("");
    setMensagem("");

    const { error } = await supabase.rpc("converter_orcamento_em_venda_galpao", {
      orcamento_id_input: orcamentoId,
    });

    if (error) {
      setErro("Não foi possível converter em venda: " + error.message);
    } else {
      setMensagem("Orçamento convertido em venda com sucesso! Confira em Vendas.");
      await carregarTudo();
    }
    setConvertendoId(null);
  }

  const orcamentosFiltrados = orcamentos.filter((o) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      o.clientes?.nome?.toLowerCase().includes(termo) ||
      o.titulo?.toLowerCase().includes(termo) ||
      String(o.codigo).includes(termo)
    );
  });

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClasse = "block text-xs font-medium text-slate-600 mb-1";

  // ---------- TELA DE INCLUSÃO / EDIÇÃO ----------
  if (modo === "novo" || modo === "editar") {
    return (
      <div>
        <button
          type="button"
          onClick={voltar}
          className="mb-4 text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold mb-1">
          {modo === "editar" ? "Editar orçamento de galpão" : "Novo orçamento de galpão"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar" ? `Código #${editingCodigo}` : "Escolha o tipo, informe as medidas e monte o levantamento."}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {erro}
          </div>
        )}
        {mensagem && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">
            {mensagem}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClasse}>Cliente</label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className={campoClasse}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClasse}>Tipo de galpão</label>
              <select
                value={modeloId}
                onChange={(e) => setModeloId(e.target.value)}
                className={campoClasse}
              >
                <option value="">Selecione o tipo</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {modeloId && (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-3">
              <div>
                <label className={labelClasse}>Largura / vão (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={vao}
                  onChange={(e) => setVao(e.target.value)}
                  placeholder="Ex: 10"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Comprimento (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={comprimento}
                  onChange={(e) => setComprimento(e.target.value)}
                  placeholder="Ex: 20"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Pé direito (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={peDireito}
                  onChange={(e) => setPeDireito(e.target.value)}
                  placeholder="Ex: 7,5"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Nº de vãos (tesouras)</label>
                <input
                  type="number"
                  min="0"
                  value={numeroVaos}
                  onChange={(e) => setNumeroVaos(e.target.value)}
                  placeholder="Ex: 6"
                  className={campoClasse}
                />
              </div>
              <div>
                <label className={labelClasse}>Germinados a mais</label>
                <input
                  type="number"
                  min="0"
                  value={numeroGalpoesGerminados}
                  onChange={(e) => setNumeroGalpoesGerminados(e.target.value)}
                  placeholder="0 = avulso"
                  className={campoClasse}
                />
              </div>
            </div>
          )}

          {areaCalculada && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4 flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-emerald-700">Área coberta</p>
                <p className="text-lg font-semibold text-emerald-900">
                  {areaCalculada.toLocaleString("pt-BR")} m²
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">
                  {itensLaje.length > 0 ? "Valor/m² estrutura (sem laje)" : "Valor por m² (atual)"}
                </p>
                <p className="text-lg font-semibold text-emerald-900">
                  {valorPorM2 !== null ? formatarMoeda(valorPorM2) : "-"}
                </p>
              </div>
              {itensLaje.length > 0 && (
                <>
                  <div>
                    <p className="text-xs text-emerald-700">Área da laje/mezanino</p>
                    <p className="text-lg font-semibold text-emerald-900">
                      {areaLajeNumerica > 0 ? `${areaLajeNumerica.toLocaleString("pt-BR")} m²` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-700">Valor/m² da laje</p>
                    <p className="text-lg font-semibold text-emerald-900">
                      {valorPorM2Laje !== null ? formatarMoeda(valorPorM2Laje) : "-"}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {modeloId && (
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 mb-4">
              <p className="text-xs font-medium text-slate-600 mb-2">
                Tipo de telha — ao escolher, a telha entra na lista sozinha (área x 1,10). Calha e
                capote (fixos, abaixo) também recalculam sozinhos a partir das medidas e do nº de
                galpões germinados.
              </p>
              <select
                value={telhaId}
                onChange={(e) => setTelhaId(e.target.value)}
                className={campoClasse}
              >
                <option value="">Selecione o tipo de telha</option>
                {telhasDisponiveis.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} — {formatarMoeda(t.preco)}/m²
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-medium text-slate-600 mb-2">Adicionar peça</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
              <div className="sm:col-span-2">
                <select
                  value={composicaoParaAdicionar}
                  onChange={(e) => setComposicaoParaAdicionar(e.target.value)}
                  className={campoClasse}
                >
                  <option value="">Selecione uma peça</option>
                  {Object.entries(composicoesPorPapel).map(([papel, lista]) => (
                    <optgroup key={papel} label={papel}>
                      {lista.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {formatarMoeda(c.preco)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <input
                type="number"
                min="1"
                value={quantidadeParaAdicionar}
                onChange={(e) => setQuantidadeParaAdicionar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarItem();
                  }
                }}
                placeholder="Qtd."
                className={campoClasse}
              />
              <button
                type="button"
                onClick={adicionarItem}
                disabled={!composicaoParaAdicionar}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
              >
                Adicionar peça
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Pilares adicionados aqui atualizam a quantidade de dias de FUNDAÇÃO automaticamente
              (1 dia por pilar) — pode ajustar manualmente depois se precisar.
            </p>

            {tesourasComReferencia.length > 0 && (
              <div className="rounded-lg border border-slate-300 bg-white p-3 mb-3">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Calculadora: Tesoura de tamanho variado (proporcional a uma peça de referência)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <select
                    value={tesouraRefId}
                    onChange={(e) => setTesouraRefId(e.target.value)}
                    className={campoClasse}
                  >
                    <option value="">Tesoura de referência</option>
                    {tesourasComReferencia.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} ({formatarMoeda(Number(t.preco) / Number(t.comprimento_referencia))}/m)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Tamanho desejado (m)"
                    value={tesouraTamanho}
                    onChange={(e) => setTesouraTamanho(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantidade"
                    value={tesouraQtd}
                    onChange={(e) => setTesouraQtd(e.target.value)}
                    className={campoClasse}
                  />
                  <button
                    type="button"
                    onClick={adicionarTesouraProporcional}
                    className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    Adicionar tesoura
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Estimativa proporcional (preço da referência ÷ tamanho dela × tamanho desejado). Vale para
                  tamanhos próximos da referência — vãos muito maiores podem exigir seção estrutural diferente.
                </p>
              </div>
            )}

            {(tipoSelecionado === "laje" || tipoSelecionado === "mezanino") && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-3 mb-3">
                <p className="text-xs font-semibold text-emerald-800 mb-2">
                  Estrutura da laje/mezanino — seção separada, com subtotal e valor/m² próprios
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={tipoLajeId}
                    onChange={(e) => setTipoLajeId(e.target.value)}
                    className={campoClasse}
                  >
                    <option value="">Selecione o tipo de laje</option>
                    {lajesDisponiveis.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} — {formatarMoeda(l.preco)}/m²
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Área da laje (m²)"
                    value={areaLaje}
                    onChange={(e) => setAreaLaje(e.target.value)}
                    className={campoClasse}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1 mb-3">
                  Escolha o tipo (capacidade em Kg/m² no nome) e a área — a linha entra sozinha na seção
                  da laje. A viga (calculadora abaixo) e o pilar/montagem aqui também entram nessa seção.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                  <select
                    value={pilarLajeId}
                    onChange={(e) => setPilarLajeId(e.target.value)}
                    className={campoClasse + " sm:col-span-2"}
                  >
                    <option value="">Pilar da laje (quando necessário)</option>
                    {composicoes
                      .filter((c) => c.papel === "PILAR")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} — {formatarMoeda(p.preco)}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd."
                    value={pilarLajeQtd}
                    onChange={(e) => setPilarLajeQtd(e.target.value)}
                    className={campoClasse}
                  />
                  <button
                    type="button"
                    onClick={adicionarPilarLaje}
                    disabled={!pilarLajeId}
                    className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    Adicionar pilar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2 flex items-center text-xs text-slate-500">
                    Montagem da laje/mezanino (separada da montagem do galpão)
                  </div>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd. (VB)"
                    value={montagemLajeQtd}
                    onChange={(e) => setMontagemLajeQtd(e.target.value)}
                    className={campoClasse}
                  />
                  <button
                    type="button"
                    onClick={adicionarMontagemLaje}
                    disabled={!montagemLajeQtd}
                    className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    Adicionar montagem
                  </button>
                </div>
              </div>
            )}

            {(tipoSelecionado === "laje" || tipoSelecionado === "mezanino") && (
              <div className="rounded-lg border border-slate-300 bg-white p-3 mb-3">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Calculadora: Viga para laje — o volume (m³) × valor do m³ dá o preço de CADA viga;
                  ela entra no orçamento como peça (quantidade × preço por viga)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Largura (m)"
                    value={vigaLargura}
                    onChange={(e) => setVigaLargura(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Altura (m)"
                    value={vigaAltura}
                    onChange={(e) => setVigaAltura(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Vão (m)"
                    value={vigaVao}
                    onChange={(e) => setVigaVao(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor do m³"
                    value={vigaValorM3}
                    onChange={(e) => setVigaValorM3(e.target.value)}
                    className={campoClasse}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd. vigas"
                    value={vigaQtd}
                    onChange={(e) => setVigaQtd(e.target.value)}
                    className={campoClasse}
                  />
                  <button
                    type="button"
                    onClick={adicionarVigaLaje}
                    className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 transition"
                  >
                    Adicionar viga
                  </button>
                </div>
                {vigaLargura && vigaAltura && vigaVao && (
                  <p className="text-xs text-slate-500 mt-1">
                    Volume por viga:{" "}
                    {(Number(vigaLargura) * Number(vigaAltura) * Number(vigaVao)).toFixed(3)} m³
                    {Number(vigaValorM3) > 0 && (
                      <>
                        {" "}— Preço por viga:{" "}
                        {formatarMoeda(
                          Math.round(
                            Number(vigaLargura) * Number(vigaAltura) * Number(vigaVao) *
                              Number(vigaValorM3) * 100
                          ) / 100
                        )}
                        {Number(vigaQtd) > 1 &&
                          ` — ${vigaQtd} vigas: ${formatarMoeda(
                            (Math.round(
                              Number(vigaLargura) * Number(vigaAltura) * Number(vigaVao) *
                                Number(vigaValorM3) * 100
                            ) / 100) * Number(vigaQtd)
                          )}`}
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {itens.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma peça adicionada ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1 font-medium">Peça</th>
                    <th className="py-1 font-medium w-16">Un.</th>
                    <th className="py-1 font-medium w-24">Qtd.</th>
                    <th className="py-1 font-medium w-28">Valor unit.</th>
                    <th className="py-1 font-medium text-right">Total</th>
                    <th className="py-1 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {itensLaje.length > 0 && (
                    <tr>
                      <td colSpan={6} className="pt-2 pb-1 text-xs font-semibold text-slate-500 uppercase">
                        Estrutura do galpão
                      </td>
                    </tr>
                  )}
                  {itensEstruturaOrdenados.map((i) => (
                    <tr key={i.chave} className="border-t border-slate-200">
                      <td className="py-1.5 pr-2">
                        {i.nome}
                        {i.obrigatorio && (
                          <span className="ml-1 text-xs text-slate-400">(obrigatório)</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-500">{i.unidade || "-"}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={i.quantidade}
                          onChange={(e) =>
                            atualizarItem(i.chave, "quantidade", e.target.value)
                          }
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={i.preco_unitario}
                          onChange={(e) =>
                            atualizarItem(i.chave, "preco_unitario", e.target.value)
                          }
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatarMoeda(i.quantidade * i.preco_unitario)}
                      </td>
                      <td className="py-1.5 text-right">
                        {!i.obrigatorio && (
                          <button
                            type="button"
                            onClick={() => removerItem(i.chave)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {itensLaje.length > 0 && (
                    <>
                      <tr className="border-t border-slate-300">
                        <td colSpan={4} className="py-1 text-right text-xs font-medium text-slate-500">
                          Subtotal estrutura
                        </td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {formatarMoeda(subtotalEstrutura)}
                        </td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="py-1 text-right text-xs font-medium text-slate-500">
                          Com BDI ({margemNumerica}%)
                          {areaCalculada && valorPorM2 !== null
                            ? ` — ${formatarMoeda(valorPorM2)}/m² (÷ ${areaCalculada.toLocaleString("pt-BR")}m²)`
                            : ""}
                        </td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {formatarMoeda(subtotalEstrutura * fatorMargem)}
                        </td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="pt-3 pb-1 text-xs font-semibold text-emerald-700 uppercase">
                          Estrutura da laje/mezanino
                        </td>
                      </tr>
                      {itensLajeOrdenados.map((i) => (
                        <tr key={i.chave} className="border-t border-slate-200 bg-emerald-50/30">
                          <td className="py-1.5 pr-2">{i.nome}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{i.unidade || "-"}</td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={i.quantidade}
                              onChange={(e) =>
                                atualizarItem(i.chave, "quantidade", e.target.value)
                              }
                              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={i.preco_unitario}
                              onChange={(e) =>
                                atualizarItem(i.chave, "preco_unitario", e.target.value)
                              }
                              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="py-1.5 text-right whitespace-nowrap">
                            {formatarMoeda(i.quantidade * i.preco_unitario)}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removerItem(i.chave)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-300">
                        <td colSpan={4} className="py-1 text-right text-xs font-medium text-emerald-700">
                          Subtotal laje/mezanino
                        </td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {formatarMoeda(subtotalLaje)}
                        </td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="py-1 text-right text-xs font-medium text-emerald-700">
                          Com BDI ({margemNumerica}%)
                          {valorPorM2Laje !== null
                            ? ` — ${formatarMoeda(valorPorM2Laje)}/m² (÷ ${areaLajeNumerica.toLocaleString("pt-BR")}m²)`
                            : ""}
                        </td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {formatarMoeda(subtotalLaje * fatorMargem)}
                        </td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div>
              <label className={labelClasse}>Validade da proposta (dias)</label>
              <input
                type="number"
                min="1"
                value={diasValidade}
                onChange={(e) => setDiasValidade(e.target.value)}
                placeholder="Ex: 10"
                className={campoClasse}
              />
              {diasValidade && Number(diasValidade) > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Válido até {formatarDataSimples(calcularDataFutura(diasValidade))}
                </p>
              )}
            </div>
            <div>
              <label className={labelClasse}>Desconto (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                className={campoClasse}
              />
            </div>
            <div>
              <label className={labelClasse}>BDI (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={margemComercial}
                onChange={(e) => setMargemComercial(e.target.value)}
                placeholder="Ex: 25"
                className={campoClasse}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className={labelClasse}>Observações (aparece no PDF do cliente)</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Frete CIF, forma de pagamento..."
                className={campoClasse}
              />
            </div>
            <div>
              <label className={labelClasse}>Observação interna (só você vê, não vai pro PDF)</label>
              <input
                type="text"
                value={observacaoInterna}
                onChange={(e) => setObservacaoInterna(e.target.value)}
                placeholder="Ex: cliente pediu desconto extra, aguardando aprovação..."
                className={campoClasse}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm space-y-0.5">
              <p className="text-slate-500">Subtotal (peças): {formatarMoeda(subtotal)}</p>
              {margemNumerica > 0 && (
                <p className="text-slate-500">
                  Com BDI ({margemNumerica}%): {formatarMoeda(totalComMargem)}
                </p>
              )}
              {descontoNumerico > 0 && (
                <p className="text-slate-500">Desconto: − {formatarMoeda(descontoNumerico)}</p>
              )}
              <p>
                <span className="text-slate-500">Total do orçamento: </span>
                <span className="font-semibold text-lg">{formatarMoeda(totalFinal)}</span>
              </p>
              <p className="text-xs text-slate-400">Vendedor: {nomeUsuario}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={voltar}
                className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 transition"
              >
                {salvando
                  ? "Salvando..."
                  : modo === "editar"
                    ? "Salvar alterações"
                    : "Salvar orçamento"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ---------- TELA DE LISTAGEM ----------
  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium"
      >
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Orçamentos de Galpão</h1>
      <p className="text-slate-500 mb-6">
        Levantamentos de peças pré-moldadas para propostas de galpão.
      </p>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">
          {mensagem}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          placeholder="Pesquisar por cliente, título ou código..."
          className={campoClasse}
        />
        <button
          type="button"
          onClick={abrirNovo}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 whitespace-nowrap transition"
        >
          + Incluir orçamento
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Carregando orçamentos...</p>
        ) : orcamentos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Nenhum orçamento de galpão criado ainda. Clique em &quot;Incluir
            orçamento&quot; para montar o primeiro.
          </p>
        ) : orcamentosFiltrados.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nenhum orçamento encontrado para essa busca.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 font-medium">Válido até</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            {orcamentosFiltrados.map((o) => (
              <tbody key={o.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">{o.codigo}</td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {o.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate" title={o.titulo}>
                    {o.titulo || "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataSimples(o.validade)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(o.total)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <BadgeStatus status={estaVencido(o) ? "vencido" : o.status} />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setExpandidoId(expandidoId === o.id ? null : o.id)}
                        className="text-slate-600 hover:text-slate-900"
                        title={expandidoId === o.id ? "Ocultar itens" : "Ver itens"}
                      >
                        {expandidoId === o.id ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <Link
                        href={`/orcamentos-galpao/imprimir?codigo=${o.codigo}`}
                        target="_blank"
                        className="text-slate-600 hover:text-slate-900"
                        title="Imprimir"
                      >
                        <Printer size={16} />
                      </Link>
                      {o.status !== "aprovado" && !estaVencido(o) && (
                        <>
                          <button
                            onClick={() => abrirEdicao(o)}
                            className="text-emerald-700 hover:text-emerald-900"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleConverter(o.id)}
                            disabled={convertendoId === o.id}
                            className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                            title="Converter em venda"
                          >
                            <ShoppingCart size={16} />
                          </button>
                        </>
                      )}
                      {o.status !== "aprovado" && estaVencido(o) && (
                        <span className="text-xs text-slate-400" title="Vencido — crie um novo orçamento">
                          Vencido
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {expandidoId === o.id && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        {o.modelos_galpao?.nome || "Peças"}
                        {o.area_m2 ? ` — ${o.area_m2} m²` : ""}
                      </p>
                      {o.observacao_interna && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2 inline-block">
                          Nota interna: {o.observacao_interna}
                        </p>
                      )}
                      {(() => {
                        const todosItens = (o.itens_orcamento_galpao || []).map((item, idx) => ({
                          ...item,
                          chave: idx,
                          papel: item.composicoes_galpao?.papel || null,
                          nome: item.composicoes_galpao?.nome || item.descricao_livre || "",
                        }));
                        const daEstrutura = ordenarItensPorPapel(
                          todosItens.filter((item) => item.secao !== "laje"),
                          ORDEM_ESTRUTURA
                        );
                        const daLaje = ordenarItensPorPapel(
                          todosItens.filter((item) => item.secao === "laje"),
                          ORDEM_LAJE
                        );
                        const linhaItem = (item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.nome || "peça removida"} —{" "}
                            {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(item.quantidade * item.preco_unitario)}
                          </li>
                        );
                        if (daLaje.length === 0) {
                          return (
                            <ul className="text-xs text-slate-600 space-y-1">
                              {todosItens.map(linhaItem)}
                            </ul>
                          );
                        }
                        return (
                          <>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                              Estrutura do galpão
                            </p>
                            <ul className="text-xs text-slate-600 space-y-1 mb-2">
                              {daEstrutura.map(linhaItem)}
                            </ul>
                            <p className="text-xs font-semibold text-emerald-700 uppercase mb-1">
                              Estrutura da laje/mezanino
                              {o.area_laje ? ` — ${o.area_laje} m²` : ""}
                            </p>
                            <ul className="text-xs text-slate-600 space-y-1">
                              {daLaje.map(linhaItem)}
                            </ul>
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </div>
  );
}
