"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

  function buscarInsumos() {
    return supabase.from("insumos").select("id, codigo, nome, unidade, valor_unitario").order("nome");
  }
  function buscarMaoDeObra() {
    return supabase.from("mao_de_obra").select("id, codigo, funcao, salario_bruto, encargos_pct, valor_hora").order("funcao");
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

  async function salvarInsumo(insumo) {
    setSalvandoId(insumo.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("insumos")
      .update({ valor_unitario: Number(insumo.valor_unitario) || 0 })
      .eq("id", insumo.id);
    if (error) setErro("Erro ao salvar: " + error.message);
    else setMensagem(`${insumo.nome} atualizado.`);
    setSalvandoId(null);
  }

  async function salvarMaoDeObra(item) {
    setSalvandoId(item.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("mao_de_obra")
      .update({ salario_bruto: Number(item.salario_bruto) || 0, encargos_pct: Number(item.encargos_pct) || 0 })
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

  async function salvarComposicao(comp) {
    setSalvandoId(comp.id);
    setErro("");
    setMensagem("");
    const { error } = await supabase
      .from("composicoes_galpao")
      .update({ custo: Number(comp.custo) || 0, preco: Number(comp.preco) || 0 })
      .eq("id", comp.id);
    if (error) setErro("Erro ao salvar: " + error.message);
    else setMensagem(`${comp.nome} atualizado.`);
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

  const composicoesFiltradas = composicoes.filter((c) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return c.nome.toLowerCase().includes(termo) || (c.papel || "").toLowerCase().includes(termo);
  });

  const campoNumero =
    "w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const botaoSalvar =
    "text-emerald-700 hover:text-emerald-900 disabled:opacity-40 text-xs font-medium";

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
        Ajuste o preço de insumos, mão de obra e peças de galpão. Cada linha se salva sozinha.
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
      <p className="text-sm font-semibold text-slate-700 mb-2">Insumos (materiais)</p>
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
                <td className="px-4 py-2 font-medium">{i.nome}</td>
                <td className="px-4 py-2 text-slate-500">{i.unidade}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={i.valor_unitario}
                    onChange={(e) => atualizarCampo(insumos, setInsumos, i.id, "valor_unitario", e.target.value)}
                    className={campoNumero}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => salvarInsumo(i)}
                    disabled={salvandoId === i.id}
                    className={botaoSalvar}
                  >
                    {salvandoId === i.id ? "Salvando..." : "Salvar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MÃO DE OBRA */}
      <p className="text-sm font-semibold text-slate-700 mb-2">Mão de obra</p>
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
                <td className="px-4 py-2 font-medium">{m.funcao}</td>
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
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => salvarMaoDeObra(m)}
                    disabled={salvandoId === m.id}
                    className={botaoSalvar}
                  >
                    {salvandoId === m.id ? "Salvando..." : "Salvar"}
                  </button>
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
          Montagem, Fundação) não são afetadas — ajuste o preço delas direto na tabela abaixo.
        </p>
      </div>

      {/* COMPOSIÇÕES */}
      <p className="text-sm font-semibold text-slate-700 mb-2">Peças de galpão</p>
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
                <td className="px-4 py-2 font-medium">{c.nome}</td>
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
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => salvarComposicao(c)}
                    disabled={salvandoId === c.id}
                    className={botaoSalvar}
                  >
                    {salvandoId === c.id ? "Salvando..." : "Salvar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
