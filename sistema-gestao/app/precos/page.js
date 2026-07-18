"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Plus, ChevronDown, ChevronRight, Copy, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useSouAdmin, AcessoRestrito } from "@/components/Ui";
import { notificar, confirmar } from "@/components/Ui";

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAPEIS_SUGERIDOS = [
  "TESOURA", "PILAR", "TERCA", "VIGA_TRAVAMENTO", "LAJE",
  "TELHA", "CALHA", "CAPOTE", "MONTAGEM", "FUNDACAO",
];

function PrecosPage() {
  const [insumos, setInsumos] = useState([]);
  const [maoDeObra, setMaoDeObra] = useState([]);
  const [composicoes, setComposicoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvandoId, setSalvandoId] = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [secaoAberta, setSecaoAberta] = useState(null); // null | 'insumos' | 'maoDeObra' | 'composicoes'
  const [categoriaAberta, setCategoriaAberta] = useState(null); // qual papel está aberto dentro de Peças
  const [souAdmin, setSouAdmin] = useState(false);
  const [reajusteAberto, setReajusteAberto] = useState(false);
  const [reajusteGrupo, setReajusteGrupo] = useState("insumos");
  const [reajustePct, setReajustePct] = useState("");
  const [reajusteSalvando, setReajusteSalvando] = useState(false);

  useEffect(() => {
    supabase.rpc("eh_admin").then(({ data }) => setSouAdmin(!!data));
  }, []);

  function alternarSecao(nome) {
    setSecaoAberta((atual) => (atual === nome ? null : nome));
  }

  const [mostrarFormInsumo, setMostrarFormInsumo] = useState(false);
  const [novoInsumo, setNovoInsumo] = useState({ nome: "", unidade: "", valor_unitario: "" });
  const [mostrarFormMaoDeObra, setMostrarFormMaoDeObra] = useState(false);
  const [novaMaoDeObra, setNovaMaoDeObra] = useState({
    funcao: "",
    salario_bruto: "",
    encargos_pct: "68",
    base_horas_mes: "220",
  });
  const [mostrarFormComposicao, setMostrarFormComposicao] = useState(false);
  const [novaComposicao, setNovaComposicao] = useState({
    nome: "",
    unidade: "UN",
    papel: "",
    custo: "",
    preco: "",
  });

  // Receita (composição) expandida
  const [receitaExpandidaId, setReceitaExpandidaId] = useState(null);
  const [receitaItens, setReceitaItens] = useState([]);
  const [carregandoReceita, setCarregandoReceita] = useState(false);
  const [salvandoReceita, setSalvandoReceita] = useState(false);
  const [novoItemTipo, setNovoItemTipo] = useState("insumo");
  const [novoItemRefId, setNovoItemRefId] = useState("");
  const [novoItemQtd, setNovoItemQtd] = useState("");

  function buscarInsumos() {
    return supabase.from("insumos").select("id, codigo, nome, unidade, valor_unitario").order("nome");
  }
  function buscarMaoDeObra() {
    return supabase
      .from("mao_de_obra")
      .select("id, codigo, funcao, salario_bruto, encargos_pct, base_horas_mes, valor_hora")
      .order("funcao");
  }
  function buscarComposicoes() {
    return supabase
      .from("composicoes_galpao")
      .select("id, codigo, nome, papel, unidade, custo, preco, bdi_pct, area_referencia, composicao_itens(quantidade, insumos(valor_unitario), mao_de_obra(valor_hora))")
      .order("codigo");
  }

  // Custo ao vivo, direto da soma da composição (quantidade x valor de
  // cada insumo/mão de obra) — nunca fica desatualizado, mesmo que o
  // valor guardado no banco ainda não tenha sido recalculado/salvo.
  function custoAoVivo(c) {
    const itens = c.composicao_itens || [];
    if (itens.length === 0) return Number(c.custo) || 0;
    const soma = itens.reduce(
      (total, item) =>
        total +
        Number(item.quantidade || 0) *
          Number(item.insumos?.valor_unitario ?? item.mao_de_obra?.valor_hora ?? 0),
      0
    );
    const area = Number(c.area_referencia) || 0;
    return Math.round((area > 0 ? soma / area : soma) * 100) / 100;
  }

  function aplicarResultados(r1, r2, r3) {
    const erroEncontrado = r1.error || r2.error || r3.error;
    if (erroEncontrado) {
      setErro("Não foi possível carregar os dados: " + erroEncontrado.message);
    } else {
      setInsumos(r1.data);
      setMaoDeObra(r2.data);
      setComposicoes(r3.data);
    }
    setLoading(false);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    const [r1, r2, r3] = await Promise.all([buscarInsumos(), buscarMaoDeObra(), buscarComposicoes()]);
    aplicarResultados(r1, r2, r3);
  }

  useEffect(() => {
    let ativo = true;
    Promise.all([buscarInsumos(), buscarMaoDeObra(), buscarComposicoes()]).then(([r1, r2, r3]) => {
      if (ativo) aplicarResultados(r1, r2, r3);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function atualizarCampo(lista, setLista, id, campo, valor) {
    setLista(lista.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
  }

  // ---------- INSUMOS ----------
  async function salvarInsumo(insumo) {
    setSalvandoId(insumo.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("insumos")
      .update({ nome: insumo.nome, unidade: insumo.unidade, valor_unitario: Number(insumo.valor_unitario) || 0 })
      .eq("id", insumo.id);
    if (error) setErro("Erro ao salvar: " + error.message);
    else notificar(`${insumo.nome} atualizado.`);
    setSalvandoId(null);
  }

  async function excluirInsumo(insumo) {
    const ok = await confirmar({
      titulo: "Excluir insumo?",
      texto: `"${insumo.nome}" será removido da tabela de preços.`,
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;
    setSalvandoId(insumo.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("insumos").delete().eq("id", insumo.id);
    if (error) {
      setErro(
        error.code === "23503"
          ? `Não é possível excluir "${insumo.nome}": ele é usado na receita de uma ou mais peças. Remova esse uso primeiro (na receita da peça).`
          : "Erro ao excluir: " + error.message
      );
    } else {
      notificar(`${insumo.nome} excluído.`);
      setInsumos((atual) => atual.filter((i) => i.id !== insumo.id));
    }
    setSalvandoId(null);
  }

  async function adicionarInsumo(e) {
    e.preventDefault();
    if (!novoInsumo.nome.trim()) {
      setErro("Informe o nome do insumo.");
      return;
    }
    setSalvandoId("novo-insumo");
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("insumos").insert({
      nome: novoInsumo.nome.trim(),
      unidade: novoInsumo.unidade.trim() || null,
      valor_unitario: Number(novoInsumo.valor_unitario) || 0,
    });
    if (error) {
      setErro("Erro ao adicionar insumo: " + error.message);
    } else {
      notificar("Insumo adicionado.");
      setNovoInsumo({ nome: "", unidade: "", valor_unitario: "" });
      setMostrarFormInsumo(false);
      const { data } = await buscarInsumos();
      if (data) setInsumos(data);
    }
    setSalvandoId(null);
  }

  // ---------- MÃO DE OBRA ----------
  async function salvarMaoDeObra(item) {
    setSalvandoId(item.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("mao_de_obra")
      .update({
        funcao: item.funcao,
        salario_bruto: Number(item.salario_bruto) || 0,
        encargos_pct: Number(item.encargos_pct) || 0,
      })
      .eq("id", item.id);
    if (error) {
      setErro("Erro ao salvar: " + error.message);
    } else {
      notificar(`${item.funcao} atualizado.`);
      const { data } = await buscarMaoDeObra();
      if (data) setMaoDeObra(data);
    }
    setSalvandoId(null);
  }

  async function excluirMaoDeObra(item) {
    const ok = await confirmar({
      titulo: "Excluir função?",
      texto: `"${item.funcao}" será removida da mão de obra.`,
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;
    setSalvandoId(item.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("mao_de_obra").delete().eq("id", item.id);
    if (error) {
      setErro(
        error.code === "23503"
          ? `Não é possível excluir "${item.funcao}": ela é usada na receita de uma ou mais peças. Remova esse uso primeiro (na receita da peça).`
          : "Erro ao excluir: " + error.message
      );
    } else {
      notificar(`${item.funcao} excluído.`);
      setMaoDeObra((atual) => atual.filter((i) => i.id !== item.id));
    }
    setSalvandoId(null);
  }

  async function adicionarMaoDeObra(e) {
    e.preventDefault();
    if (!novaMaoDeObra.funcao.trim()) {
      setErro("Informe o nome da função.");
      return;
    }
    setSalvandoId("nova-mao-de-obra");
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("mao_de_obra").insert({
      funcao: novaMaoDeObra.funcao.trim(),
      salario_bruto: Number(novaMaoDeObra.salario_bruto) || 0,
      encargos_pct: Number(novaMaoDeObra.encargos_pct) || 0,
      base_horas_mes: Number(novaMaoDeObra.base_horas_mes) || 220,
    });
    if (error) {
      setErro("Erro ao adicionar função: " + error.message);
    } else {
      notificar("Função adicionada.");
      setNovaMaoDeObra({ funcao: "", salario_bruto: "", encargos_pct: "68", base_horas_mes: "220" });
      setMostrarFormMaoDeObra(false);
      const { data } = await buscarMaoDeObra();
      if (data) setMaoDeObra(data);
    }
    setSalvandoId(null);
  }

  // ---------- COMPOSIÇÕES (PEÇAS) ----------
  async function salvarComposicao(comp) {
    setSalvandoId(comp.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("composicoes_galpao")
      .update({
        nome: comp.nome,
        papel: comp.papel || null,
        unidade: comp.unidade,
        custo: Number(comp.custo) || 0,
        preco: Number(comp.preco) || 0,
      })
      .eq("id", comp.id);
    if (error) setErro("Erro ao salvar: " + error.message);
    else notificar(`${comp.nome} atualizado.`);
    setSalvandoId(null);
  }

  async function excluirComposicao(comp) {
    const ok = await confirmar({
      titulo: "Excluir peça?",
      texto: `"${comp.nome}" será removida. Orçamentos que já usaram essa peça não são afetados — eles guardam o nome/valor de quando foram feitos.`,
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;
    setSalvandoId(comp.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("composicoes_galpao").delete().eq("id", comp.id);
    if (error) {
      setErro("Erro ao excluir: " + error.message);
    } else {
      notificar(`${comp.nome} excluída.`);
      setComposicoes((atual) => atual.filter((c) => c.id !== comp.id));
      if (receitaExpandidaId === comp.id) setReceitaExpandidaId(null);
    }
    setSalvandoId(null);
  }

  function duplicarComposicao(comp) {
    setNovaComposicao({
      nome: comp.nome + " (cópia)",
      unidade: comp.unidade || "UN",
      papel: comp.papel || "",
      custo: String(comp.custo ?? ""),
      preco: String(comp.preco ?? ""),
    });
    setCategoriaAberta(comp.papel || "Sem categoria");
    setMostrarFormComposicao(true);
    setErro("");
    setMensagem('Peça duplicada no formulário abaixo — ajuste o nome e os valores, depois clique em "Adicionar peça".');
  }

  async function adicionarComposicao(e) {
    e.preventDefault();
    if (!novaComposicao.nome.trim()) {
      setErro("Informe o nome da peça.");
      return;
    }
    setSalvandoId("nova-composicao");
    setErro("");
    setMensagem("");
    const custo = Number(novaComposicao.custo) || 0;
    const preco = novaComposicao.preco === "" ? custo : Number(novaComposicao.preco) || 0;
    const bdiPct = custo > 0 ? Math.round((preco / custo - 1) * 100 * 100) / 100 : 0;
    const { error } = await supabase.from("composicoes_galpao").insert({
      nome: novaComposicao.nome.trim(),
      papel: novaComposicao.papel.trim() || null,
      unidade: novaComposicao.unidade.trim() || "UN",
      custo,
      preco,
      bdi_pct: bdiPct,
    });
    if (error) {
      setErro("Erro ao adicionar peça: " + error.message);
    } else {
      setMensagem('Peça adicionada. Sem receita ainda — o preço fica manual até você adicionar insumos na "Receita".');
      setNovaComposicao({ nome: "", unidade: "UN", papel: "", custo: "", preco: "" });
      setMostrarFormComposicao(false);
      const { data } = await buscarComposicoes();
      if (data) setComposicoes(data);
    }
    setSalvandoId(null);
  }

  async function recalcularTudo() {
    const ok = await confirmar({
      titulo: "Recalcular todas as peças?",
      texto:
        "O custo/preço de todas as peças com receita de insumos será atualizado com os valores atuais. Peças sem receita (Telha, Montagem, Fundação etc.) não são afetadas.",
      confirmarTexto: "Recalcular",
    });
    if (!ok) return;
    setRecalculando(true);
    setErro("");
    setMensagem("");
    const { data, error } = await supabase.rpc("recalcular_todas_composicoes");
    if (error) {
      setErro("Erro ao recalcular: " + error.message);
    } else {
      notificar(`${data} composições recalculadas a partir dos insumos/mão de obra atuais.`);
      const { data: novasComposicoes } = await buscarComposicoes();
      if (novasComposicoes) setComposicoes(novasComposicoes);
    }
    setRecalculando(false);
  }

  // ---------- RECEITA DE UMA PEÇA ----------
  function buscarReceita(composicaoId) {
    return supabase
      .from("composicao_itens")
      .select(
        "id, insumo_id, mao_de_obra_id, quantidade, insumos(nome, unidade, valor_unitario), mao_de_obra(funcao, valor_hora)"
      )
      .eq("composicao_produto_id", composicaoId);
  }

  async function alternarReceita(composicaoId) {
    if (receitaExpandidaId === composicaoId) {
      setReceitaExpandidaId(null);
      return;
    }
    setErro("");
    setMensagem("");
    setCarregandoReceita(true);
    setReceitaExpandidaId(composicaoId);
    setNovoItemRefId("");
    setNovoItemQtd("");
    const { data, error } = await buscarReceita(composicaoId);
    if (error) {
      setErro("Erro ao carregar receita: " + error.message);
      setReceitaItens([]);
    } else {
      setReceitaItens(
        data.map((item) => ({
          id: item.id,
          insumo_id: item.insumo_id,
          mao_de_obra_id: item.mao_de_obra_id,
          quantidade: item.quantidade,
          nome: item.insumos?.nome || item.mao_de_obra?.funcao || "?",
          unidade: item.insumos?.unidade || "HORA",
          valor_unitario: item.insumos?.valor_unitario ?? item.mao_de_obra?.valor_hora ?? 0,
        }))
      );
    }
    setCarregandoReceita(false);
  }

  function adicionarLinhaReceita() {
    if (!novoItemRefId || novoItemQtd === "") {
      setErro("Selecione o insumo/função e informe a quantidade.");
      return;
    }
    setErro("");
    if (novoItemTipo === "insumo") {
      const insumo = insumos.find((i) => String(i.id) === String(novoItemRefId));
      if (!insumo) return;
      setReceitaItens((atual) => [
        ...atual,
        {
          id: `novo-${Date.now()}`,
          insumo_id: insumo.id,
          mao_de_obra_id: null,
          quantidade: Number(novoItemQtd) || 0,
          nome: insumo.nome,
          unidade: insumo.unidade,
          valor_unitario: Number(insumo.valor_unitario) || 0,
        },
      ]);
    } else {
      const mdo = maoDeObra.find((m) => String(m.id) === String(novoItemRefId));
      if (!mdo) return;
      setReceitaItens((atual) => [
        ...atual,
        {
          id: `novo-${Date.now()}`,
          insumo_id: null,
          mao_de_obra_id: mdo.id,
          quantidade: Number(novoItemQtd) || 0,
          nome: mdo.funcao,
          unidade: "HORA",
          valor_unitario: Number(mdo.valor_hora) || 0,
        },
      ]);
    }
    setNovoItemRefId("");
    setNovoItemQtd("");
  }

  function removerLinhaReceita(id) {
    setReceitaItens((atual) => atual.filter((item) => item.id !== id));
  }

  function atualizarQuantidadeReceita(id, valor) {
    setReceitaItens((atual) =>
      atual.map((item) => (item.id === id ? { ...item, quantidade: valor } : item))
    );
  }

  async function salvarReceita(composicaoId) {
    setSalvandoReceita(true);
    setErro("");
    setMensagem("");

    const { error: erroDelete } = await supabase
      .from("composicao_itens")
      .delete()
      .eq("composicao_produto_id", composicaoId);
    if (erroDelete) {
      setErro("Erro ao salvar receita: " + erroDelete.message);
      setSalvandoReceita(false);
      return;
    }

    if (receitaItens.length > 0) {
      const payload = receitaItens.map((item) => ({
        composicao_produto_id: composicaoId,
        insumo_id: item.insumo_id,
        mao_de_obra_id: item.mao_de_obra_id,
        quantidade: Number(item.quantidade) || 0,
      }));
      const { error: erroInsert } = await supabase.from("composicao_itens").insert(payload);
      if (erroInsert) {
        setErro("Erro ao salvar receita: " + erroInsert.message);
        setSalvandoReceita(false);
        return;
      }
    }

    const { error: erroRecalc } = await supabase.rpc("recalcular_composicao", {
      composicao_id_input: composicaoId,
    });
    if (erroRecalc) {
      setErro("Receita salva, mas houve erro ao recalcular o preço: " + erroRecalc.message);
    } else {
      notificar("Receita salva e o preço da peça foi recalculado.");
      const { data } = await buscarComposicoes();
      if (data) setComposicoes(data);
    }
    setSalvandoReceita(false);
  }

  const composicoesFiltradas = composicoes.filter((c) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return c.nome.toLowerCase().includes(termo) || (c.papel || "").toLowerCase().includes(termo);
  });
  const composicoesPorPapel = composicoesFiltradas.reduce((acc, c) => {
    const grupo = c.papel || "Sem categoria";
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(c);
    return acc;
  }, {});
  const papeisOrdenados = Object.keys(composicoesPorPapel).sort();

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const campoNumero =
    "w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const campoTexto =
    "rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const botaoSalvar = "text-emerald-700 hover:text-emerald-900 disabled:opacity-40 text-xs font-medium";
  const botaoIncluir =
    "text-emerald-700 hover:text-emerald-900 text-xs font-medium flex items-center gap-1";

  // ---------- Reajuste em massa ----------
  const listaReajuste = reajusteGrupo === "insumos" ? insumos : maoDeObra;
  const campoValor = reajusteGrupo === "insumos" ? "valor_unitario" : "salario_bruto";
  const fatorReajuste = 1 + (Number(reajustePct) || 0) / 100;

  async function aplicarReajusteEmMassa() {
    const pct = Number(reajustePct);
    if (!pct || pct === 0) {
      notificar("Informe um percentual diferente de zero.", "erro");
      return;
    }
    const ok = await confirmar({
      titulo: "Aplicar reajuste em massa?",
      texto: `${pct > 0 ? "+" : ""}${pct}% em ${
        reajusteGrupo === "insumos" ? "TODOS os insumos" : "TODA a mão de obra"
      } (${listaReajuste.length} itens). Cada alteração fica registrada no histórico de preços.`,
      confirmarTexto: "Aplicar reajuste",
    });
    if (!ok) return;
    setReajusteSalvando(true);
    const { data: sessao } = await supabase.auth.getSession();
    const usuario =
      sessao?.session?.user?.user_metadata?.nome_completo ||
      sessao?.session?.user?.email ||
      null;
    const { data, error } = await supabase.rpc("reajustar_precos_em_massa", {
      grupo_input: reajusteGrupo,
      percentual_input: pct,
      nome_usuario_input: usuario,
    });
    setReajusteSalvando(false);
    if (error) {
      notificar("Erro no reajuste: " + error.message, "erro");
      return;
    }
    notificar(`Reajuste aplicado em ${data} item(ns).`);
    setReajusteAberto(false);
    setReajustePct("");
    await carregarTudo();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Preços</h1>
      <p className="text-slate-500 mb-6">
        Insumos, mão de obra e peças de galpão — inclua, edite ou remova conforme o negócio muda.
      </p>

      {!souAdmin && (
        <div className="mb-4 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 px-4 py-3 text-sm">
          Você pode consultar os preços, mas só um administrador pode alterá-los, incluir ou excluir itens.
        </div>
      )}

      {/* ---------- Reajuste em massa (admin) ---------- */}
      {souAdmin && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setReajusteAberto((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 transition"
          >
            <TrendingUp size={15} className="text-emerald-600" />
            Reajustar preços em massa
          </button>

          {reajusteAberto && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Grupo</label>
                  <select
                    value={reajusteGrupo}
                    onChange={(e) => setReajusteGrupo(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="insumos">Insumos (materiais)</option>
                    <option value="mao_de_obra">Mão de obra (salários)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Percentual (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={reajustePct}
                    onChange={(e) => setReajustePct(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ex: 8 ou -5"
                    className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={aplicarReajusteEmMassa}
                  disabled={reajusteSalvando || !reajustePct}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
                >
                  {reajusteSalvando ? "Aplicando..." : "Aplicar"}
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-2">
                Prévia dos primeiros itens (o reajuste vale para todos os {listaReajuste.length}).
                Cada alteração fica registrada no histórico de preços.
              </p>
              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-left">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Item</th>
                      <th className="px-3 py-1.5 font-medium text-right">Atual</th>
                      <th className="px-3 py-1.5 font-medium text-right">
                        {reajustePct ? `Com ${Number(reajustePct) > 0 ? "+" : ""}${reajustePct}%` : "Novo"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaReajuste.slice(0, 5).map((item) => {
                      const atual = Number(item[campoValor]) || 0;
                      const novo = Math.round(atual * fatorReajuste * 100) / 100;
                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700">
                            {item.nome || item.funcao}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">
                            {formatarMoeda(atual)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-emerald-700">
                            {reajustePct ? formatarMoeda(novo) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {reajusteGrupo === "mao_de_obra" && (
                <p className="text-[11px] text-slate-400 mt-2">
                  Reajusta o salário bruto; o valor/hora é recalculado. Rode &quot;Recalcular
                  peças&quot; depois para propagar aos preços das composições.
                </p>
              )}
            </div>
          )}
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

      {/* INSUMOS */}
      <button
        type="button"
        onClick={() => alternarSecao("insumos")}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 mb-2 shadow-sm hover:bg-slate-50 transition"
      >
        <span className="text-sm font-semibold text-slate-700">Insumos (materiais)</span>
        <span className="flex items-center gap-2 text-slate-400">
          <span className="text-xs">{insumos.length} itens</span>
          {secaoAberta === "insumos" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {secaoAberta === "insumos" && (
      <div className="mb-6">
      <div className="flex justify-end mb-2">
        {souAdmin && (
        <button onClick={() => setMostrarFormInsumo((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir insumo
        </button>
        )}
      </div>
      {mostrarFormInsumo && (
        <form
          onSubmit={adicionarInsumo}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-2 grid grid-cols-1 sm:grid-cols-4 gap-2"
        >
          <input
            placeholder="Nome"
            value={novoInsumo.nome}
            onChange={(e) => setNovoInsumo({ ...novoInsumo, nome: e.target.value })}
            className={campoClasse}
          />
          <input
            placeholder="Unidade (KG, LATA...)"
            value={novoInsumo.unidade}
            onChange={(e) => setNovoInsumo({ ...novoInsumo, unidade: e.target.value })}
            className={campoClasse}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Valor unitário"
            value={novoInsumo.valor_unitario}
            onChange={(e) => setNovoInsumo({ ...novoInsumo, valor_unitario: e.target.value })}
            className={campoClasse}
          />
          <button
            type="submit"
            disabled={salvandoId === "novo-insumo"}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
          >
            {salvandoId === "novo-insumo" ? "Salvando..." : "Adicionar"}
          </button>
        </form>
      )}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Insumo</th>
              <th className="px-4 py-2 font-medium">Un.</th>
              <th className="px-4 py-2 font-medium">Valor unitário</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <input
                    value={i.nome}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "nome", e.target.value)}
                    disabled={!souAdmin}
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={i.unidade || ""}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "unidade", e.target.value)}
                    disabled={!souAdmin}
                    className={campoTexto + " w-20"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={i.valor_unitario}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "valor_unitario", e.target.value)}
                    disabled={!souAdmin}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {souAdmin && (
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => salvarInsumo(i)} disabled={salvandoId === i.id} className={botaoSalvar}>
                      {salvandoId === i.id ? "..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => excluirInsumo(i)}
                      disabled={salvandoId === i.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-40"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}

      {/* MÃO DE OBRA */}
      <button
        type="button"
        onClick={() => alternarSecao("maoDeObra")}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 mb-2 shadow-sm hover:bg-slate-50 transition"
      >
        <span className="text-sm font-semibold text-slate-700">Mão de obra</span>
        <span className="flex items-center gap-2 text-slate-400">
          <span className="text-xs">{maoDeObra.length} funções</span>
          {secaoAberta === "maoDeObra" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {secaoAberta === "maoDeObra" && (
      <div className="mb-4">
      <div className="flex justify-end mb-2">
        {souAdmin && (
        <button onClick={() => setMostrarFormMaoDeObra((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir função
        </button>
        )}
      </div>
      {mostrarFormMaoDeObra && (
        <form
          onSubmit={adicionarMaoDeObra}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-2 grid grid-cols-1 sm:grid-cols-4 gap-2"
        >
          <input
            placeholder="Função"
            value={novaMaoDeObra.funcao}
            onChange={(e) => setNovaMaoDeObra({ ...novaMaoDeObra, funcao: e.target.value })}
            className={campoClasse}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Salário bruto"
            value={novaMaoDeObra.salario_bruto}
            onChange={(e) => setNovaMaoDeObra({ ...novaMaoDeObra, salario_bruto: e.target.value })}
            className={campoClasse}
          />
          <input
            type="number"
            step="1"
            placeholder="Encargos (%)"
            value={novaMaoDeObra.encargos_pct}
            onChange={(e) => setNovaMaoDeObra({ ...novaMaoDeObra, encargos_pct: e.target.value })}
            className={campoClasse}
          />
          <button
            type="submit"
            disabled={salvandoId === "nova-mao-de-obra"}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
          >
            {salvandoId === "nova-mao-de-obra" ? "Salvando..." : "Adicionar"}
          </button>
        </form>
      )}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Função</th>
              <th className="px-4 py-2 font-medium">Salário bruto</th>
              <th className="px-4 py-2 font-medium">Encargos (%)</th>
              <th className="px-4 py-2 font-medium">Valor/hora (calculado)</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {maoDeObra.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <input
                    value={m.funcao}
                    onChange={(e) => atualizarCampo(maoDeObra, setMaoDeObra, m.id, "funcao", e.target.value)}
                    disabled={!souAdmin}
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={m.salario_bruto}
                    onChange={(e) => atualizarCampo(maoDeObra, setMaoDeObra, m.id, "salario_bruto", e.target.value)}
                    disabled={!souAdmin}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="1"
                    value={m.encargos_pct}
                    onChange={(e) => atualizarCampo(maoDeObra, setMaoDeObra, m.id, "encargos_pct", e.target.value)}
                    disabled={!souAdmin}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </td>
                <td className="px-4 py-2 text-slate-500">{formatarMoeda(m.valor_hora)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {souAdmin && (
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => salvarMaoDeObra(m)} disabled={salvandoId === m.id} className={botaoSalvar}>
                      {salvandoId === m.id ? "..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => excluirMaoDeObra(m)}
                      disabled={salvandoId === m.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-40"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}

      {souAdmin && (
      <div className="mb-6">
        <button
          onClick={recalcularTudo}
          disabled={recalculando}
          className="rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
        >
          {recalculando ? "Recalculando..." : "Recalcular todas as peças a partir dos insumos/mão de obra acima"}
        </button>
        <p className="text-xs text-slate-400 mt-1">
          Atualiza SOMENTE o custo de cada peça (soma da composição) — o preço de venda que você
          definiu nunca é alterado. Peças sem composição (Telha, Calha, Capote, Montagem, Fundação e
          peças incluídas manualmente) não são afetadas.
        </p>
      </div>
      )}

      {/* COMPOSIÇÕES */}
      <button
        type="button"
        onClick={() => alternarSecao("composicoes")}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 mb-2 shadow-sm hover:bg-slate-50 transition"
      >
        <span className="text-sm font-semibold text-slate-700">Peças de galpão</span>
        <span className="flex items-center gap-2 text-slate-400">
          <span className="text-xs">{composicoes.length} peças</span>
          {secaoAberta === "composicoes" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {secaoAberta === "composicoes" && (
      <div>
      <div className="flex justify-end mb-2">
        {souAdmin && (
        <button onClick={() => setMostrarFormComposicao((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir peça
        </button>
        )}
      </div>
      {mostrarFormComposicao && (
        <form
          onSubmit={adicionarComposicao}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-2 space-y-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              placeholder="Nome da peça"
              value={novaComposicao.nome}
              onChange={(e) => setNovaComposicao({ ...novaComposicao, nome: e.target.value })}
              className={campoClasse + " sm:col-span-2"}
            />
            <input
              placeholder="Unidade (UN, M2, M...)"
              value={novaComposicao.unidade}
              onChange={(e) => setNovaComposicao({ ...novaComposicao, unidade: e.target.value })}
              className={campoClasse}
            />
            <input
              list="papeis-sugeridos"
              placeholder="Papel/categoria (opcional)"
              value={novaComposicao.papel}
              onChange={(e) => setNovaComposicao({ ...novaComposicao, papel: e.target.value })}
              className={campoClasse}
            />
            <datalist id="papeis-sugeridos">
              {PAPEIS_SUGERIDOS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Custo"
              value={novaComposicao.custo}
              onChange={(e) => setNovaComposicao({ ...novaComposicao, custo: e.target.value })}
              className={campoClasse}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Preço de venda (em branco = igual ao custo)"
              value={novaComposicao.preco}
              onChange={(e) => setNovaComposicao({ ...novaComposicao, preco: e.target.value })}
              className={campoClasse}
            />
            <button
              type="submit"
              disabled={salvandoId === "nova-composicao"}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
            >
              {salvandoId === "nova-composicao" ? "Salvando..." : "Adicionar peça"}
            </button>
          </div>
        </form>
      )}
      <input
        type="text"
        value={termoBusca}
        onChange={(e) => setTermoBusca(e.target.value)}
        placeholder="Pesquisar peça..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {papeisOrdenados.map((papel) => (
        <div key={papel} className="mb-3">
          <button
            type="button"
            onClick={() => setCategoriaAberta((atual) => (atual === papel ? null : papel))}
            className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 shadow-sm hover:bg-slate-100 transition"
          >
            <span className="text-sm font-medium text-slate-700">{papel}</span>
            <span className="flex items-center gap-2 text-slate-400">
              <span className="text-xs">{composicoesPorPapel[papel].length} itens</span>
              {categoriaAberta === papel ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>
          {categoriaAberta === papel && (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto mt-2">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Custo</th>
              <th className="px-4 py-2 font-medium">Preço de venda</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          {composicoesPorPapel[papel].map((c) => (
            <tbody key={c.id} className="border-t border-slate-100">
              <tr>
                <td className="px-2 py-2">
                  <button
                    onClick={() => alternarReceita(c.id)}
                    className="text-slate-500 hover:text-slate-900"
                    title="Ver/editar receita (insumos e mão de obra)"
                  >
                    {receitaExpandidaId === c.id ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-400">{c.codigo}</td>
                <td className="px-4 py-2">
                  <input
                    value={c.nome}
                    onChange={(e) =>
                      atualizarCampo(composicoes, setComposicoes, c.id, "nome", e.target.value)
                    }
                    disabled={!souAdmin}
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={(c.composicao_itens || []).length > 0 ? custoAoVivo(c) : c.custo}
                    onChange={(e) =>
                      atualizarCampo(composicoes, setComposicoes, c.id, "custo", e.target.value)
                    }
                    disabled={!souAdmin || (c.composicao_itens || []).length > 0}
                    title={
                      (c.composicao_itens || []).length > 0
                        ? "Custo calculado ao vivo pela composição da peça (abra a setinha pra ver) — ajuste as quantidades da composição e ele acompanha na hora"
                        : undefined
                    }
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={c.preco}
                    onChange={(e) =>
                      atualizarCampo(composicoes, setComposicoes, c.id, "preco", e.target.value)
                    }
                    disabled={!souAdmin}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {souAdmin && (
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => salvarComposicao(c)}
                      disabled={salvandoId === c.id}
                      className={botaoSalvar}
                    >
                      {salvandoId === c.id ? "..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => duplicarComposicao(c)}
                      className="text-slate-500 hover:text-slate-800"
                      title="Duplicar (cria uma peça nova parecida)"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      onClick={() => excluirComposicao(c)}
                      disabled={salvandoId === c.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-40"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  )}
                </td>
              </tr>
              {receitaExpandidaId === c.id && (
                <tr>
                  <td colSpan={6} className="bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Receita de &quot;{c.nome}&quot; (insumos e mão de obra)
                    </p>
                    {carregandoReceita ? (
                      <p className="text-xs text-slate-400">Carregando receita...</p>
                    ) : (
                      <>
                        {receitaItens.length === 0 ? (
                          <p className="text-xs text-slate-400 mb-2">
                            Nenhum insumo/mão de obra cadastrado — o preço desta peça é manual.
                          </p>
                        ) : (
                          <table className="w-full text-xs mb-2">
                            <thead className="text-slate-500 text-left">
                              <tr>
                                <th className="py-1 font-medium">Insumo / Mão de obra</th>
                                <th className="py-1 font-medium w-24">Un.</th>
                                <th className="py-1 font-medium w-28">Quantidade</th>
                                <th className="py-1 font-medium w-24">Valor unit.</th>
                                <th className="py-1 font-medium w-24 text-right">Subtotal</th>
                                <th className="py-1 font-medium w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {receitaItens.map((item) => (
                                <tr key={item.id} className="border-t border-slate-200">
                                  <td className="py-1 pr-2">{item.nome}</td>
                                  <td className="py-1 pr-2 text-slate-500">{item.unidade}</td>
                                  <td className="py-1 pr-2">
                                    <input
                                      type="number"
                                      step="0.0001"
                                      value={item.quantidade}
                                      onChange={(e) =>
                                        atualizarQuantidadeReceita(item.id, e.target.value)
                                      }
                                      disabled={!souAdmin}
                                      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  </td>
                                  <td className="py-1 pr-2 text-slate-500">
                                    {formatarMoeda(item.valor_unitario)}
                                  </td>
                                  <td className="py-1 pr-2 text-right font-medium">
                                    {formatarMoeda(Number(item.quantidade || 0) * Number(item.valor_unitario || 0))}
                                  </td>
                                  <td className="py-1 text-right">
                                    {souAdmin && (
                                    <button
                                      onClick={() => removerLinhaReceita(item.id)}
                                      className="text-red-600 hover:text-red-800"
                                      title="Remover"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t border-slate-300">
                                <td colSpan={4} className="py-1 pr-2 text-right font-medium text-slate-500">
                                  Custo total da receita
                                  {c.area_referencia > 0 && ` (÷ ${c.area_referencia}m² de referência)`}
                                </td>
                                <td className="py-1 pr-2 text-right font-semibold">
                                  {formatarMoeda(
                                    (receitaItens.reduce(
                                      (soma, item) =>
                                        soma + Number(item.quantidade || 0) * Number(item.valor_unitario || 0),
                                      0
                                    )) / (c.area_referencia > 0 ? Number(c.area_referencia) : 1)
                                  )}
                                </td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {souAdmin && (
                        <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                          <select
                            value={novoItemTipo}
                            onChange={(e) => {
                              setNovoItemTipo(e.target.value);
                              setNovoItemRefId("");
                            }}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="insumo">Insumo</option>
                            <option value="mao_de_obra">Mão de obra</option>
                          </select>
                          <select
                            value={novoItemRefId}
                            onChange={(e) => setNovoItemRefId(e.target.value)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:col-span-2"
                          >
                            <option value="">
                              {novoItemTipo === "insumo" ? "Selecione o insumo" : "Selecione a função"}
                            </option>
                            {(novoItemTipo === "insumo" ? insumos : maoDeObra).map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {novoItemTipo === "insumo" ? opt.nome : opt.funcao}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.0001"
                              placeholder="Qtd."
                              value={novoItemQtd}
                              onChange={(e) => setNovoItemQtd(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={adicionarLinhaReceita}
                              className="rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium px-3 py-1 transition whitespace-nowrap"
                            >
                              + Item
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => salvarReceita(c.id)}
                          disabled={salvandoReceita}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 transition"
                        >
                          {salvandoReceita ? "Salvando..." : "Salvar receita e recalcular esta peça"}
                        </button>
                        </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
          )}
        </div>
      ))}
      </div>
      )}
    </div>
  );
}

// Porteiro: esta tela é exclusiva de administradores.
export default function PrecosPageProtegida() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <PrecosPage />;
}
