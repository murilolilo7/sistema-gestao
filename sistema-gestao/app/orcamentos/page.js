"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Eye, EyeOff, FileText, Pencil, Printer, ShoppingCart, Loader2, MessageCircle, XCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar, LinhasEsqueleto, EstadoVazio, usePaginacao, ControlePaginacao } from "@/components/Ui";
import { QuadroPecas } from "@/components/DesenhoPecas";

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

// "validade" é um date puro (sem hora). Acrescentar T00:00:00 evita que o
// fuso horário local jogue a data exibida um dia para trás.
function formatarDataSimples(valor) {
  if (!valor) return "-";
  return new Date(valor + "T00:00:00").toLocaleDateString("pt-BR");
}

// Calcula a data (YYYY-MM-DD) daqui a N dias, a partir de hoje.
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

// Caminho inverso: quantos dias faltam, a partir de hoje, para uma data
// já salva (usado ao abrir um orçamento existente para edição).
function diasAPartirDeHoje(dataISO) {
  if (!dataISO) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataISO + "T00:00:00");
  const diffDias = Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? String(diffDias) : "";
}

// Um orçamento pendente cuja validade já passou continua existindo e
// pode ser editado ou convertido normalmente — nada é apagado. Isso só
// controla o que aparece no badge de status, pra avisar visualmente.
function estaVencido(orcamento) {
  if (orcamento.status === "aprovado" || orcamento.status === "recusado" || !orcamento.validade)
    return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(orcamento.validade + "T00:00:00");
  return validade < hoje;
}

// Monta o link do WhatsApp com a mensagem de cobrança pronta.
// Retorna null se o cliente não tiver telefone.
function linkFollowUpWhatsApp(orcamento) {
  const tel = (orcamento.clientes?.telefone || "").replace(/\D/g, "");
  if (tel.length < 10) return null;
  const nome = orcamento.clientes?.nome || "";
  const valor = Number(orcamento.total || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const dataValidade = orcamento.validade
    ? new Date(orcamento.validade + "T00:00:00").toLocaleDateString("pt-BR")
    : null;
  const msg = estaVencido(orcamento)
    ? `Olá, ${nome}! Sobre o orçamento Nº ${orcamento.codigo} da MR7 Pré-Moldados (${valor}): ele venceu em ${dataValidade}. Quer que a gente atualize os valores para dar andamento?`
    : `Olá, ${nome}! Sobre o orçamento Nº ${orcamento.codigo} da MR7 Pré-Moldados (${valor})${dataValidade ? `, válido até ${dataValidade}` : ""} — podemos dar andamento?`;
  return `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
}

function BadgeStatus({ status }) {
  const estilos = {
    pendente: "bg-amber-50 text-amber-700 border-amber-200",
    vencido: "bg-rose-50 text-rose-700 border-rose-200",
    aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    recusado: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const rotulos = {
    pendente: "Pendente",
    vencido: "Vencido",
    aprovado: "Aprovado",
    recusado: "Perdido",
  };
  const classe =
    estilos[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}
    >
      {rotulos[status] || status || "-"}
    </span>
  );
}

function OrcamentosPageInterno() {
  const [modo, setModo] = useState("lista"); // 'lista' | 'novo' | 'editar'
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [convertendoId, setConvertendoId] = useState(null);
  const [perdidoAlvo, setPerdidoAlvo] = useState(null); // orçamento no modal "marcar como perdido"
  const [perdidoMotivo, setPerdidoMotivo] = useState("sem retorno do cliente");
  const [perdidoDetalhe, setPerdidoDetalhe] = useState("");
  const [perdidoSalvando, setPerdidoSalvando] = useState(false);
  const [expandidoId, setExpandidoId] = useState(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingCodigo, setEditingCodigo] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState("");

  const [clienteId, setClienteId] = useState("");
  // Cadastro rapido de cliente, sem sair do orcamento: so nome e telefone.
  // O cadastro completo (endereco, CPF/CNPJ) segue na tela de Clientes.
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [diasValidade, setDiasValidade] = useState("");
  const [itens, setItens] = useState([]);
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState("");
  const [quantidadeParaAdicionar, setQuantidadeParaAdicionar] = useState("1");
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState(null);
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [distanciaKm, setDistanciaKm] = useState("");
  const [valorFrete, setValorFrete] = useState("");
  const [calculandoFrete, setCalculandoFrete] = useState(false);
  const [freteConfig, setFreteConfig] = useState(null);
  const [unidade, setUnidade] = useState("matriz");
  const [viagens, setViagens] = useState("1");

  // Parâmetros do frete definidos em Configurações (raio, fixo, R$/km)
  useEffect(() => {
    let ativo = true;
    supabase
      .from("configuracao_empresa")
      .select("frete_raio_km, frete_valor_fixo, frete_valor_km, matriz_lat, matriz_lon, filial_nome_empresa, filial_cidade_uf, filial_lat, filial_lon")
      .limit(1)
      .then(({ data }) => {
        if (ativo && data && data[0]) setFreteConfig(data[0]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Ponto de partida do frete conforme a unidade escolhida
  function origemDaUnidade() {
    if (unidade === "filial") {
      return {
        lat: Number(freteConfig?.filial_lat ?? -10.803975),
        lon: Number(freteConfig?.filial_lon ?? -36.932065),
      };
    }
    return {
      lat: Number(freteConfig?.matriz_lat ?? -9.897),
      lon: Number(freteConfig?.matriz_lon ?? -36.679),
    };
  }

  function aplicarRegraFrete(km, viagensOverride) {
    // O frete calculado vale por VIAGEM: multiplica pelo número de viagens
    // necessárias para entregar todo o material.
    const nViagens = Math.max(1, Number(viagensOverride ?? viagens) || 1);
    const raio = Number(freteConfig?.frete_raio_km ?? 10);
    const fixo = Number(freteConfig?.frete_valor_fixo ?? 100);
    const porKm = Number(freteConfig?.frete_valor_km ?? 9);
    if (!km || km <= 0) return 0;
    if (km <= raio) return Math.round(fixo * nViagens * 100) / 100;
    return Math.round(porKm * km * 2 * nViagens * 100) / 100;
  }

  // Busca o endereço (OpenStreetMap) e a distância de carro (OSRM) — serviços gratuitos.
  async function calcularFrete() {
    const endereco = enderecoEntrega.trim();
    if (!endereco) {
      notificar("Digite o endereço de entrega primeiro.", "erro");
      return;
    }
    setCalculandoFrete(true);
    const origem = origemDaUnidade();
    try {
      const ufPadrao = unidade === "filial" ? ", Sergipe, Brasil" : ", Alagoas, Brasil";
      const busca = /alagoas|sergipe|\bal\b|\bse\b/i.test(endereco) ? endereco : endereco + ufPadrao;
      const geo = await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
          encodeURIComponent(busca)
      ).then((r) => r.json());
      if (!geo || !geo[0]) {
        notificar("Endereço não encontrado no mapa. Digite os km manualmente.", "erro");
        setCalculandoFrete(false);
        return;
      }
      const destino = { lat: Number(geo[0].lat), lon: Number(geo[0].lon) };
      const rota = await fetch(
        "https://router.project-osrm.org/route/v1/driving/" +
          origem.lon + "," + origem.lat + ";" +
          destino.lon + "," + destino.lat + "?overview=false"
      ).then((r) => r.json());
      const metros = rota && rota.routes && rota.routes[0] ? rota.routes[0].distance : null;
      if (!metros) {
        notificar("Não foi possível calcular a rota. Digite os km manualmente.", "erro");
        setCalculandoFrete(false);
        return;
      }
      const km = Math.round((metros / 1000) * 10) / 10;
      setDistanciaKm(String(km));
      setValorFrete(String(aplicarRegraFrete(km)));
      notificar("Distância: " + km + " km — frete calculado.");
    } catch (e) {
      notificar("Serviço de mapas indisponível agora. Digite os km manualmente.", "erro");
    }
    setCalculandoFrete(false);
  }

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
  function buscarProdutos() {
    return supabase
      .from("produtos")
      .select("id, nome, unidade, preco, quantidade_estoque, molde, comprimento_cm, largura_cm, altura_cm")
      .order("nome");
  }
  function buscarOrcamentos() {
    return supabase
      .from("orcamentos")
      .select(
        "*, clientes(nome, telefone), itens_orcamento(id, produto_id, quantidade, preco_unitario, produtos(nome))"
      )
      .order("codigo", { ascending: false });
  }

  function aplicarResultados(resClientes, resProdutos, resOrcamentos) {
    const erroEncontrado =
      resClientes.error || resProdutos.error || resOrcamentos.error;
    if (erroEncontrado) {
      setErro(
        "Não foi possível carregar os dados: " + erroEncontrado.message
      );
    } else {
      setClientes(resClientes.data);
      setProdutos(resProdutos.data);
      setOrcamentos(resOrcamentos.data);
    }
    setLoading(false);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    const [resClientes, resProdutos, resOrcamentos] = await Promise.all([
      buscarClientes(),
      buscarProdutos(),
      buscarOrcamentos(),
    ]);
    aplicarResultados(resClientes, resProdutos, resOrcamentos);
  }

  // Só aplica os resultados dentro do .then (fora da fase síncrona do
  // efeito), evitando o aviso do React sobre setState síncrono em efeito.
  useEffect(() => {
    let ativo = true;
    Promise.all([buscarClientes(), buscarProdutos(), buscarOrcamentos()]).then(
      ([resClientes, resProdutos, resOrcamentos]) => {
        if (ativo) aplicarResultados(resClientes, resProdutos, resOrcamentos);
      }
    );
    return () => {
      ativo = false;
    };
  }, []);

  // Abre direto um orçamento quando a URL trouxer ?editar=CODIGO
  // (ex: clique no aviso "vencendo" do painel inicial). Roda uma vez,
  // assim que a lista de orçamentos estiver carregada.
  const searchParams = useSearchParams();
  const [abriuPelaUrl, setAbriuPelaUrl] = useState(false);
  useEffect(() => {
    if (abriuPelaUrl || loading) return;
    const codigo = searchParams.get("editar");
    if (!codigo) return;
    const alvo = orcamentos.find((o) => String(o.codigo) === String(codigo));
    if (alvo) {
      abrirEdicao(alvo);
      setAbriuPelaUrl(true);
    }
  }, [loading, orcamentos, searchParams, abriuPelaUrl]);

  // ---------- RASCUNHO AUTOMÁTICO (não perde orçamento com F5/queda) ----------
  const RASCUNHO_CHAVE = "rascunho-orcamento-produtos";
  useEffect(() => {
    // Rascunho automático só ao CRIAR um novo orçamento (não ao editar
    // um existente, que já está salvo no banco).
    if (modo !== "novo") return;
    const temConteudo = clienteId || itens.length > 0;
    if (!temConteudo) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          RASCUNHO_CHAVE,
          JSON.stringify({
            quando: Date.now(),
            editingId,
            editingCodigo,
            clienteId,
            diasValidade,
            desconto,
            observacao,
            unidade,
            viagens,
            enderecoEntrega,
            distanciaKm,
            valorFrete,
            itens,
          })
        );
      } catch (e) { /* armazenamento indisponível: segue sem rascunho */ }
    }, 800);
    return () => clearTimeout(t);
  }, [modo, clienteId, diasValidade, desconto, observacao, itens, editingId, editingCodigo]);

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
    setDiasValidade(r.diasValidade || "");
    setDesconto(r.desconto || "");
    setObservacao(r.observacao || "");
    setEnderecoEntrega(r.enderecoEntrega || "");
    setUnidade(r.unidade || "matriz");
    setViagens(r.viagens || "1");
    setDistanciaKm(r.distanciaKm || "");
    setValorFrete(r.valorFrete || "");
    setItens(Array.isArray(r.itens) ? r.itens : []);
    setErro("");
    setMensagem("");
    setModo(r.editingId ? "editar" : "novo");
    setRascunhoDisponivel(null);
  }

  // Aviso do navegador ao tentar sair criando um novo orçamento
  useEffect(() => {
    if (modo !== "novo") return;
    const aviso = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [modo]);

  function adicionarItem() {
    if (!produtoParaAdicionar) return;
    const produto = produtos.find(
      (p) => String(p.id) === String(produtoParaAdicionar)
    );
    if (!produto) return;
    const quantidade = Math.max(1, Number(quantidadeParaAdicionar) || 1);

    setItens((atual) => {
      const existe = atual.find((i) => i.produto_id === produto.id);
      if (existe) {
        return atual.map((i) =>
          i.produto_id === produto.id
            ? { ...i, quantidade: i.quantidade + quantidade }
            : i
        );
      }
      return [
        ...atual,
        {
          produto_id: produto.id,
          nome: produto.nome,
          unidade: produto.unidade,
          quantidade,
          preco_unitario: produto.preco ?? 0,
        },
      ];
    });
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setBuscaProduto("");
  }

  function removerItem(produtoId) {
    setItens((atual) => atual.filter((i) => i.produto_id !== produtoId));
  }

  function atualizarItem(produtoId, campo, valor) {
    setItens((atual) =>
      atual.map((i) =>
        i.produto_id === produtoId
          ? { ...i, [campo]: Math.max(0, Number(valor) || 0) }
          : i
      )
    );
  }

  function estoqueDoProduto(produtoId) {
    return produtos.find((p) => p.id === produtoId)?.quantidade_estoque ?? 0;
  }

  const subtotalOrcamento = itens.reduce(
    (soma, i) => soma + i.quantidade * i.preco_unitario,
    0
  );
  const descontoNumerico = Math.min(
    Math.max(0, Number(desconto) || 0),
    subtotalOrcamento
  );
  const totalComDesconto = subtotalOrcamento - descontoNumerico;
  const valorFreteNumerico = Math.max(0, Number(valorFrete) || 0);
  const totalFinalOrcamento = totalComDesconto + valorFreteNumerico;

  // Peças com desenho técnico presentes no orçamento (sem repetir)
  const pecasDoOrcamento = [];
  itens.forEach((i) => {
    const p = produtos.find((x) => x.id === i.produto_id);
    if (p && p.molde && !pecasDoOrcamento.some((x) => x.id === p.id)) {
      pecasDoOrcamento.push({
        id: p.id,
        nome: p.nome,
        molde: p.molde,
        comprimento: p.comprimento_cm,
        largura: p.largura_cm,
        altura: p.altura_cm,
      });
    }
  });

  async function salvarNovoCliente() {
    const nome = novoClienteNome.trim();
    if (!nome) return;
    setSalvandoCliente(true);
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nome, telefone: novoClienteTelefone.trim() || null })
      .select("id, nome")
      .single();
    setSalvandoCliente(false);
    if (error) {
      setErro("Erro ao cadastrar cliente: " + error.message);
      return;
    }
    // Entra na lista, ja selecionado, sem perder nada do orcamento.
    setClientes((atual) =>
      [...atual, data].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
    );
    setClienteId(String(data.id));
    setNovoClienteNome("");
    setNovoClienteTelefone("");
    setNovoClienteAberto(false);
    setMensagem("Cliente cadastrado.");
  }

  function limparFormulario() {
    setClienteId("");
    setDiasValidade("");
    setItens([]);
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setDesconto("");
    setObservacao("");
    setEnderecoEntrega("");
    setUnidade("matriz");
    setViagens("1");
    setDistanciaKm("");
    setValorFrete("");
  }

  function abrirNovo() {
    limparFormulario();
    setEditingId(null);
    setEditingCodigo(null);
    setErro("");
    setMensagem("");
    setModo("novo");
  }

  function abrirEdicao(orcamento) {
    setEditingId(orcamento.id);
    setEditingCodigo(orcamento.codigo);
    setClienteId(String(orcamento.cliente_id));
    setDiasValidade(diasAPartirDeHoje(orcamento.validade));
    setDesconto(orcamento.desconto ? String(orcamento.desconto) : "");
    setObservacao(orcamento.observacao || "");
    setUnidade(orcamento.unidade || "matriz");
    setViagens(orcamento.viagens ? String(orcamento.viagens) : "1");
    setEnderecoEntrega(orcamento.endereco_entrega || "");
    setDistanciaKm(orcamento.distancia_km != null ? String(orcamento.distancia_km) : "");
    setValorFrete(orcamento.valor_frete != null && Number(orcamento.valor_frete) > 0 ? String(orcamento.valor_frete) : "");
    setItens(
      (orcamento.itens_orcamento || []).map((item) => ({
        produto_id: item.produto_id,
        nome: item.produtos?.nome || "Produto removido",
        quantidade: item.quantidade,
        preco_unitario: Number(item.preco_unitario),
      }))
    );
    setProdutoParaAdicionar("");
    setQuantidadeParaAdicionar("1");
    setErro("");
    setMensagem("");
    setModo("editar");
  }

  function voltar() {
    limparRascunho();
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setErro("");
  }

  // Duplicar: carrega tudo do orçamento escolhido e salva como um NOVO
  // (vale até para aprovados e vencidos). Validade volta para 30 dias.
  function duplicarOrcamento(orcamento) {
    abrirEdicao(orcamento);
    setEditingId(null);
    setEditingCodigo(null);
    setDiasValidade("30");
    setModo("novo");
    notificar(`Duplicando o orçamento Nº ${orcamento.codigo} — ajuste e salve como novo.`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }
    const itensValidos = itens.filter((i) => i.quantidade > 0);
    if (itensValidos.length === 0) {
      setErro("Adicione ao menos um produto com quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    setMensagem("");

    const itensPayload = itensValidos.map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }));
    const validadeCalculada = calcularDataFutura(diasValidade) || null;

    const { error } = editingId
      ? await supabase.rpc("atualizar_orcamento", {
          orcamento_id_input: editingId,
          cliente_id_input: Number(clienteId),
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
          endereco_entrega_input: enderecoEntrega.trim() || null,
          distancia_km_input: distanciaKm === "" ? null : Number(distanciaKm),
          valor_frete_input: valorFreteNumerico,
          unidade_input: unidade,
          viagens_input: Math.max(1, Number(viagens) || 1),
        })
      : await supabase.rpc("criar_orcamento", {
          cliente_id_input: Number(clienteId),
          validade_input: validadeCalculada,
          itens_input: itensPayload,
          desconto_input: descontoNumerico,
          observacao_input: observacao.trim() || null,
          vendedor_input: nomeUsuario || null,
          endereco_entrega_input: enderecoEntrega.trim() || null,
          distancia_km_input: distanciaKm === "" ? null : Number(distanciaKm),
          valor_frete_input: valorFreteNumerico,
          unidade_input: unidade,
          viagens_input: Math.max(1, Number(viagens) || 1),
        });

    if (error) {
      setErro(
        (editingId
          ? "Erro ao atualizar orçamento: "
          : "Erro ao salvar orçamento: ") + error.message
      );
      setSalvando(false);
      return;
    }

    notificar(editingId ? "Orçamento atualizado com sucesso." : "Orçamento criado com sucesso.");
    limparRascunho();
    setModo("lista");
    setEditingId(null);
    setEditingCodigo(null);
    limparFormulario();
    setSalvando(false);
    await carregarTudo();
  }

  // ---------- Marcar como perdido / reabrir ----------
  function abrirPerdido(orcamento) {
    setPerdidoAlvo(orcamento);
    setPerdidoMotivo("sem retorno do cliente");
    setPerdidoDetalhe("");
  }

  async function confirmarPerdido() {
    if (!perdidoAlvo) return;
    setPerdidoSalvando(true);
    const motivoFinal =
      perdidoMotivo === "outro"
        ? perdidoDetalhe.trim() || "outro"
        : perdidoMotivo + (perdidoDetalhe.trim() ? ` — ${perdidoDetalhe.trim()}` : "");
    const { error } = await supabase
      .from("orcamentos")
      .update({ status: "recusado", motivo_recusa: motivoFinal })
      .eq("id", perdidoAlvo.id);
    setPerdidoSalvando(false);
    if (error) {
      notificar("Erro ao marcar como perdido: " + error.message, "erro");
      return;
    }
    notificar(`Orçamento Nº ${perdidoAlvo.codigo} marcado como perdido.`);
    setPerdidoAlvo(null);
    await buscarOrcamentos().then((res) => setOrcamentos(res.data || []));
  }

  async function reabrirOrcamento(orcamento) {
    const ok = await confirmar({
      titulo: "Reabrir orçamento?",
      texto: `O orçamento Nº ${orcamento.codigo} volta para Pendente.`,
      confirmarTexto: "Reabrir",
    });
    if (!ok) return;
    const { error } = await supabase
      .from("orcamentos")
      .update({ status: "pendente", motivo_recusa: null })
      .eq("id", orcamento.id);
    if (error) {
      notificar("Erro ao reabrir: " + error.message, "erro");
      return;
    }
    notificar(`Orçamento Nº ${orcamento.codigo} reaberto.`);
    await buscarOrcamentos().then((res) => setOrcamentos(res.data || []));
  }

  async function handleConverter(orcamentoId) {
    const ok = await confirmar({
      titulo: "Converter em venda?",
      texto:
        "O estoque dos produtos será baixado e essa ação não pode ser desfeita.",
      confirmarTexto: "Converter em venda",
    });
    if (!ok) return;

    setConvertendoId(orcamentoId);
    setErro("");
    setMensagem("");

    const { error } = await supabase.rpc("converter_orcamento_em_venda", {
      orcamento_id_input: orcamentoId,
    });

    if (error) {
      notificar("Não foi possível converter em venda: " + error.message, "erro");
    } else {
      notificar("Orçamento convertido em venda! Confira em Vendas.");
      await carregarTudo();
    }
    setConvertendoId(null);
  }

  const statusEfetivo = (o) =>
    o.status === "recusado" ? "recusado" : estaVencido(o) ? "vencido" : o.status;
  const contadores = {
    todos: orcamentos.length,
    pendente: orcamentos.filter((o) => statusEfetivo(o) === "pendente").length,
    aprovado: orcamentos.filter((o) => statusEfetivo(o) === "aprovado").length,
    vencido: orcamentos.filter((o) => statusEfetivo(o) === "vencido").length,
    recusado: orcamentos.filter((o) => statusEfetivo(o) === "recusado").length,
  };

  const orcamentosFiltrados = orcamentos.filter((o) => {
    if (filtroStatus !== "todos" && statusEfetivo(o) !== filtroStatus) return false;
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      o.clientes?.nome?.toLowerCase().includes(termo) ||
      String(o.codigo).includes(termo) ||
      o.status?.toLowerCase().includes(termo)
    );
  });
  const pag = usePaginacao(orcamentosFiltrados);

  // Dias até vencer (para destacar propostas vencendo em até 3 dias)
  function diasParaVencer(o) {
    if (o.status !== "pendente" || !o.validade) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const v = new Date(o.validade + "T00:00:00");
    const dias = Math.round((v - hoje) / 86400000);
    return dias >= 0 ? dias : null;
  }

  // Busca no seletor de produtos (ignora maiúsculas e acentos)
  const normalizarTexto = (t) =>
    (t || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const produtosFiltrados = buscaProduto.trim()
    ? produtos.filter((p) => normalizarTexto(p.nome).includes(normalizarTexto(buscaProduto)))
    : produtos;

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClasse = "block text-xs font-medium text-slate-600 mb-1";

  // Motivo que impede o salvar (botão inteligente)
  const motivoBloqueio = !clienteId
    ? "Escolha o cliente"
    : itens.filter((i) => i.quantidade > 0).length === 0
      ? "Adicione produtos ao orçamento"
      : itens.some((i) => i.quantidade > estoqueDoProduto(i.produto_id))
      ? "Há itens acima do estoque disponível"
      : null;

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
          {modo === "editar" ? "Editar orçamento" : "Novo orçamento"}
        </h1>
        <p className="text-slate-500 mb-6">
          {modo === "editar"
            ? `Código #${editingCodigo}`
            : "Monte a proposta com cliente, produtos e quantidades."}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {erro}
          </div>
        )}
        {!loading && clientes.length === 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-sm">
            Nenhum cliente cadastrado ainda.{" "}
            <Link href="/clientes" className="underline font-medium">
              Cadastre um cliente
            </Link>{" "}
            antes de criar um orçamento.
          </div>
        )}
        {!loading && produtos.length === 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-sm">
            Nenhum produto cadastrado ainda.{" "}
            <Link href="/produtos" className="underline font-medium">
              Cadastre um produto
            </Link>{" "}
            antes de criar um orçamento.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // Enter nunca finaliza por acidente: no bloco de produtos ele
            // ADICIONA o item; nos demais campos não faz nada. Para salvar,
            // só o botão "Salvar orçamento".
            if (e.key !== "Enter") return;
            const alvo = e.target;
            if (alvo.tagName === "TEXTAREA" || alvo.tagName === "BUTTON") return;
            e.preventDefault();
            if (alvo.closest('[data-bloco="produto"]')) adicionarItem();
          }}
          onFocusCapture={(e) => {
            const t = e.target;
            if (t.tagName === "INPUT" && t.type === "number") t.select();
          }}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className={labelClasse}>Cliente</label>
                <button
                  type="button"
                  onClick={() => setNovoClienteAberto((v) => !v)}
                  className="text-[11px] font-medium text-emerald-700 hover:underline mb-1"
                >
                  {novoClienteAberto ? "cancelar" : "+ novo cliente"}
                </button>
              </div>
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
              {novoClienteAberto && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={novoClienteNome}
                      onChange={(e) => setNovoClienteNome(e.target.value)}
                      placeholder="Nome do cliente"
                      className={campoClasse}
                    />
                    <input
                      type="text"
                      value={novoClienteTelefone}
                      onChange={(e) => setNovoClienteTelefone(e.target.value)}
                      placeholder="Telefone"
                      className={campoClasse}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={salvarNovoCliente}
                    disabled={!novoClienteNome.trim() || salvandoCliente}
                    className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {salvandoCliente ? "Salvando..." : "Cadastrar e usar"}
                  </button>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Os demais dados podem ser completados depois na tela de Clientes.
                  </p>
                </div>
              )}
            </div>
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
          </div>

          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Adicionar produtos
            </p>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="🔍 Buscar produto..."
                className={campoClasse + " sm:max-w-xs"}
              />
              {buscaProduto.trim() && (
                <>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {produtosFiltrados.length} de {produtos.length} produtos
                  </span>
                  <button
                    type="button"
                    onClick={() => setBuscaProduto("")}
                    className="text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded px-2 py-1"
                  >
                    Limpar
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3" data-bloco="produto">
              <div className="sm:col-span-2">
                <select
                  value={produtoParaAdicionar}
                  onChange={(e) => {
                    setProdutoParaAdicionar(e.target.value);
                    if (e.target.value) setBuscaProduto("");
                  }}
                  className={campoClasse}
                >
                  <option value="">
                    {buscaProduto.trim() && produtosFiltrados.length === 0
                      ? "Nenhum produto encontrado"
                      : "Selecione um produto"}
                  </option>
                  {produtosFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} {p.unidade ? `(${p.unidade})` : ""} — estoque:{" "}
                      {p.quantidade_estoque ?? 0}
                    </option>
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
                disabled={!produtoParaAdicionar}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
              >
                Adicionar item
              </button>
            </div>

            {itens.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nenhum produto adicionado ainda.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1 font-medium">Produto</th>
                    <th className="py-1 font-medium w-24">Qtd.</th>
                    <th className="py-1 font-medium w-28">Preço unit.</th>
                    <th className="py-1 font-medium text-right">Subtotal</th>
                    <th className="py-1 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.produto_id} className="border-t border-slate-200">
                      <td className="py-1.5 pr-2">
                        {i.nome}
                        {i.quantidade > estoqueDoProduto(i.produto_id) && (
                          <span className="block text-amber-600 text-xs">
                            acima do estoque atual (
                            {estoqueDoProduto(i.produto_id)})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          value={i.quantidade}
                          onChange={(e) =>
                            atualizarItem(
                              i.produto_id,
                              "quantidade",
                              e.target.value
                            )
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
                            atualizarItem(
                              i.produto_id,
                              "preco_unitario",
                              e.target.value
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatarMoeda(i.quantidade * i.preco_unitario)}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removerItem(i.produto_id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pecasDoOrcamento.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-600 mb-2">Desenhos das peças (ilustrativo)</p>
            <QuadroPecas pecas={pecasDoOrcamento} />
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 p-4 bg-slate-50">
          <p className="text-xs font-medium text-slate-600 mb-2">Entrega e frete (opcional)</p>
          <div className="mb-3 sm:max-w-xs">
            <label className={labelClasse}>Unidade do orçamento</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className={campoClasse}
            >
              <option value="matriz">Matriz — Feira Grande, AL</option>
              <option value="filial">{"Filial — " + (freteConfig?.filial_cidade_uf || "Barra dos Coqueiros, SE")}</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Define de onde sai o frete e os dados da empresa no impresso.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
            <div className="sm:col-span-3">
              <label className={labelClasse}>Endereço de entrega</label>
              <input
                type="text"
                value={enderecoEntrega}
                onChange={(e) => setEnderecoEntrega(e.target.value)}
                placeholder="Ex: Rua X, 100, Centro, Arapiraca - AL"
                className={campoClasse}
              />
              {enderecoEntrega.trim() !== "" && (
                <a
                  href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(enderecoEntrega)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1 text-xs text-emerald-700 hover:text-emerald-900 underline"
                >
                  Ver no Google Maps ↗
                </a>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={calcularFrete}
                disabled={calculandoFrete || !enderecoEntrega.trim()}
                className="w-full rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition"
              >
                {calculandoFrete ? "Calculando..." : "Calcular frete"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className={labelClasse}>Distância (km)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={distanciaKm}
                onChange={(e) => {
                  setDistanciaKm(e.target.value);
                  const km = Number(e.target.value) || 0;
                  if (km > 0) setValorFrete(String(aplicarRegraFrete(km)));
                }}
                placeholder="0"
                className={campoClasse}
              />
            </div>
            <div>
              <label className={labelClasse}>Frete (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorFrete}
                onChange={(e) => setValorFrete(e.target.value)}
                placeholder="0,00"
                className={campoClasse}
              />
            </div>
            <div>
              <label className={labelClasse}>Viagens</label>
              <input
                type="number"
                min="1"
                step="1"
                value={viagens}
                onChange={(e) => {
                  setViagens(e.target.value);
                  const km = Number(distanciaKm) || 0;
                  if (km > 0) setValorFrete(String(aplicarRegraFrete(km, e.target.value)));
                }}
                onFocus={(e) => e.target.select()}
                className={campoClasse}
              />
            </div>
            <p className="col-span-2 self-end text-[11px] text-slate-400 pb-1">
              Até {Number(freteConfig?.frete_raio_km ?? 10)} km: fixo de {formatarMoeda(freteConfig?.frete_valor_fixo ?? 100)}. Acima: {formatarMoeda(freteConfig?.frete_valor_km ?? 9)}/km × km × 2 (ida e volta). O valor é multiplicado pelo nº de viagens. Se o mapa falhar, digite os km na mão.
            </p>
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
              <label className={labelClasse}>Observações</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Frete CIF, forma de pagamento..."
                className={campoClasse}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm space-y-0.5">
              <p className="text-slate-500">
                Subtotal: {formatarMoeda(subtotalOrcamento)}
              </p>
              {descontoNumerico > 0 && (
                <p className="text-slate-500">
                  Desconto: − {formatarMoeda(descontoNumerico)}
                </p>
              )}
              {valorFreteNumerico > 0 && (
                <p className="text-slate-500">
                  Frete: + {formatarMoeda(valorFreteNumerico)}
                </p>
              )}
              <p>
                <span className="text-slate-500">Total do orçamento: </span>
                <span className="font-semibold text-lg">
                  {formatarMoeda(totalFinalOrcamento)}
                </span>
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
      <h1 className="text-2xl font-bold mb-1">Orçamentos</h1>
      <p className="text-slate-500 mb-6">
        Monte propostas para clientes e converta em venda quando aprovadas.
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
      {rascunhoDisponivel && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <span>
            Há um orçamento <b>não salvo</b> de{" "}
            {new Date(rascunhoDisponivel.quando).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
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

      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          placeholder="Pesquisar por cliente, código ou status..."
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

      {/* Filtro por status com contadores */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { chave: "todos", rotulo: "Todos" },
          { chave: "pendente", rotulo: "Pendentes" },
          { chave: "aprovado", rotulo: "Aprovados" },
          { chave: "vencido", rotulo: "Vencidos" },
          { chave: "recusado", rotulo: "Perdidos" },
        ].map((f) => (
          <button
            key={f.chave}
            type="button"
            onClick={() => setFiltroStatus(f.chave)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filtroStatus === f.chave
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.rotulo}{" "}
            <span className={filtroStatus === f.chave ? "text-slate-300" : "text-slate-400"}>
              {contadores[f.chave]}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {loading ? (
          <LinhasEsqueleto linhas={5} />
        ) : orcamentos.length === 0 ? (
          <EstadoVazio
            icone={FileText}
            titulo="Nenhum orçamento criado ainda"
            texto='Clique em "Incluir orçamento" para montar o primeiro.'
          />
        ) : orcamentosFiltrados.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum orçamento encontrado"
            texto="Ajuste a busca ou o filtro de status acima."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Criado em</th>
                <th className="px-4 py-2 font-medium">Válido até</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            {pag.itensPagina.map((o) => (
              <tbody key={o.id} className="border-t border-slate-100">
                <tr>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                    {o.codigo}
                  </td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {o.clientes?.nome ?? "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataHora(o.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatarDataSimples(o.validade)}
                    {(() => {
                      const dias = diasParaVencer(o);
                      if (dias === null || dias > 3) return null;
                      return (
                        <span
                          className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            dias <= 1 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {dias === 0 ? "vence hoje" : `${dias} dia(s)`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">
                    {formatarMoeda(o.total)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <BadgeStatus
                      status={estaVencido(o) ? "vencido" : o.status}
                    />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() =>
                          setExpandidoId(expandidoId === o.id ? null : o.id)
                        }
                        className="text-slate-600 hover:text-slate-900"
                        title={expandidoId === o.id ? "Ocultar itens" : "Ver itens"}
                      >
                        {expandidoId === o.id ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      <Link
                        href={`/orcamentos/imprimir?codigo=${o.codigo}`}
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
                      {o.status !== "aprovado" && o.status !== "recusado" && (
                        <>
                          {linkFollowUpWhatsApp(o) && (
                            <a
                              href={linkFollowUpWhatsApp(o)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-green-600 hover:text-green-800"
                              title="Cobrar retorno no WhatsApp (mensagem pronta)"
                            >
                              <MessageCircle size={16} />
                            </a>
                          )}
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
                            {convertendoId === o.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <ShoppingCart size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => abrirPerdido(o)}
                            className="text-slate-400 hover:text-rose-600"
                            title="Marcar como perdido (cliente não fechou)"
                          >
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                      {o.status === "recusado" && (
                        <button
                          onClick={() => reabrirOrcamento(o)}
                          className="text-slate-500 hover:text-emerald-700"
                          title={`Reabrir (volta para Pendente)${o.motivo_recusa ? ` — perdido por: ${o.motivo_recusa}` : ""}`}
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandidoId === o.id && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Itens do orçamento
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1">
                        {(o.itens_orcamento || []).map((item) => (
                          <li key={item.id}>
                            {item.quantidade}x{" "}
                            {item.produtos?.nome ?? "produto removido"} —{" "}
                            {formatarMoeda(item.preco_unitario)} cada ={" "}
                            {formatarMoeda(
                              item.quantidade * item.preco_unitario
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
        <ControlePaginacao {...pag} />
      </div>

      {/* ---------- Modal: marcar como perdido ---------- */}
      {perdidoAlvo && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPerdidoAlvo(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Marcar como perdido?</h3>
            <p className="text-xs text-slate-500 mb-4">
              Orçamento Nº {perdidoAlvo.codigo} · {perdidoAlvo.clientes?.nome || "sem cliente"}.
              Ele sai dos pendentes, mas pode ser reaberto depois.
            </p>

            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label>
            <select
              value={perdidoMotivo}
              onChange={(e) => setPerdidoMotivo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
            >
              <option value="sem retorno do cliente">Sem retorno do cliente</option>
              <option value="preço">Preço</option>
              <option value="prazo">Prazo</option>
              <option value="fechou com concorrente">Fechou com concorrente</option>
              <option value="desistiu da obra">Desistiu da obra</option>
              <option value="outro">Outro</option>
            </select>

            <label className="block text-xs font-medium text-slate-600 mb-1">
              Detalhe (opcional)
            </label>
            <input
              type="text"
              value={perdidoDetalhe}
              onChange={(e) => setPerdidoDetalhe(e.target.value)}
              placeholder="Ex: achou R$ 5 mil mais barato em..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPerdidoAlvo(null)}
                className="rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPerdido}
                disabled={perdidoSalvando}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
              >
                {perdidoSalvando ? "Salvando..." : "Marcar como perdido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrcamentosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <OrcamentosPageInterno />
    </Suspense>
  );
}
