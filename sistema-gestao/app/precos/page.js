"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAPEIS_SUGERIDOS = [
  "TESOURA", "PILAR", "TERCA", "VIGA_TRAVAMENTO", "LAJE",
  "TELHA", "CALHA", "CAPOTE", "MONTAGEM", "FUNDACAO",
];

export default function PrecosPage() {
  const [insumos, setInsumos] = useState([]);
  const [maoDeObra, setMaoDeObra] = useState([]);
  const [composicoes, setComposicoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvandoId, setSalvandoId] = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");

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
      .select("id, codigo, nome, papel, unidade, custo, preco, bdi_pct")
      .order("codigo");
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
    else setMensagem(`${insumo.nome} atualizado.`);
    setSalvandoId(null);
  }

  async function excluirInsumo(insumo) {
    if (!window.confirm(`Excluir o insumo "${insumo.nome}"?`)) return;
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
      setMensagem(`${insumo.nome} excluído.`);
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
      setMensagem("Insumo adicionado.");
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
      setMensagem(`${item.funcao} atualizado.`);
      const { data } = await buscarMaoDeObra();
      if (data) setMaoDeObra(data);
    }
    setSalvandoId(null);
  }

  async function excluirMaoDeObra(item) {
    if (!window.confirm(`Excluir a função "${item.funcao}"?`)) return;
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
      setMensagem(`${item.funcao} excluído.`);
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
      setMensagem("Função adicionada.");
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
    else setMensagem(`${comp.nome} atualizado.`);
    setSalvandoId(null);
  }

  async function excluirComposicao(comp) {
    if (
      !window.confirm(
        `Excluir a peça "${comp.nome}"?\n\nOrçamentos que já usaram essa peça não são afetados — eles guardam o nome/valor de quando foram feitos.`
      )
    )
      return;
    setSalvandoId(comp.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("composicoes_galpao").delete().eq("id", comp.id);
    if (error) {
      setErro("Erro ao excluir: " + error.message);
    } else {
      setMensagem(`${comp.nome} excluída.`);
      setComposicoes((atual) => atual.filter((c) => c.id !== comp.id));
      if (receitaExpandidaId === comp.id) setReceitaExpandidaId(null);
    }
    setSalvandoId(null);
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
    const confirmar = window.confirm(
      "Recalcular vai atualizar o custo/preço de todas as peças que têm receita de insumos, com base nos valores atuais. Peças sem receita (Telha, Montagem, Fundação etc.) não são afetadas. Continuar?"
    );
    if (!confirmar) return;
    setRecalculando(true);
    setErro("");
    setMensagem("");
    const { data, error } = await supabase.rpc("recalcular_todas_composicoes");
    if (error) {
      setErro("Erro ao recalcular: " + error.message);
    } else {
      setMensagem(`${data} composições recalculadas a partir dos insumos/mão de obra atuais.`);
      const { data: novasComposicoes } = await buscarComposicoes();
      if (novasComposicoes) setComposicoes(novasComposicoes);
    }
    setRecalculando(false);
  }

  // ---------- RECEITA DE UMA PEÇA ----------
  function buscarReceita(composicaoId) {
    return supabase
      .from("composicao_itens")
      .select("id, insumo_id, mao_de_obra_id, quantidade, insumos(nome, unidade), mao_de_obra(funcao)")
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
      setMensagem("Receita salva e o preço da peça foi recalculado.");
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

  const campoClasse =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const campoNumero =
    "w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const campoTexto =
    "rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const botaoSalvar = "text-emerald-700 hover:text-emerald-900 disabled:opacity-40 text-xs font-medium";
  const botaoIncluir =
    "text-emerald-700 hover:text-emerald-900 text-xs font-medium flex items-center gap-1";

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
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Insumos (materiais)</p>
        <button onClick={() => setMostrarFormInsumo((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir insumo
        </button>
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
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={i.unidade || ""}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "unidade", e.target.value)}
                    className={campoTexto + " w-20"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={i.valor_unitario}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "valor_unitario", e.target.value)}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MÃO DE OBRA */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Mão de obra</p>
        <button onClick={() => setMostrarFormMaoDeObra((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir função
        </button>
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
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={m.salario_bruto}
                    onChange={(e) => atualizarCampo(maoDeObra, setMaoDeObra, m.id, "salario_bruto", e.target.value)}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="1"
                    value={m.encargos_pct}
                    onChange={(e) => atualizarCampo(maoDeObra, setMaoDeObra, m.id, "encargos_pct", e.target.value)}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </td>
                <td className="px-4 py-2 text-slate-500">{formatarMoeda(m.valor_hora)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-6">
        <button
          onClick={recalcularTudo}
          disabled={recalculando}
          className="rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
        >
          {recalculando ? "Recalculando..." : "Recalcular todas as peças a partir dos insumos/mão de obra acima"}
        </button>
        <p className="text-xs text-slate-400 mt-1">
          Use depois de salvar mudanças de insumo/mão de obra. Peças sem receita (Telha, Calha, Capote, Montagem,
          Fundação, e peças incluídas manualmente) não são afetadas.
        </p>
      </div>

      {/* COMPOSIÇÕES */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Peças de galpão</p>
        <button onClick={() => setMostrarFormComposicao((v) => !v)} className={botaoIncluir}>
          <Plus size={14} /> Incluir peça
        </button>
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
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
          {composicoesFiltradas.map((c) => (
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
                    className={campoTexto + " w-full"}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={c.custo}
                    onChange={(e) =>
                      atualizarCampo(composicoes, setComposicoes, c.id, "custo", e.target.value)
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
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => salvarComposicao(c)}
                      disabled={salvandoId === c.id}
                      className={botaoSalvar}
                    >
                      {salvandoId === c.id ? "..." : "Salvar"}
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
                                      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  </td>
                                  <td className="py-1 text-right">
                                    <button
                                      onClick={() => removerLinhaReceita(item.id)}
                                      className="text-red-600 hover:text-red-800"
                                      title="Remover"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

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
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
