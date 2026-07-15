"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, Pencil, Printer, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import DesenhoGalpao from "./desenho-galpao";

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
  // Larguras dos galpões 2, 3, ... quando o geminado tem tamanhos
  // diferentes (o galpão 1 usa o campo principal "vao"/largura).
  const [largurasExtras, setLargurasExtras] = useState([]);
  const [telhaId, setTelhaId] = useState("");
  const [areaLaje, setAreaLaje] = useState("");
  const [tipoLajeId, setTipoLajeId] = useState("");
  const [pilarLajeId, setPilarLajeId] = useState("");
  const [pilarLajeQtd, setPilarLajeQtd] = useState("1");
  const [montagemLajeQtd, setMontagemLajeQtd] = useState("");
  const [diasValidade, setDiasValidade] = useState("");
  const [itens, setItens] = useState([]);
  const [composicaoParaAdicionar, setComposicaoParaAdicionar] = useState("");
  const [buscaPeca, setBuscaPeca] = useState("");
  const [perdaTelha, setPerdaTelha] = useState("10"); // % de perda da telha (editável)
  const [chaveRecente, setChaveRecente] = useState(null); // realce da linha recém-adicionada
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState(null);
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
  // GEMINADO: a largura lançada é a de CADA galpão. Galpões podem ter
  // larguras diferentes — o galpão 1 usa o campo principal e os demais
  // usam os campos extras (vazio = repete a largura do galpão 1).
  const totalGalpoes = Math.max(0, Number(numeroGalpoesGerminados) || 0) + 1;
  const listaLarguras =
    totalGalpoes > 1 && vao
      ? Array.from({ length: totalGalpoes }, (_, i) =>
          i === 0 ? Number(vao) : Number(largurasExtras[i - 1]) || Number(vao)
        )
      : null;
  const somaLarguras = listaLarguras
    ? listaLarguras.reduce((s, n) => s + n, 0)
    : Number(vao) || 0;
  const areaCalculada = vao && comprimento ? somaLarguras * Number(comprimento) : null;

  // Recalcula telha/calha/capote automaticamente, ao vivo, sempre que as
  // medidas, o nº de galpões germinados ou o tipo de telha mudam.
  useEffect(() => {
    if (!vao || !comprimento) return;
    // O campo é "quantos galpões germinados A MAIS" (0 = avulso, sem
    // germinação). +1 converte pro total de unidades físicas coladas.
    const germinados = Math.max(0, Number(numeroGalpoesGerminados) || 0) + 1;
    // GEMINADO: soma a largura de CADA galpão (podem ser diferentes;
    // campo extra vazio repete a largura do galpão 1).
    const somaL =
      germinados > 1
        ? Array.from({ length: germinados }, (_, i) =>
            i === 0 ? Number(vao) : Number(largurasExtras[i - 1]) || Number(vao)
          ).reduce((s, n) => s + n, 0)
        : Number(vao);
    const area = somaL * Number(comprimento);

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
        // % de perda editável (padrão 10%) — campo ao lado do tipo de telha
        const fatorPerda = 1 + Math.max(0, Number(perdaTelha) || 0) / 100;
        const qtdTelha = Math.round(area * fatorPerda * 100) / 100;
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
    largurasExtras,
    telhaId,
    perdaTelha,
    areaLaje,
    tipoLajeId,
    composicoes,
  ]);

  // Realce visual da última peça adicionada (some sozinho em 2,5s)
  const qtdItensAnterior = useRef(0);
  useEffect(() => {
    if (itens.length > qtdItensAnterior.current && itens.length > 0) {
      const maisRecente = itens.reduce((max, i) => (i.chave > max ? i.chave : max), -1);
      setChaveRecente(maisRecente);
      const t = setTimeout(() => setChaveRecente(null), 2500);
      qtdItensAnterior.current = itens.length;
      return () => clearTimeout(t);
    }
    qtdItensAnterior.current = itens.length;
  }, [itens]);

  // ---------- RASCUNHO AUTOMÁTICO (não perde orçamento com F5/queda) ----------
  const RASCUNHO_CHAVE = "rascunho-orcamento-galpao";
  useEffect(() => {
    if (modo === "lista") return;
    const temConteudo = clienteId || modeloId || vao || itens.length > 0;
    if (!temConteudo) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          RASCUNHO_CHAVE,
          JSON.stringify({
            quando: Date.now(),
            editingId,
            editingCodigo,
            clienteId, modeloId, vao, comprimento, peDireito, numeroVaos,
            numeroGalpoesGerminados, largurasExtras, telhaId, perdaTelha,
            areaLaje, tipoLajeId, diasValidade, desconto, margemComercial,
            observacao, observacaoInterna, itens,
          })
        );
      } catch (e) { /* armazenamento indisponível: segue sem rascunho */ }
    }, 800);
    return () => clearTimeout(t);
  }, [modo, clienteId, modeloId, vao, comprimento, peDireito, numeroVaos,
      numeroGalpoesGerminados, largurasExtras, telhaId, perdaTelha, areaLaje,
      tipoLajeId, diasValidade, desconto, margemComercial, observacao,
      observacaoInterna, itens, editingId, editingCodigo]);

  // Ao abrir a tela, verifica se ficou um rascunho não salvo
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(RASCUNHO_CHAVE);
      if (bruto) setRascunhoDisponivel(JSON.parse(bruto));
    } catch (e) { /* ignora rascunho corrompido */ }
  }, []);

  function limparRascunho() {
    try { window.localStorage.removeItem(RASCUNHO_CHAVE); } catch (e) { /* ok */ }
    setRascunhoDisponivel(null);
  }

  function restaurarRascunho() {
    const r = rascunhoDisponivel;
    if (!r) return;
    setEditingId(r.editingId || null);
    setEditingCodigo(r.editingCodigo || null);
    setClienteId(r.clienteId || "");
    setModeloId(r.modeloId || "");
    setVao(r.vao || "");
    setComprimento(r.comprimento || "");
    setPeDireito(r.peDireito || "");
    setNumeroVaos(r.numeroVaos || "");
    setNumeroGalpoesGerminados(r.numeroGalpoesGerminados || "0");
    setLargurasExtras(Array.isArray(r.largurasExtras) ? r.largurasExtras : []);
    setTelhaId(r.telhaId || "");
    setPerdaTelha(r.perdaTelha || "10");
    setAreaLaje(r.areaLaje || "");
    setTipoLajeId(r.tipoLajeId || "");
    setDiasValidade(r.diasValidade || "");
    setDesconto(r.desconto || "");
    setMargemComercial(r.margemComercial || "25");
    setObservacao(r.observacao || "");
    setObservacaoInterna(r.observacaoInterna || "");
    const itensRestaurados = Array.isArray(r.itens) ? r.itens : [];
    const maiorChave = itensRestaurados.reduce((m, i) => Math.max(m, i.chave || 0), 0);
    proximaChave.current = maiorChave + 1;
    setItens(itensRestaurados);
    setErro("");
    setMensagem("");
    setModo(r.editingId ? "editar" : "novo");
    setRascunhoDisponivel(null);
  }

  // Aviso do navegador ao tentar sair com o orçamento aberto e não salvo
  useEffect(() => {
    if (modo === "lista") return;
    const aviso = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [modo]);

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
  // Busca de peças: filtra o seletor pelo texto digitado, ignorando
  // maiúsculas e acentos ("terca" acha "TERÇA"). Vazio = lista completa.
  const normalizarTexto = (t) =>
    (t || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const composicoesPorPapelFiltrado = buscaPeca.trim()
    ? Object.fromEntries(
        Object.entries(composicoesPorPapel)
          .map(([papel, lista]) => [
            papel,
            lista.filter((c) => normalizarTexto(c.nome).includes(normalizarTexto(buscaPeca))),
          ])
          .filter(([, lista]) => lista.length > 0)
      )
    : composicoesPorPapel;
  const totalPecasSelecionaveis = composicoesSelecionaveis.length;
  const totalPecasEncontradas = Object.values(composicoesPorPapelFiltrado).reduce(
    (s, l) => s + l.length,
    0
  );
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

  // ---------- Sugestões automáticas pelas medidas ----------
  // Tesouras: (nº de vãos + 1) por galpão — uma em cada linha de
  // pilares, incluindo as duas empenas. Geminados com larguras
  // diferentes sugerem por grupo de largura (primeiro as tesouras do
  // galpão 1; depois de adicionar, sugere as do próximo galpão).
  function sugestaoTesoura() {
    const numVaos = Number(numeroVaos) || 0;
    if (numVaos <= 0 || !vao) return null;
    const larguras = listaLarguras || [Number(vao)];
    // Mantém a ordem dos galpões (1º, 2º, ...) — objeto puro reordenaria
    // as chaves numéricas e sugeriria o galpão errado primeiro.
    const ordem = [];
    const grupos = {};
    for (const l of larguras) {
      if (!(l in grupos)) ordem.push(l);
      grupos[l] = (grupos[l] || 0) + 1;
    }
    const lancadas = new Set(
      itens
        .filter((i) => i.papel === "TESOURA")
        .map((i) => {
          const m = (i.nome || "").match(/([\d.,]+)\s*M/i);
          return m ? parseFloat(m[1].replace(",", ".")) : null;
        })
        .filter((n) => n !== null)
    );
    for (const largura of ordem) {
      if (!lancadas.has(largura)) {
        return { tamanho: largura, qtd: (numVaos + 1) * grupos[largura] };
      }
    }
    return null;
  }

  // Pilares: (nº de vãos + 1) linhas x (nº de galpões + 1) fileiras —
  // 2 fileiras laterais no galpão solo; nos geminados, a divisa usa
  // UM pilar compartilhado entre os dois galpões.
  function sugestaoPilares() {
    const numVaos = Number(numeroVaos) || 0;
    if (numVaos <= 0) return null;
    return {
      linhas: numVaos + 1,
      fileiras: totalGalpoes + 1,
      qtd: (numVaos + 1) * (totalGalpoes + 1),
    };
  }

  // Terças por linha de vão: largura do galpão ÷ 1,6, arredondando para
  // cima e SEMPRE para número PAR (não existe terça aos pedaços nem
  // quantidade ímpar). Ex.: 10m ÷ 1,6 = 6,25 → 7 → 8.
  function qtdTercasPorLinhaDeVao(larguraGalpao) {
    const bruto = Math.ceil((Number(larguraGalpao) || 0) / 1.6);
    if (bruto <= 0) return 0;
    return bruto % 2 === 0 ? bruto : bruto + 1;
  }

  // Decompõe o comprimento em módulos de 5m e 6m (o galpão pode misturar
  // os dois). Usa o mínimo de vãos de 6m para fechar a metragem — ex.:
  // 31m = 5 vãos de 5m + 1 vão de 6m; 30m = 6 vãos de 5m; 32m = 4x5 + 2x6.
  function decomporComprimentoEmModulos(comprimentoTotal) {
    const c = Number(comprimentoTotal);
    if (!c || c <= 0) return null;
    const inteiro = Math.round(c);
    if (Math.abs(c - inteiro) > 0.001) return null; // comprimento quebrado: sem decomposição
    for (let vaos6 = 0; vaos6 * 6 <= inteiro; vaos6++) {
      const resto = inteiro - vaos6 * 6;
      if (resto % 5 === 0) return { vaos5: resto / 5, vaos6 };
    }
    return null;
  }

  // Sugestão de terças para a peça selecionada: identifica a medida da
  // terça pelo nome (5,00M / 6,00M), calcula quantas terças por vão
  // (somando os galpões geminados) e multiplica pelos vãos daquela
  // medida. Sem decomposição possível, usa o nº de vãos informado.
  function sugestaoTerca(comp) {
    if (!vao || !comprimento) return null;
    const larguras = listaLarguras || [Number(vao)];
    const porVao = larguras.map((l) => qtdTercasPorLinhaDeVao(l));
    const totalPorVao = porVao.reduce((s, n) => s + n, 0);
    if (totalPorVao <= 0) return null;

    const detalheLarguras =
      larguras.length === 1
        ? `${larguras[0]}m ÷ 1,6 → ${porVao[0]} por vão (sempre par)`
        : larguras.map((l, i) => `${l}m → ${porVao[i]}`).join(" + ") +
          ` = ${totalPorVao} por vão (sempre par)`;

    const medidaTxt = (comp?.nome || "").match(/(\d+(?:,\d+)?)\s*M\b/i)?.[1] || null;
    const medida = medidaTxt ? parseFloat(medidaTxt.replace(",", ".")) : null;
    const decomp = decomporComprimentoEmModulos(comprimento);

    if (decomp && (medida === 5 || medida === 6)) {
      const nVaosDaMedida = medida === 6 ? decomp.vaos6 : decomp.vaos5;
      const composicaoTexto =
        `${comprimento}m = ` +
        [
          decomp.vaos5 > 0 ? `${decomp.vaos5} × 5m` : null,
          decomp.vaos6 > 0 ? `${decomp.vaos6} × 6m` : null,
        ]
          .filter(Boolean)
          .join(" + ");
      if (nVaosDaMedida <= 0) {
        return {
          qtd: 0,
          texto: `${composicaoTexto} — esse comprimento fecha sem vãos de ${medida}m, então essa terça não seria necessária`,
        };
      }
      return {
        qtd: totalPorVao * nVaosDaMedida,
        texto: `${detalheLarguras} × ${nVaosDaMedida} vão(s) de ${medida}m (${composicaoTexto}) = ${totalPorVao * nVaosDaMedida}`,
      };
    }

    const nVaosInformado = Number(numeroVaos) || 0;
    if (nVaosInformado <= 0) return null;
    return {
      qtd: totalPorVao * nVaosInformado,
      texto: `${detalheLarguras} × ${nVaosInformado} vãos informados = ${totalPorVao * nVaosInformado}`,
    };
  }

  const pecaSelecionada = composicoes.find(
    (c) => String(c.id) === String(composicaoParaAdicionar)
  );
  const sugestaoPilarAtiva = pecaSelecionada?.papel === "PILAR" ? sugestaoPilares() : null;
  const sugestaoTercaAtiva =
    pecaSelecionada?.papel === "TERCA" ? sugestaoTerca(pecaSelecionada) : null;

  // ---------- Conferência de terças: o sistema não deixa esquecer ----------
  // Compara o que o galpão PRECISA (por medida: 5m e 6m, conforme a
  // decomposição do comprimento) com o que já foi LANÇADO no orçamento.
  const conferenciaTercas = (() => {
    if (!vao || !comprimento) return null;
    const decomp = decomporComprimentoEmModulos(comprimento);
    if (!decomp) return null;
    const larguras = listaLarguras || [Number(vao)];
    const totalPorVao = larguras.reduce((s, l) => s + qtdTercasPorLinhaDeVao(l), 0);
    if (totalPorVao <= 0) return null;
    const lancadas = { 5: 0, 6: 0 };
    itens.forEach((i) => {
      if (i.papel !== "TERCA") return;
      const m = (i.nome || "").match(/(\d+(?:,\d+)?)\s*M\b/i)?.[1];
      const medida = m ? Math.round(parseFloat(m.replace(",", "."))) : null;
      if (medida === 5 || medida === 6) lancadas[medida] += Number(i.quantidade) || 0;
    });
    const linhas = [];
    for (const medida of [5, 6]) {
      const vaosDaMedida = medida === 5 ? decomp.vaos5 : decomp.vaos6;
      if (vaosDaMedida <= 0) continue;
      linhas.push({
        medida,
        vaos: vaosDaMedida,
        necessarias: totalPorVao * vaosDaMedida,
        lancadas: lancadas[medida],
      });
    }
    if (linhas.length === 0) return null;
    const composicaoTexto =
      `${comprimento}m = ` +
      [
        decomp.vaos5 > 0 ? `${decomp.vaos5} × 5m` : null,
        decomp.vaos6 > 0 ? `${decomp.vaos6} × 6m` : null,
      ]
        .filter(Boolean)
        .join(" + ");
    return { composicaoTexto, totalPorVao, linhas };
  })();

  // ---------- Vigas da laje: sequência de módulos e sugestões ----------
  // Módulos na ordem física (os de 5m primeiro, os de 6m no final).
  function sequenciaModulos() {
    const d = decomporComprimentoEmModulos(comprimento);
    if (!d) return null;
    return [...Array(d.vaos5).fill(5), ...Array(d.vaos6).fill(6)];
  }

  // Quantas vigas de laje: uma em cada linha de pilares que a laje toca.
  // Laje parcial: profundidade = área da laje ÷ largura total do galpão.
  function sugestaoQtdVigasLaje() {
    if (!somaLarguras || !comprimento) return null;
    const prof =
      Number(areaLaje) > 0
        ? Math.min(Number(comprimento), Number(areaLaje) / somaLarguras)
        : Number(comprimento);
    const seq = sequenciaModulos();
    if (seq) {
      let acumulado = 0;
      let vaosCobertos = 0;
      for (const modulo of seq) {
        if (acumulado >= prof - 0.01) break;
        acumulado += modulo;
        vaosCobertos++;
      }
      return { qtd: vaosCobertos + 1, vaosCobertos, prof };
    }
    const nV = Number(numeroVaos) || 0;
    return nV > 0 ? { qtd: nV + 1, vaosCobertos: nV, prof } : null;
  }

  const temPilarNoMeioDaLaje = itens.some((i) => i.secao === "laje" && i.papel === "PILAR");

  const conferenciaVigasLaje = (() => {
    if (!tipoSelecionado || tipoSelecionado === "simples") return null;
    const s = sugestaoQtdVigasLaje();
    if (!s) return null;
    const lancadas = itens
      .filter((i) => i.papel === "VIGA_LAJE")
      .reduce((soma, i) => soma + (Number(i.quantidade) || 0), 0);
    return { ...s, lancadas };
  })();

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

  // Sugestão automática da viga da laje: largura sempre 0,25m; o vão
  // (comprimento da viga) = largura do galpão — ou METADE, se já houver
  // pilar de laje no meio; quantidade = linhas de pilar que a laje toca.
  // ALTURA: pré-dimensionamento consagrado usado junto à NBR 6118 para
  // viga biapoiada = vão ÷ 10, arredondado PARA CIMA no múltiplo de 5cm
  // (a própria NBR 6118 não fixa pré-dimensionamento; o projeto
  // estrutural final confirma). Tudo é só ponto de partida, editável.
  useEffect(() => {
    if (!tipoSelecionado || tipoSelecionado === "simples") return;
    if (!vao || !comprimento) return;
    if (vigaLargura || vigaAltura || vigaVao) return; // não mexe no que foi digitado
    const larguraGalpao1 = Number(vao) || 0;
    if (larguraGalpao1 <= 0) return;
    const pilarNoMeio = itens.some((i) => i.secao === "laje" && i.papel === "PILAR");
    const vaoDaViga = pilarNoMeio
      ? Math.round((larguraGalpao1 / 2) * 100) / 100
      : larguraGalpao1;
    // altura = vão/10, múltiplo de 5cm para cima (10m -> 1,00m; 5m -> 0,50m)
    const alturaViga = Math.round(Math.ceil(vaoDaViga / 10 / 0.05) * 0.05 * 100) / 100;
    setVigaLargura("0.25");
    setVigaAltura(String(alturaViga));
    setVigaVao(String(vaoDaViga));
    const s = sugestaoQtdVigasLaje();
    if (s?.qtd) setVigaQtd(String(s.qtd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoSelecionado, vao, comprimento, areaLaje, numeroVaos, itens]);

  // Campos decimais que aceitam vírgula: ",25" vira "0.25" na hora.
  const aoDigitarDecimal = (setter) => (e) => {
    let v = e.target.value.replace(",", ".");
    if (v.startsWith(".")) v = "0" + v;
    setter(v);
  };

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

  // ---------- Validação de coerência: nº de vãos x comprimento ----------
  const avisoVaos = (() => {
    const nV = Number(numeroVaos) || 0;
    if (!comprimento || nV <= 0) return null;
    const d = decomporComprimentoEmModulos(comprimento);
    if (!d) return null;
    const vaosPeloComprimento = d.vaos5 + d.vaos6;
    if (vaosPeloComprimento === nV) return null;
    const comp =
      [d.vaos5 > 0 ? `${d.vaos5} × 5m` : null, d.vaos6 > 0 ? `${d.vaos6} × 6m` : null]
        .filter(Boolean)
        .join(" + ");
    return `Pelo comprimento de ${comprimento}m, o galpão fecha com ${vaosPeloComprimento} vãos (${comp}) — você informou ${nV}. Confira antes de lançar as peças.`;
  })();

  // ---------- CHECKLIST UNIFICADO DA ESTRUTURA ----------
  // Cada linha compara o que o galpão PRECISA (pelas medidas) com o que
  // já foi LANÇADO. Tolerância de 0,5 para itens por metragem.
  const checklistEstrutura = (() => {
    if (!vao || !comprimento) return [];
    const nV = Number(numeroVaos) || 0;
    const G = totalGalpoes;
    const somaQtd = (filtro) =>
      itens.filter(filtro).reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const linhas = [];
    const fmtNum = (n) =>
      Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

    // Pilares da estrutura: (vãos+1) linhas x (galpões+1) fileiras
    if (nV > 0) {
      const nec = (nV + 1) * (G + 1);
      const lan = somaQtd((i) => i.papel === "PILAR" && i.secao !== "laje");
      linhas.push({
        rotulo: "Pilares",
        detalhe: `${nV + 1} linhas × ${G + 1} fileiras`,
        necessario: nec,
        lancado: lan,
        ok: lan >= nec,
        texto: `${fmtNum(lan)} de ${fmtNum(nec)}`,
      });
    }

    // Tesouras: (vãos+1) por galpão, separadas por largura quando diferentes
    if (nV > 0) {
      const larguras = listaLarguras || [Number(vao)];
      const ordem = [];
      const grupos = {};
      for (const l of larguras) {
        if (!(l in grupos)) ordem.push(l);
        grupos[l] = (grupos[l] || 0) + 1;
      }
      const lancPorTam = {};
      itens
        .filter((i) => i.papel === "TESOURA")
        .forEach((i) => {
          const m = (i.nome || "").match(/(\d+(?:[.,]\d+)?)\s*M\b/i)?.[1];
          const tam = m ? parseFloat(m.replace(",", ".")) : null;
          if (tam !== null) lancPorTam[tam] = (lancPorTam[tam] || 0) + (Number(i.quantidade) || 0);
        });
      for (const l of ordem) {
        const nec = (nV + 1) * grupos[l];
        const lan = lancPorTam[l] || 0;
        linhas.push({
          rotulo: ordem.length > 1 ? `Tesouras de ${fmtNum(l)}m` : "Tesouras",
          detalhe: `${nV + 1} por galpão × ${grupos[l]}`,
          necessario: nec,
          lancado: lan,
          ok: lan >= nec,
          texto: `${fmtNum(lan)} de ${fmtNum(nec)}`,
        });
      }
    }

    // Terças 5m/6m (reaproveita a conferência)
    if (conferenciaTercas) {
      for (const l of conferenciaTercas.linhas) {
        linhas.push({
          rotulo: `Terças de ${l.medida}m`,
          detalhe: `${conferenciaTercas.totalPorVao}/vão × ${l.vaos} vão(s)`,
          necessario: l.necessarias,
          lancado: l.lancadas,
          ok: l.lancadas >= l.necessarias,
          texto: `${fmtNum(l.lancadas)} de ${fmtNum(l.necessarias)}`,
        });
      }
    }

    // Telha: área total x (1 + perda%)
    if (areaCalculada) {
      const fatorPerda = 1 + Math.max(0, Number(perdaTelha) || 0) / 100;
      const nec = Math.round(areaCalculada * fatorPerda * 100) / 100;
      const lan = somaQtd((i) => i.papel === "TELHA");
      linhas.push({
        rotulo: "Telha (m²)",
        detalhe: `${fmtNum(areaCalculada)}m² × ${fatorPerda.toFixed(2).replace(".", ",")}`,
        necessario: nec,
        lancado: lan,
        ok: lan >= nec - 0.5,
        texto: `${fmtNum(lan)} de ${fmtNum(nec)}`,
      });
    }

    // Calha: (G+1) x comprimento + 0,5 x (G+1) x vãos — conta visível
    if (nV > 0) {
      const mult = G + 1;
      const nec =
        Math.round((mult * Number(comprimento) + 0.5 * mult * nV) * 100) / 100;
      const lan = somaQtd((i) => i.nome === "CALHA FIBRA");
      linhas.push({
        rotulo: "Calha (m)",
        detalhe: `${mult} × ${comprimento}m + 0,5 × ${mult} × ${nV}`,
        necessario: nec,
        lancado: lan,
        ok: Math.abs(lan - nec) <= 0.5 || lan >= nec,
        texto: `${fmtNum(lan)} de ${fmtNum(nec)}`,
      });
    }

    // Capote: (comprimento + 2) x galpões — conta visível
    {
      const nec = Math.round((Number(comprimento) + 2) * G * 100) / 100;
      const lan = somaQtd((i) => i.nome === "CAPOTE");
      linhas.push({
        rotulo: "Capote (m)",
        detalhe: `(${comprimento}m + 2) × ${G}`,
        necessario: nec,
        lancado: lan,
        ok: Math.abs(lan - nec) <= 0.5 || lan >= nec,
        texto: `${fmtNum(lan)} de ${fmtNum(nec)}`,
      });
    }

    // Fundação: 1 dia por pilar (estrutura + laje) — conta visível
    {
      const pilaresTotais = somaQtd((i) => i.papel === "PILAR");
      if (pilaresTotais > 0) {
        const lan = somaQtd((i) => i.nome === "FUNDAÇÃO");
        linhas.push({
          rotulo: "Fundação (dias)",
          detalhe: `1 dia × ${fmtNum(pilaresTotais)} pilares`,
          necessario: pilaresTotais,
          lancado: lan,
          ok: lan >= pilaresTotais,
          texto: `${fmtNum(lan)} de ${fmtNum(pilaresTotais)}`,
        });
      }
    }

    // Laje e vigas da laje (só quando o tipo tem laje/mezanino)
    if (tipoSelecionado && tipoSelecionado !== "simples") {
      if (areaLajeNumerica > 0) {
        const lan = somaQtd((i) => i.papel === "LAJE");
        linhas.push({
          rotulo: "Laje (m²)",
          detalhe: `área informada`,
          necessario: areaLajeNumerica,
          lancado: lan,
          ok: lan >= areaLajeNumerica - 0.5,
          texto: `${fmtNum(lan)} de ${fmtNum(areaLajeNumerica)}`,
        });
      }
      if (conferenciaVigasLaje) {
        linhas.push({
          rotulo: "Vigas da laje",
          detalhe: `linhas de pilar na laje`,
          necessario: conferenciaVigasLaje.qtd,
          lancado: conferenciaVigasLaje.lancadas,
          ok: conferenciaVigasLaje.lancadas >= conferenciaVigasLaje.qtd,
          texto: `${fmtNum(conferenciaVigasLaje.lancadas)} de ${fmtNum(conferenciaVigasLaje.qtd)}`,
        });
      }
      // Montagem da laje/mezanino (em VB): precisa estar lançada
      {
        const lanMontagem = somaQtd((i) => i.secao === "laje" && i.nome === "MONTAGEM");
        linhas.push({
          rotulo: "Montagem da laje",
          detalhe: "quantidade em VB",
          necessario: 1,
          lancado: lanMontagem,
          ok: lanMontagem > 0,
          texto: lanMontagem > 0 ? `${fmtNum(lanMontagem)} VB ✓` : "não lançada",
        });
      }
    }

    return linhas;
  })();
  const checklistCompleto =
    checklistEstrutura.length > 0 && checklistEstrutura.every((l) => l.ok);

  // Motivo que impede o salvar (botão inteligente)
  const motivoBloqueio = !clienteId
    ? "Escolha o cliente"
    : !modeloId
      ? "Escolha o tipo de galpão"
      : itens.filter((i) => i.quantidade > 0).length === 0
        ? "Adicione peças ao orçamento"
        : null;

  function limparFormulario() {
    setClienteId("");
    setModeloId("");
    setVao("");
    setComprimento("");
    setPeDireito("");
    setNumeroVaos("");
    setNumeroGalpoesGerminados("0");
    setLargurasExtras([]);
    setBuscaPeca("");
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
    setPerdaTelha("10");
    setChaveRecente(null);
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
    setLargurasExtras(
      Array.isArray(orcamento.larguras_galpoes) && orcamento.larguras_galpoes.length > 1
        ? orcamento.larguras_galpoes.slice(1).map((n) => String(n))
        : []
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
      // Itens livres (tesoura calculada, viga de laje) não têm peça do
      // catálogo — o papel volta deduzido pelo NOME, senão o checklist
      // acharia que eles não foram lançados ao editar o orçamento.
      papel:
        item.composicoes_galpao?.papel ||
        papelDoItem({ nome: item.composicoes_galpao?.nome || item.descricao_livre }) ||
        null,
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

  // Duplicar: carrega tudo do orçamento escolhido e salva como um NOVO
  // (serve até para orçamentos aprovados ou vencidos — cria variações
  // sem redigitar nada). Validade volta para 30 dias.
  function duplicarOrcamento(orcamento) {
    abrirEdicao(orcamento);
    setEditingId(null);
    setEditingCodigo(null);
    setDiasValidade("30");
    setMensagem(
      `Duplicando o orçamento Nº ${orcamento.codigo} — ajuste o que precisar e salve como um novo orçamento.`
    );
    setModo("novo");
  }

  function voltar() {
    limparRascunho();
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
          larguras_galpoes_input: listaLarguras,
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
          larguras_galpoes_input: listaLarguras,
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
    limparRascunho();
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

  // Cabeçalho numerado de cada etapa do orçamento
  const TituloEtapa = ({ numero, children }) => (
    <div className="flex items-center gap-2 mt-5 mb-3 pb-1.5 border-b border-slate-200">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold shrink-0">
        {numero}
      </span>
      <h3 className="text-sm font-semibold text-slate-700">{children}</h3>
    </div>
  );

  // Painel do checklist (usado no painel lateral e na versão mobile)
  const PainelChecklist = ({ compacto = false }) =>
    checklistEstrutura.length === 0 ? null : (
      <div
        className={`rounded-lg border ${
          checklistCompleto
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-300 bg-amber-50"
        } px-3 py-2 ${compacto ? "" : "mb-4"}`}
      >
        <p
          className={`text-xs font-semibold mb-1 ${
            checklistCompleto ? "text-emerald-800" : "text-amber-800"
          }`}
        >
          Checklist da estrutura {checklistCompleto ? "— completo ✓" : "— confira o que falta"}
        </p>
        <div className="space-y-0.5">
          {checklistEstrutura.map((l) => (
            <div
              key={l.rotulo}
              className={`flex items-baseline justify-between gap-2 text-xs ${
                l.ok ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              <span className="truncate">
                {l.ok ? "✓" : "⚠"} {l.rotulo}
                <span className="text-[10px] opacity-70"> ({l.detalhe})</span>
              </span>
              <span className="whitespace-nowrap font-medium">{l.texto}</span>
            </div>
          ))}
        </div>
      </div>
    );

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
          onKeyDown={(e) => {
            // ENTER nunca finaliza o orçamento por acidente: dentro de um
            // bloco de adicionar (peça, tesoura, laje...), Enter ADICIONA o
            // item daquele bloco; nos demais campos, não faz nada. Para
            // finalizar, só clicando no botão "Salvar orçamento" (ou Enter
            // com o próprio botão focado).
            if (e.key !== "Enter") return;
            const alvo = e.target;
            if (alvo.tagName === "TEXTAREA") return; // quebra de linha nas observações
            if (alvo.tagName === "BUTTON") return; // Enter em botão focado = clique nele
            e.preventDefault();
            const bloco = alvo.closest("[data-bloco]")?.getAttribute("data-bloco");
            if (bloco === "peca") adicionarItem();
            else if (bloco === "tesoura") adicionarTesouraProporcional();
            else if (bloco === "pilar-laje") adicionarPilarLaje();
            else if (bloco === "montagem-laje") adicionarMontagemLaje();
            else if (bloco === "viga-laje") adicionarVigaLaje();
          }}
          onFocusCapture={(e) => {
            // Ao clicar num campo numérico, o valor fica todo selecionado:
            // digitou, substituiu — sem número preso atrás do zero.
            const t = e.target;
            if (t.tagName === "INPUT" && (t.type === "number" || t.inputMode === "decimal")) {
              t.select();
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="lg:flex lg:gap-6">
          <div className="lg:flex-1 min-w-0">
          <TituloEtapa numero="1">Cliente e tipo de galpão</TituloEtapa>
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

          {modeloId && <TituloEtapa numero="2">Medidas do galpão</TituloEtapa>}
          {modeloId && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
              <div>
                <label className={labelClasse}>
                  {totalGalpoes > 1 ? "Largura galpão 1 (m)" : "Largura do galpão (m)"}
                </label>
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

          {modeloId && avisoVaos && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 mb-3">
              ⚠ {avisoVaos}
            </p>
          )}
          {modeloId && totalGalpoes > 1 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3">
              <p className="text-xs font-medium text-slate-600 mb-2">
                Largura dos demais galpões geminados (deixe em branco para repetir a largura do
                galpão 1) — a área e a telha somam todos os galpões.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: totalGalpoes - 1 }, (_, i) => (
                  <div key={i}>
                    <label className={labelClasse}>Largura galpão {i + 2} (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={largurasExtras[i] ?? ""}
                      onChange={(e) => {
                        const valor = e.target.value;
                        setLargurasExtras((atual) => {
                          const novo = [...atual];
                          novo[i] = valor;
                          return novo;
                        });
                      }}
                      placeholder={vao ? `${vao} (igual ao 1)` : "Ex: 7"}
                      className={campoClasse}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {areaCalculada && (
            <div className="lg:hidden rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-emerald-700">
                  Área coberta
                  {listaLarguras
                    ? ` (${listaLarguras.map((n) => n.toLocaleString("pt-BR")).join("m + ")}m x ${comprimento}m)`
                    : ""}
                </p>
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
              {peDireito && (
                <div className="ml-auto bg-white/70 rounded-lg border border-emerald-100 px-2 py-1">
                  <DesenhoGalpao
                    vao={vao}
                    comprimento={comprimento}
                    peDireito={peDireito}
                    galpoesGerminados={numeroGalpoesGerminados}
                    larguras={listaLarguras}
                    modulacao={
                      Number(numeroVaos) > 0 ? Number(comprimento) / Number(numeroVaos) : 5
                    }
                    temLaje={itens.some((i) => i.papel === "LAJE")}
                    temTravamento={itens.some((i) => i.papel === "VIGA_TRAVAMENTO")}
                    areaLaje={areaLaje}
                    largura={280}
                  />
                  <p className="text-center text-[10px] text-emerald-600">
                    Prévia — igual sairá no orçamento impresso
                  </p>
                </div>
              )}
            </div>
          )}

          {modeloId && (
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 mb-4">
              <TituloEtapa numero="3">Coberta</TituloEtapa>
              <p className="text-xs font-medium text-slate-600 mb-2">
                Tipo de telha — ao escolher, a telha entra na lista sozinha (área × perda ao
                lado). Calha e capote (fixos, abaixo) também recalculam sozinhos a partir das
                medidas e do nº de galpões germinados.
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
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Perda da telha (%):</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={perdaTelha}
                  onChange={(e) => setPerdaTelha(e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {areaCalculada && telhaId && (
                  <span className="text-xs text-slate-500">
                    → {areaCalculada.toLocaleString("pt-BR")}m² ×{" "}
                    {(1 + Math.max(0, Number(perdaTelha) || 0) / 100).toFixed(2).replace(".", ",")}{" "}
                    ={" "}
                    {(
                      Math.round(
                        areaCalculada * (1 + Math.max(0, Number(perdaTelha) || 0) / 100) * 100
                      ) / 100
                    ).toLocaleString("pt-BR")}
                    m² de telha
                  </span>
                )}
              </div>
            </div>
          )}

          <TituloEtapa numero="4">Estrutura — peças do galpão</TituloEtapa>
          <div className="lg:hidden">
            <PainelChecklist />
          </div>
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-medium text-slate-600 mb-2">Adicionar peça</p>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={buscaPeca}
                onChange={(e) => setBuscaPeca(e.target.value)}
                placeholder="🔍 Buscar peça... (ex: pilar, terça, 10x)"
                className={campoClasse + " sm:max-w-xs"}
              />
              {buscaPeca.trim() && (
                <>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {totalPecasEncontradas} de {totalPecasSelecionaveis} peças
                  </span>
                  <button
                    type="button"
                    onClick={() => setBuscaPeca("")}
                    className="text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded px-2 py-1"
                  >
                    Limpar
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3" data-bloco="peca">
              <div className="sm:col-span-2">
                <select
                  value={composicaoParaAdicionar}
                  onChange={(e) => {
                    const id = e.target.value;
                    setComposicaoParaAdicionar(id);
                    // Peça escolhida: limpa a busca para a próxima digitação
                    if (id) setBuscaPeca("");
                    // Sugestão automática: ao escolher um PILAR, a
                    // quantidade preenche sozinha pelas medidas
                    // (editável — é só um ponto de partida).
                    const comp = composicoes.find((c) => String(c.id) === String(id));
                    if (comp?.papel === "PILAR") {
                      const s = sugestaoPilares();
                      if (s) setQuantidadeParaAdicionar(String(s.qtd));
                    } else if (comp?.papel === "TERCA") {
                      const s = sugestaoTerca(comp);
                      if (s && s.qtd > 0) setQuantidadeParaAdicionar(String(s.qtd));
                    }
                  }}
                  className={campoClasse}
                >
                  <option value="">
                    {buscaPeca.trim() && totalPecasEncontradas === 0
                      ? "Nenhuma peça encontrada"
                      : "Selecione uma peça"}
                  </option>
                  {Object.entries(composicoesPorPapelFiltrado).map(([papel, lista]) => (
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
            {sugestaoPilarAtiva && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mb-2 inline-block">
                Sugestão automática: {sugestaoPilarAtiva.linhas} linhas ×{" "}
                {sugestaoPilarAtiva.fileiras} fileiras = {sugestaoPilarAtiva.qtd} pilares
                {totalGalpoes > 1 ? " (divisa dos geminados com pilar compartilhado)" : ""} —
                ajuste se precisar.
              </p>
            )}
            {sugestaoTercaAtiva && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mb-2 inline-block">
                Sugestão automática (terças): {sugestaoTercaAtiva.texto} — ajuste se precisar.
              </p>
            )}
            {conferenciaTercas && (
              <div
                className={`text-xs rounded px-2 py-1.5 mb-2 border ${
                  conferenciaTercas.linhas.every((l) => l.lancadas >= l.necessarias)
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-amber-800 bg-amber-50 border-amber-300"
                }`}
              >
                <span className="font-semibold">
                  Conferência de terças ({conferenciaTercas.composicaoTexto} ·{" "}
                  {conferenciaTercas.totalPorVao} por vão):
                </span>{" "}
                {conferenciaTercas.linhas.map((l, i) => (
                  <span key={l.medida}>
                    {i > 0 ? " | " : ""}
                    terças de {l.medida}m: {l.lancadas} de {l.necessarias} lançadas
                    {l.lancadas >= l.necessarias
                      ? " ✓"
                      : ` — faltam ${l.necessarias - l.lancadas} ⚠`}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mb-3">
              Pilares adicionados aqui atualizam a quantidade de dias de FUNDAÇÃO automaticamente
              (1 dia por pilar) — pode ajustar manualmente depois se precisar.
            </p>

            {tesourasComReferencia.length > 0 && (
              <div className="rounded-lg border border-slate-300 bg-white p-3 mb-3">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Calculadora: Tesoura de tamanho variado (proporcional a uma peça de referência)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2" data-bloco="tesoura">
                  <select
                    value={tesouraRefId}
                    onChange={(e) => {
                      setTesouraRefId(e.target.value);
                      // Sugestão automática: tamanho = largura do galpão
                      // e quantidade = (nº de vãos + 1) x galpões dessa
                      // largura. Geminados de larguras diferentes vão
                      // por etapa: depois de adicionar as tesouras do
                      // galpão 1, sugere as do galpão 2, e assim vai.
                      if (e.target.value) {
                        const s = sugestaoTesoura();
                        if (s) {
                          setTesouraTamanho(String(s.tamanho));
                          setTesouraQtd(String(s.qtd));
                        }
                      }
                    }}
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
                  Ao escolher a referência, o tamanho (largura do galpão) e a quantidade
                  ((nº de vãos + 1) por galpão) preenchem sozinhos — é só uma sugestão, ajuste à
                  vontade. Estimativa proporcional (preço da referência ÷ tamanho dela × tamanho
                  desejado); vale para tamanhos próximos da referência — vãos muito maiores podem
                  exigir seção estrutural diferente.
                </p>
              </div>
            )}

            {(tipoSelecionado === "laje" || tipoSelecionado === "mezanino") && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-3 mb-3">
                <TituloEtapa numero="5">Laje / Mezanino</TituloEtapa>
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2" data-bloco="pilar-laje">
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2" data-bloco="montagem-laje">
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
                {conferenciaVigasLaje && (
                  <div
                    className={`text-xs rounded px-2 py-1.5 mb-2 border ${
                      conferenciaVigasLaje.lancadas >= conferenciaVigasLaje.qtd
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-amber-800 bg-amber-50 border-amber-300"
                    }`}
                  >
                    <span className="font-semibold">Conferência de vigas da laje:</span>{" "}
                    {conferenciaVigasLaje.lancadas} de {conferenciaVigasLaje.qtd} lançadas
                    {conferenciaVigasLaje.lancadas >= conferenciaVigasLaje.qtd
                      ? " ✓"
                      : ` — faltam ${conferenciaVigasLaje.qtd - conferenciaVigasLaje.lancadas} ⚠`}{" "}
                    (uma viga por linha de pilar que a laje alcança)
                  </div>
                )}
                <p className="text-xs text-slate-400 mb-2">
                  Sugestão automática: largura fixa de 0,25m; vão (comprimento da viga) = largura
                  do galpão{temPilarNoMeioDaLaje ? " ÷ 2 (há pilar de laje no meio)" : ""} — com
                  pilar no meio, a viga vira metade e a altura recalcula. Altura = vão ÷ 10
                  arredondada ao múltiplo de 5cm (pré-dimensionamento de viga biapoiada usado com
                  a NBR 6118 — a norma em si não fixa pré-dimensionamento; o projeto estrutural
                  final confirma). Tudo editável.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2" data-bloco="viga-laje">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Largura (m)"
                    value={vigaLargura}
                    onChange={aoDigitarDecimal(setVigaLargura)}
                    className={campoClasse}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Altura (m)"
                    value={vigaAltura}
                    onChange={aoDigitarDecimal(setVigaAltura)}
                    className={campoClasse}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Vão (m)"
                    value={vigaVao}
                    onChange={aoDigitarDecimal(setVigaVao)}
                    className={campoClasse}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Valor do m³"
                    value={vigaValorM3}
                    onChange={aoDigitarDecimal(setVigaValorM3)}
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
                    <tr
                      key={i.chave}
                      className={`border-t border-slate-200 transition-colors duration-700 ${
                        i.chave === chaveRecente ? "bg-emerald-100" : ""
                      }`}
                    >
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
                        <tr
                          key={i.chave}
                          className={`border-t border-slate-200 transition-colors duration-700 ${
                            i.chave === chaveRecente ? "bg-emerald-100" : "bg-emerald-50/30"
                          }`}
                        >
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

          {/* Barra fixa: total sempre à vista enquanto rola */}
          {itens.length > 0 && (
            <div className="sticky bottom-0 z-10 -mx-5 px-5 py-2 bg-white/95 backdrop-blur border-t border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="text-slate-500">
                Total: <b className="text-slate-800 text-base">{formatarMoeda(totalFinal)}</b>
              </span>
              {areaCalculada && (
                <span className="text-slate-500">
                  Área: <b className="text-slate-700">{areaCalculada.toLocaleString("pt-BR")} m²</b>
                </span>
              )}
              {valorPorM2 !== null && (
                <span className="text-slate-500">
                  <b className="text-slate-700">{formatarMoeda(valorPorM2)}</b>/m²
                </span>
              )}
              {checklistEstrutura.length > 0 && (
                <span className={checklistCompleto ? "text-emerald-700" : "text-amber-700"}>
                  {checklistCompleto ? "Checklist ✓" : "Checklist ⚠ pendências"}
                </span>
              )}
            </div>
          )}

          <TituloEtapa numero="6">Condições e finalização</TituloEtapa>
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
                disabled={salvando || !!motivoBloqueio}
                title={motivoBloqueio || ""}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 transition"
              >
                {salvando
                  ? "Salvando..."
                  : motivoBloqueio
                    ? motivoBloqueio
                    : modo === "editar"
                      ? "Salvar alterações"
                      : "Salvar orçamento"}
              </button>
            </div>
          </div>
          </div>
          {/* ---------- PAINEL LATERAL FIXO (telas grandes) ---------- */}
          <aside className="hidden lg:block lg:w-[330px] shrink-0">
            <div className="sticky top-4 space-y-3">
              {vao && comprimento && peDireito ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                  <DesenhoGalpao
                    vao={vao}
                    comprimento={comprimento}
                    peDireito={peDireito}
                    galpoesGerminados={numeroGalpoesGerminados}
                    larguras={listaLarguras}
                    modulacao={
                      Number(numeroVaos) > 0 ? Number(comprimento) / Number(numeroVaos) : 5
                    }
                    temLaje={itens.some((i) => i.papel === "LAJE")}
                    temTravamento={itens.some((i) => i.papel === "VIGA_TRAVAMENTO")}
                    areaLaje={areaLaje}
                    largura={300}
                  />
                  <p className="text-[10px] text-slate-500">
                    Prévia — igual sairá no orçamento impresso
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                  Preencha as medidas para ver a prévia do galpão aqui.
                </div>
              )}
              {areaCalculada && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Área coberta</span>
                    <b>{areaCalculada.toLocaleString("pt-BR")} m²</b>
                  </div>
                  {valorPorM2 !== null && (
                    <div className="flex justify-between">
                      <span>Valor/m² estrutura</span>
                      <b>{formatarMoeda(valorPorM2)}</b>
                    </div>
                  )}
                  {valorPorM2Laje !== null && (
                    <div className="flex justify-between">
                      <span>Valor/m² laje</span>
                      <b>{formatarMoeda(valorPorM2Laje)}</b>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-200 pt-0.5 mt-0.5">
                    <span>Total do orçamento</span>
                    <b>{formatarMoeda(totalFinal)}</b>
                  </div>
                </div>
              )}
              <PainelChecklist compacto />
            </div>
          </aside>
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
      {rascunhoDisponivel && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <span>
            Há um orçamento <b>não salvo</b> de{" "}
            {new Date(rascunhoDisponivel.quando).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
            {rascunhoDisponivel.editingCodigo
              ? ` (edição do orçamento Nº ${rascunhoDisponivel.editingCodigo})`
              : ""}
            . Deseja continuar de onde parou?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restaurarRascunho}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
            >
              Continuar rascunho
            </button>
            <button
              type="button"
              onClick={limparRascunho}
              className="rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100 text-xs font-semibold px-3 py-1.5"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

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
                      <button
                        onClick={() => duplicarOrcamento(o)}
                        className="text-slate-600 hover:text-slate-900"
                        title="Duplicar (cria um novo a partir deste)"
                      >
                        <Copy size={16} />
                      </button>
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
