"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar } from "@/components/Ui";

const moeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Custo somado ao vivo da receita (nunca o campo `custo` gravado, que é só
// um cache que fica pra trás sempre que um insumo/salário muda de valor).
// Se area_referencia > 0, o custo vira "por m²" (caso da Laje).
export function custoAoVivo(c) {
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

function mapearItens(composicaoItens) {
  return (composicaoItens || []).map((item, idx) => ({
    id: item.id ?? `existente-${idx}`,
    insumo_id: item.insumo_id ?? null,
    mao_de_obra_id: item.mao_de_obra_id ?? null,
    quantidade: item.quantidade,
    nome: item.insumos?.nome || item.mao_de_obra?.funcao || "?",
    unidade: item.insumos?.unidade || "HORA",
    valor_unitario: item.insumos?.valor_unitario ?? item.mao_de_obra?.valor_hora ?? 0,
  }));
}

// Cartão de uma peça: custo ao vivo -> BDI editável -> preço sugerido,
// com a receita (insumos/mão de obra) expansível pra quem quiser conferir
// ou ajustar as quantidades reais por trás do custo.
export default function CartaoPeca({ composicao: c, insumos, maoDeObra, souAdmin, onSalvo }) {
  const [aberto, setAberto] = useState(false);
  const [receitaItens, setReceitaItens] = useState(() => mapearItens(c.composicao_itens));
  const [novoTipo, setNovoTipo] = useState("insumo");
  const [novoRefId, setNovoRefId] = useState("");
  const [novoQtd, setNovoQtd] = useState("");
  const [salvandoReceita, setSalvandoReceita] = useState(false);
  const [bdi, setBdi] = useState(String(c.bdi_pct ?? "0").replace(".", ","));
  const [precoManual, setPrecoManual] = useState(String(c.preco ?? "0").replace(".", ","));
  const [salvandoPreco, setSalvandoPreco] = useState(false);
  const [nome, setNome] = useState(c.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    setReceitaItens(mapearItens(c.composicao_itens));
    setBdi(String(c.bdi_pct ?? "0").replace(".", ","));
    setPrecoManual(String(c.preco ?? "0").replace(".", ","));
    setNome(c.nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.composicao_itens, c.bdi_pct, c.preco, c.nome]);

  const temReceita = (c.composicao_itens || []).length > 0;
  const custo = custoAoVivo(c);
  const bdiNum = Number(String(bdi).replace(",", ".")) || 0;
  const precoSugerido = Math.round(custo * (1 + bdiNum / 100) * 100) / 100;
  const precoAtual = Number(c.preco) || 0;
  const desalinhado = temReceita && Math.abs(precoSugerido - precoAtual) > 0.01;

  function adicionarLinha() {
    if (!novoRefId || novoQtd === "") {
      notificar("Selecione o insumo/função e informe a quantidade.", "erro");
      return;
    }
    if (novoTipo === "insumo") {
      const ins = insumos.find((i) => String(i.id) === String(novoRefId));
      if (!ins) return;
      setReceitaItens((atual) => [
        ...atual,
        {
          id: `novo-${Date.now()}`,
          insumo_id: ins.id,
          mao_de_obra_id: null,
          quantidade: Number(novoQtd) || 0,
          nome: ins.nome,
          unidade: ins.unidade,
          valor_unitario: Number(ins.valor_unitario) || 0,
        },
      ]);
    } else {
      const m = maoDeObra.find((i) => String(i.id) === String(novoRefId));
      if (!m) return;
      setReceitaItens((atual) => [
        ...atual,
        {
          id: `novo-${Date.now()}`,
          insumo_id: null,
          mao_de_obra_id: m.id,
          quantidade: Number(novoQtd) || 0,
          nome: m.funcao,
          unidade: "HORA",
          valor_unitario: Number(m.valor_hora) || 0,
        },
      ]);
    }
    setNovoRefId("");
    setNovoQtd("");
  }

  function removerLinha(id) {
    setReceitaItens((atual) => atual.filter((i) => i.id !== id));
  }

  function atualizarQtd(id, valor) {
    setReceitaItens((atual) =>
      atual.map((i) => (i.id === id ? { ...i, quantidade: valor } : i))
    );
  }

  async function salvarReceita() {
    setSalvandoReceita(true);
    const { error: eDel } = await supabase
      .from("composicao_itens")
      .delete()
      .eq("composicao_produto_id", c.id);
    if (eDel) {
      notificar("Erro ao salvar receita: " + eDel.message, "erro");
      setSalvandoReceita(false);
      return;
    }
    if (receitaItens.length > 0) {
      const payload = receitaItens.map((i) => ({
        composicao_produto_id: c.id,
        insumo_id: i.insumo_id,
        mao_de_obra_id: i.mao_de_obra_id,
        quantidade: Number(i.quantidade) || 0,
      }));
      const { error: eIns } = await supabase.from("composicao_itens").insert(payload);
      if (eIns) {
        notificar("Erro ao salvar receita: " + eIns.message, "erro");
        setSalvandoReceita(false);
        return;
      }
    }
    notificar(`Receita de "${c.nome}" salva.`);
    setSalvandoReceita(false);
    onSalvo();
  }

  async function salvarNome() {
    if (!nome.trim()) {
      notificar("O nome não pode ficar em branco.", "erro");
      return;
    }
    setSalvandoNome(true);
    const { error } = await supabase
      .from("composicoes_galpao")
      .update({ nome: nome.trim() })
      .eq("id", c.id);
    if (error) notificar("Erro ao salvar nome: " + error.message, "erro");
    else {
      notificar("Nome atualizado.");
      onSalvo();
    }
    setSalvandoNome(false);
  }

  // Mesma regra de app/precos/page.js: a FK de itens_orcamento_galpao/itens_venda
  // pra composicoes_galpao e ON DELETE SET NULL — apagar uma peça ja usada
  // faria esses itens virarem "Item removido" ao reabrir. Por isso checamos
  // uso real antes de oferecer exclusao fisica.
  async function excluirOuDesativar() {
    const [resOrc, resVenda] = await Promise.all([
      supabase
        .from("itens_orcamento_galpao")
        .select("id", { count: "exact", head: true })
        .eq("composicao_id", c.id),
      supabase
        .from("itens_venda")
        .select("id", { count: "exact", head: true })
        .eq("composicao_id", c.id),
    ]);
    const usos = (resOrc.count || 0) + (resVenda.count || 0);

    if (usos > 0) {
      const ok = await confirmar({
        titulo: "Peça já usada em orçamento/venda",
        texto: `"${c.nome}" já foi usada em ${usos} item(ns) real(is) — excluir faria esses itens perderem o nome/preço ao reabrir. Em vez de excluir, desative: ela some da lista, mas continua existindo para os itens antigos.`,
        confirmarTexto: "Desativar",
        perigoso: true,
      });
      if (!ok) return;
      setExcluindo(true);
      const { error } = await supabase.from("composicoes_galpao").update({ ativo: false }).eq("id", c.id);
      if (error) notificar("Erro ao desativar: " + error.message, "erro");
      else {
        notificar(`${c.nome} desativada.`);
        onSalvo();
      }
      setExcluindo(false);
      return;
    }

    const ok = await confirmar({
      titulo: "Excluir peça?",
      texto: `"${c.nome}" será removida definitivamente — ela nunca foi usada em nenhum orçamento ou venda.`,
      confirmarTexto: "Excluir",
      perigoso: true,
    });
    if (!ok) return;
    setExcluindo(true);
    const { error } = await supabase.from("composicoes_galpao").delete().eq("id", c.id);
    if (error) notificar("Erro ao excluir: " + error.message, "erro");
    else {
      notificar(`${c.nome} excluída.`);
      onSalvo();
    }
    setExcluindo(false);
  }

  async function aplicarPreco() {
    setSalvandoPreco(true);
    const novoPreco = temReceita ? precoSugerido : Number(String(precoManual).replace(",", ".")) || 0;
    const { error } = await supabase
      .from("composicoes_galpao")
      .update({ preco: novoPreco, bdi_pct: temReceita ? bdiNum : 0 })
      .eq("id", c.id);
    if (error) {
      notificar("Erro ao aplicar preço: " + error.message, "erro");
    } else {
      notificar(`Preço de "${c.nome}" atualizado para ${moeda(novoPreco)}.`);
      onSalvo();
    }
    setSalvandoPreco(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="shrink-0 text-slate-400 hover:text-slate-700"
          title={aberto ? "Recolher" : "Expandir"}
        >
          {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome.trim() !== c.nome && salvarNome()}
          disabled={!souAdmin || salvandoNome}
          className="min-w-0 flex-1 rounded-lg border border-transparent hover:border-slate-300 focus:border-slate-300 px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {!temReceita && (
          <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5">
            sem receita
          </span>
        )}
        {desalinhado && (
          <span
            className="shrink-0 rounded-full bg-red-100 text-red-700 text-[10px] font-medium px-2 py-0.5"
            title="O preço gravado não bate mais com custo x BDI atual — algum insumo/salário mudou desde a última vez que o preço foi aplicado."
          >
            preço desatualizado
          </span>
        )}
        <div className="shrink-0 text-right text-xs text-slate-500">
          custo <b className="text-slate-700">{moeda(custo)}</b>
          {c.area_referencia > 0 && "/m²"}
          {" · "}
          preço <b className="text-slate-700">{moeda(precoAtual)}</b>
          {c.unidade === "M2" && "/m²"}
        </div>
        {souAdmin && (
          <button
            type="button"
            onClick={excluirOuDesativar}
            disabled={excluindo}
            className="shrink-0 text-red-600 hover:text-red-800 disabled:opacity-40"
            title="Excluir (ou desativar, se já usada em orçamento/venda)"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {aberto && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {temReceita || receitaItens.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-1 font-medium">Insumo / Mão de obra</th>
                  <th className="py-1 font-medium w-24">Un.</th>
                  <th className="py-1 font-medium w-24">Quantidade</th>
                  <th className="py-1 font-medium w-24">Valor unit.</th>
                  <th className="py-1 font-medium w-24 text-right">Subtotal</th>
                  <th className="py-1 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {receitaItens.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2">{item.nome}</td>
                    <td className="py-1 pr-2 text-slate-500">{item.unidade}</td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="0.0001"
                        value={item.quantidade}
                        onChange={(e) => atualizarQtd(item.id, e.target.value)}
                        disabled={!souAdmin}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="py-1 pr-2 text-slate-500">{moeda(item.valor_unitario)}</td>
                    <td className="py-1 pr-2 text-right font-medium">
                      {moeda(Number(item.quantidade || 0) * Number(item.valor_unitario || 0))}
                    </td>
                    <td className="py-1 text-right">
                      {souAdmin && (
                        <button
                          onClick={() => removerLinha(item.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-400">
              Sem receita cadastrada — não dá pra calcular custo de verdade, o preço abaixo é digitado direto.
            </p>
          )}

          {souAdmin && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select
                  value={novoTipo}
                  onChange={(e) => {
                    setNovoTipo(e.target.value);
                    setNovoRefId("");
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="insumo">Insumo</option>
                  <option value="mao_de_obra">Mão de obra</option>
                </select>
                <select
                  value={novoRefId}
                  onChange={(e) => setNovoRefId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:col-span-2"
                >
                  <option value="">
                    {novoTipo === "insumo" ? "Selecione o insumo" : "Selecione a função"}
                  </option>
                  {(novoTipo === "insumo" ? insumos : maoDeObra).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {novoTipo === "insumo" ? opt.nome : opt.funcao}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Qtd."
                    value={novoQtd}
                    onChange={(e) => setNovoQtd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={adicionarLinha}
                    className="rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium px-3 py-1 transition whitespace-nowrap"
                  >
                    + Item
                  </button>
                </div>
              </div>
              <button
                onClick={salvarReceita}
                disabled={salvandoReceita}
                className="rounded-lg bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 transition"
              >
                {salvandoReceita ? "Salvando..." : "Salvar receita"}
              </button>

              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex flex-wrap items-end gap-3">
                {temReceita ? (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Custo ao vivo</label>
                      <p className="text-sm font-medium text-slate-700">
                        {moeda(custo)}
                        {c.area_referencia > 0 && "/m²"}
                      </p>
                    </div>
                    <div className="w-24">
                      <label className="block text-[11px] text-slate-500 mb-1">BDI (%)</label>
                      <input
                        type="text"
                        value={bdi}
                        onChange={(e) => setBdi(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Preço sugerido</label>
                      <p className="text-sm font-semibold text-emerald-700">
                        {moeda(precoSugerido)}
                        {c.area_referencia > 0 && "/m²"}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="w-32">
                    <label className="block text-[11px] text-slate-500 mb-1">Preço (R$)</label>
                    <input
                      type="text"
                      value={precoManual}
                      onChange={(e) => setPrecoManual(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
                <button
                  onClick={aplicarPreco}
                  disabled={salvandoPreco}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 transition"
                >
                  {salvandoPreco ? "Aplicando..." : "Aplicar preço"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
