"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Plus } from "lucide-react";
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
          ? `Não é possível excluir "${insumo.nome}": ele é usado na receita de uma ou mais peças. Remova esse uso primeiro.`
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
          ? `Não é possível excluir "${item.funcao}": ela é usada na receita de uma ou mais peças. Remova esse uso primeiro.`
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
    if (!window.confirm(`Excluir a peça "${comp.nome}"?`)) return;
    setSalvandoId(comp.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.from("composicoes_galpao").delete().eq("id", comp.id);
    if (error) {
      setErro(
        error.code === "23503"
          ? `Não é possível excluir "${comp.nome}": ela já foi usada em algum orçamento (ou tem receita própria). Remova esse uso primeiro.`
          : "Erro ao excluir: " + error.message
      );
    } else {
      setMensagem(`${comp.nome} excluída.`);
      setComposicoes((atual) => atual.filter((c) => c.id !== comp.id));
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
    const bdiPct = custo > 0 ? Math.round(((preco / custo - 1) * 100) * 100) / 100 : 0;
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
      setMensagem("Peça adicionada. Como não tem receita de insumos, o preço fica manual (não muda no \"Recalcular\").");
      setNovaComposicao({ nome: "", unidade: "UN", papel: "", custo: "", preco: "" });
      setMostrarFormComposicao(false);
      const { data } = await buscarComposicoes();
      if (data) setComposicoes(data);
    }
    setSalvandoId(null);
  }

  async function recalcularTudo() {
    const confirmar = window.confirm(
      "Recalcular vai atualizar o custo/preço de todas as peças que têm receita de insumos, com base nos valores atuais. Peças sem receita (adicionadas manualmente, Telha, Montagem, Fundação etc.) não são afetadas. Continuar?"
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
          Use depois de salvar mudanças de insumo/mão de obra. Peças sem receita cadastrada (Telha, Calha, Capote,
          Montagem, Fundação, e qualquer peça incluída manualmente aqui) não são afetadas — ajuste o preço delas
          direto na tabela abaixo.
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
          <p className="text-xs text-slate-400">
            Peça incluída aqui entra com preço manual (fixo), sem receita de insumos — como Telha ou Montagem.
          </p>
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
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Custo</th>
              <th className="px-4 py-2 font-medium">Preço de venda</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {composicoesFiltradas.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
