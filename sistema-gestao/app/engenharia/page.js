"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Calculator } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  useSouAdmin,
  AcessoRestrito,
  notificar,
  confirmar,
  LinhasEsqueleto,
} from "@/components/Ui";

// =====================================================================
// ENGENHARIA DE CUSTOS
// Traco do concreto (referencia unica), regras de fundacao do pilar,
// ferragem por faixa (altura livre x vao) e simulador de custo da peca.
// =====================================================================

const moeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Campos de digitacao sempre com virgula (padrao brasileiro)
const txt = (v) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(".", ",");

const num = (v, c = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

const campoClasse =
  "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const cardClasse = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

function EngenhariaPage() {
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState([]);
  const [traco, setTraco] = useState(null);
  const [itensTraco, setItensTraco] = useState([]);
  const [fundacoes, setFundacoes] = useState([]);
  const [faixas, setFaixas] = useState([]);
  const [faixaAberta, setFaixaAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [formAltura, setFormAltura] = useState(null);
  const [formVao, setFormVao] = useState(null);
  const [atividades, setAtividades] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [param, setParam] = useState(null);

  const [simPe, setSimPe] = useState("7,5");
  const [simVao, setSimVao] = useState("16");
  const [simLaje, setSimLaje] = useState(false);
  const [sim, setSim] = useState(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const [rIns, rTraco, rFund, rFaixas] = await Promise.all([
      supabase
        .from("insumos")
        .select("id, nome, unidade, valor_unitario, kg_por_unidade, bitola_mm, kg_por_metro")
        .order("nome"),
      supabase
        .from("traco_concreto")
        .select("id, nome, resistencia_mpa, densidade_kg_m3, traco_item(id, insumo_id, kg_por_m3)")
        .eq("ativo", true)
        .limit(1),
      supabase.from("fundacao_regra").select("*").order("com_laje").order("altura_ate"),
      supabase
        .from("armadura_faixa")
        .select(
          "id, papel, altura_min, altura_max, vao_min, vao_max, observacao, armadura_faixa_item(id, tipo, insumo_id, quantidade, acrescimo_m, espacamento_cm, perimetro_m)"
        )
        .eq("ativo", true)
        .order("papel")
        .order("altura_min")
        .order("vao_min"),
    ]);
    setInsumos(rIns.data || []);
    const t = (rTraco.data || [])[0] || null;
    setTraco(t);
    setItensTraco(t ? (t.traco_item || []).map((i) => ({ ...i })) : []);
    setFundacoes(rFund.data || []);
    setFaixas(rFaixas.data || []);
    const [rAtiv, rEq, rFun] = await Promise.all([
      supabase.from("mao_obra_atividade").select("*").order("ordem"),
      supabase.from("mao_obra_equipe").select("id, papel, quantidade, mao_de_obra_id").order("id"),
      supabase.from("mao_de_obra").select("id, funcao, valor_hora").order("funcao"),
    ]);
    setAtividades(rAtiv.data || []);
    setEquipe(rEq.data || []);
    setFuncoes(rFun.data || []);
    const rPar = await supabase.from("parametros_engenharia").select("*").order("id").limit(1);
    setParam((rPar.data || [])[0] || null);
    setLoading(false);
  }
  const acos = insumos.filter((i) => i.bitola_mm);
  const insumoPorId = (id) => insumos.find((i) => i.id === id);

  // Custo de 1 m3: converte kg do traco para a unidade de compra do insumo
  const custoM3 = itensTraco.reduce((s, it) => {
    const ins = insumoPorId(it.insumo_id);
    if (!ins) return s;
    const kgUn = Number(ins.kg_por_unidade) || 1;
    return s + ((Number(it.kg_por_m3) || 0) / kgUn) * (Number(ins.valor_unitario) || 0);
  }, 0);

  const somaTraco = itensTraco.reduce((s, i) => s + (Number(i.kg_por_m3) || 0), 0);

  async function salvarTraco() {
    setSalvando(true);
    for (const it of itensTraco) {
      await supabase
        .from("traco_item")
        .update({ kg_por_m3: Number(String(it.kg_por_m3).replace(",", ".")) || 0 })
        .eq("id", it.id);
    }
    setSalvando(false);
    notificar("Traco salvo. O novo custo do m3 ja vale para todas as pecas.");
  }

  async function salvarConversao(insumoId, valor) {
    const v = Number(String(valor).replace(",", ".")) || null;
    setInsumos((a) => a.map((i) => (i.id === insumoId ? { ...i, kg_por_unidade: v } : i)));
    await supabase.from("insumos").update({ kg_por_unidade: v }).eq("id", insumoId);
  }

  async function salvarFundacao(id, valor) {
    const v = Number(String(valor).replace(",", ".")) || 0;
    setFundacoes((a) => a.map((f) => (f.id === id ? { ...f, profundidade_m: v } : f)));
    await supabase.from("fundacao_regra").update({ profundidade_m: v }).eq("id", id);
  }

  async function adicionarItemFaixa(faixaId, tipo) {
    const aco = acos[0];
    if (!aco) {
      notificar("Cadastre os acos em Precos antes.", "erro");
      return;
    }
    const base =
      tipo === "ESTRIBO"
        ? { faixa_id: faixaId, tipo, insumo_id: aco.id, espacamento_cm: 15, perimetro_m: 1.2 }
        : { faixa_id: faixaId, tipo, insumo_id: aco.id, quantidade: 4, acrescimo_m: 0 };
    const { data, error } = await supabase
      .from("armadura_faixa_item")
      .insert(base)
      .select()
      .single();
    if (error) {
      notificar("Erro ao adicionar: " + error.message, "erro");
      return;
    }
    setFaixas((a) =>
      a.map((f) =>
        f.id === faixaId
          ? { ...f, armadura_faixa_item: [...(f.armadura_faixa_item || []), data] }
          : f
      )
    );
  }

  async function atualizarItemFaixa(faixaId, itemId, campo, valor) {
    setFaixas((a) =>
      a.map((f) =>
        f.id === faixaId
          ? {
              ...f,
              armadura_faixa_item: f.armadura_faixa_item.map((i) =>
                i.id === itemId ? { ...i, [campo]: valor } : i
              ),
            }
          : f
      )
    );
    const v = valor === "" ? null : Number(String(valor).replace(",", "."));
    await supabase.from("armadura_faixa_item").update({ [campo]: v }).eq("id", itemId);
  }

  async function removerItemFaixa(faixaId, itemId) {
    await supabase.from("armadura_faixa_item").delete().eq("id", itemId);
    setFaixas((a) =>
      a.map((f) =>
        f.id === faixaId
          ? { ...f, armadura_faixa_item: f.armadura_faixa_item.filter((i) => i.id !== itemId) }
          : f
      )
    );
  }

  async function salvarParametro(campo, valor) {
    if (!param) return;
    const v = campo === "modo_calculo_pilar" ? valor : Number(String(valor).replace(",", ".")) || 0;
    setParam((p) => ({ ...p, [campo]: v }));
    await supabase.from("parametros_engenharia").update({ [campo]: v }).eq("id", param.id);
    notificar("Parametro salvo.");
  }

  async function salvarAtividade(id, campo, valor) {
    const v = campo === "tipo" ? valor : Number(String(valor).replace(",", ".")) || 0;
    setAtividades((a) => a.map((x) => (x.id === id ? { ...x, [campo]: v } : x)));
    await supabase.from("mao_obra_atividade").update({ [campo]: v }).eq("id", id);
  }

  async function salvarEquipe(id, valor) {
    const v = Number(String(valor).replace(",", ".")) || 0;
    setEquipe((a) => a.map((x) => (x.id === id ? { ...x, quantidade: v } : x)));
    await supabase.from("mao_obra_equipe").update({ quantidade: v }).eq("id", id);
  }

  async function salvarSecaoFaixa(faixaId, campo, valor) {
    const v = Number(String(valor).replace(",", ".")) || null;
    setFaixas((a) => a.map((f) => (f.id === faixaId ? { ...f, [campo]: v } : f)));
    await supabase.from("armadura_faixa").update({ [campo]: v }).eq("id", faixaId);
  }

  // Tempo total da peca conforme os tempos medidos (fixo + por metro)
  function minutosDaPeca(comprimento) {
    const fixo = atividades
      .filter((a) => a.papel === "PILAR" && a.tipo === "FIXO")
      .reduce((s, a) => s + (Number(a.minutos) || 0), 0);
    const porMetro = atividades
      .filter((a) => a.papel === "PILAR" && a.tipo === "POR_METRO")
      .reduce((s, a) => s + (Number(a.minutos) || 0) / (Number(a.referencia_m) || 1), 0);
    return fixo + porMetro * (Number(comprimento) || 0);
  }

  const equipePilar = equipe.filter((e) => e.papel === "PILAR");
  const pessoasTotal = equipePilar.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
  const custoHoraEquipe = equipePilar.reduce((s, e) => {
    const f = funcoes.find((x) => x.id === e.mao_de_obra_id);
    return s + (Number(e.quantidade) || 0) * (Number(f?.valor_hora) || 0);
  }, 0);

  // As faixas sao livres: da para incluir alturas e vaos alem dos padroes
  async function criarFaixaAltura() {
    const min = Number(String(formAltura.min).replace(",", "."));
    const max = Number(String(formAltura.max).replace(",", "."));
    if (!min || !max || max <= min) {
      notificar("Informe a altura de e ate (a segunda maior que a primeira).", "erro");
      return;
    }
    const linhas = vaos.map((v) => {
      const f = faixasPilar.find((x) => x.vao_min === v);
      return {
        papel: "PILAR",
        altura_min: min,
        altura_max: max,
        vao_min: v,
        vao_max: f ? f.vao_max : v,
      };
    });
    if (linhas.length === 0) {
      notificar("Crie ao menos uma faixa de vao antes.", "erro");
      return;
    }
    const { error } = await supabase.from("armadura_faixa").insert(linhas);
    if (error) {
      notificar("Erro: " + error.message, "erro");
      return;
    }
    setFormAltura(null);
    await carregar();
    notificar("Faixa de altura adicionada.");
  }

  async function criarFaixaVao() {
    const min = Number(String(formVao.min).replace(",", "."));
    const max = Number(String(formVao.max).replace(",", "."));
    if (!min || !max || max <= min) {
      notificar("Informe o vao de e ate (o segundo maior que o primeiro).", "erro");
      return;
    }
    const linhas = alturas.map((a) => {
      const f = faixasPilar.find((x) => x.altura_min === a);
      return {
        papel: "PILAR",
        altura_min: a,
        altura_max: f ? f.altura_max : a,
        vao_min: min,
        vao_max: max,
      };
    });
    linhas.push({ papel: "TESOURA", vao_min: min, vao_max: max });
    const { error } = await supabase.from("armadura_faixa").insert(linhas);
    if (error) {
      notificar("Erro: " + error.message, "erro");
      return;
    }
    setFormVao(null);
    await carregar();
    notificar("Faixa de vao adicionada (pilar e tesoura).");
  }

  async function removerFaixaAltura(min) {
    const ok = await confirmar({
      titulo: "Remover esta faixa de altura?",
      texto: "A ferragem lancada nesta linha sera apagada.",
      perigoso: true,
    });
    if (!ok) return;
    await supabase.from("armadura_faixa").delete().eq("papel", "PILAR").eq("altura_min", min);
    setFaixaAberta(null);
    await carregar();
  }

  async function removerFaixaVao(min) {
    const ok = await confirmar({
      titulo: "Remover esta faixa de vao?",
      texto: "A ferragem desta coluna (pilar e tesoura) sera apagada.",
      perigoso: true,
    });
    if (!ok) return;
    await supabase.from("armadura_faixa").delete().eq("vao_min", min);
    setFaixaAberta(null);
    await carregar();
  }
  // Resumo curto da ferragem para mostrar na celula da matriz
  function resumoFaixa(f) {
    const itens = f.armadura_faixa_item || [];
    if (itens.length === 0) return null;
    return itens
      .map((i) => {
        const ins = insumoPorId(i.insumo_id);
        const bit = ins && ins.bitola_mm ? String(ins.bitola_mm).replace(".", ",") : "?";
        return i.tipo === "ESTRIBO"
          ? "est " + bit + " c/" + num(i.espacamento_cm, 0)
          : num(i.quantidade, 0) + " x " + bit;
      })
      .join(" + ");
  }

  async function simular() {
    const pe = Number(String(simPe).replace(",", "."));
    const vao = Number(String(simVao).replace(",", "."));
    if (!pe || !vao) {
      notificar("Informe o pe-direito e o vao.", "erro");
      return;
    }
    const { data, error } = await supabase.rpc("calcular_pilar", {
      pe_direito_input: pe,
      vao_input: vao,
      com_laje_input: simLaje,
    });
    if (error) {
      notificar("Erro no calculo: " + error.message, "erro");
      return;
    }
    setSim(data);
  }

  const faixasPilar = faixas.filter((f) => f.papel === "PILAR");
  const faixasTesoura = faixas.filter((f) => f.papel === "TESOURA");
  const alturas = [...new Set(faixasPilar.map((f) => f.altura_min))].sort((a, b) => a - b);
  const vaos = [...new Set(faixasPilar.map((f) => f.vao_min))].sort((a, b) => a - b);
  return (
    <div>
      <Link
        href="/precos"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft size={15} /> Voltar para Precos
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Engenharia de custos</h1>
      <p className="text-sm text-slate-500 mb-6">
        O traco vale para todas as pecas: mudou o preco de um insumo, o custo de tudo se ajusta.
      </p>

      {loading ? (
        <div className={cardClasse}>
          <LinhasEsqueleto linhas={6} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* ---------- MODO DE CALCULO ---------- */}
          {param && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-1">Como o pilar e calculado</p>
              <p className="text-xs text-slate-500 mb-3">
                Pelo valor do m3 de concreto armado (rapido, o numero validado no caixa) ou pela
                composicao detalhada (concreto + aco + mao de obra). O volume sempre sai do
                calculo: fundacao somada e secao da peca.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Modo</label>
                  <select
                    value={param.modo_calculo_pilar}
                    onChange={(e) => salvarParametro("modo_calculo_pilar", e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="M3">Pelo valor do m3 de concreto armado</option>
                    <option value="DETALHADO">Pela composicao detalhada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Valor do m3 armado (R$)</label>
                  <input
                    type="text"
                    defaultValue={txt(param.valor_m3_armado)}
                    onBlur={(e) => salvarParametro("valor_m3_armado", e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500 pb-2">
                  Exemplo: pilar de 0,73 m3 sai por{" "}
                  <b>{moeda(0.73 * (Number(param.valor_m3_armado) || 0))}</b>
                </p>
              </div>
            </div>
          )}

          {/* ---------- 1. TRACO DO CONCRETO ---------- */}
          <div className={cardClasse}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-700">
                Traco do concreto {traco ? "- " + traco.nome : ""}
              </p>
              <p className="text-sm">
                <span className="text-slate-500">Custo de 1 m3: </span>
                <b className="text-emerald-700 text-lg">{moeda(custoM3)}</b>
              </p>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Quantidades em kg por m3 (laudo do laboratorio). A coluna kg por unidade converte
              para a unidade de compra: lata, litro ou kg.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Insumo</th>
                    <th className="text-left px-2 py-2 font-medium">kg por m3</th>
                    <th className="text-left px-2 py-2 font-medium">kg por unidade</th>
                    <th className="text-left px-2 py-2 font-medium">Consumo</th>
                    <th className="text-right px-2 py-2 font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itensTraco.map((it) => {
                    const ins = insumoPorId(it.insumo_id);
                    if (!ins) return null;
                    const kgUn = Number(ins.kg_por_unidade) || 1;
                    const consumo = (Number(it.kg_por_m3) || 0) / kgUn;
                    const custo = consumo * (Number(ins.valor_unitario) || 0);
                    return (
                      <tr key={it.id}>
                        <td className="px-2 py-2 text-slate-700">
                          {ins.nome}
                          <span className="text-xs text-slate-400">
                            {" "}({moeda(ins.valor_unitario)}/{ins.unidade})
                          </span>
                        </td>
                        <td className="px-2 py-1.5 w-28">
                          <input
                            type="text"
                            value={txt(it.kg_por_m3)}
                            onChange={(e) =>
                              setItensTraco((a) =>
                                a.map((x) => (x.id === it.id ? { ...x, kg_por_m3: e.target.value } : x))
                              )
                            }
                            className={campoClasse}
                          />
                        </td>
                        <td className="px-2 py-1.5 w-28">
                          <input
                            type="text"
                            defaultValue={txt(ins.kg_por_unidade)}
                            onBlur={(e) => salvarConversao(ins.id, e.target.value)}
                            className={campoClasse}
                          />
                        </td>
                        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                          {num(consumo)} {ins.unidade}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">
                          {moeda(custo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td className="px-2 py-2 text-xs text-slate-500">
                      Soma: {num(somaTraco, 2)} kg/m3
                      {traco && traco.densidade_kg_m3
                        ? " (densidade do laudo: " + num(traco.densidade_kg_m3, 2) + ")"
                        : ""}
                    </td>
                    <td colSpan={3}></td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{moeda(custoM3)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button
              type="button"
              onClick={salvarTraco}
              disabled={salvando}
              className="mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition"
            >
              {salvando ? "Salvando..." : "Salvar traco"}
            </button>
          </div>

          {/* ---------- 2. FUNDACAO ---------- */}
          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Fundacao do pilar</p>
            <p className="text-xs text-slate-500 mb-3">
              A altura informada no orcamento e o pe-direito LIVRE. O trecho enterrado entra no
              comprimento da peca (concreto e ferragem).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[false, true].map((laje) => (
                <div key={String(laje)}>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">
                    {laje ? "Galpao COM laje" : "Galpao SEM laje"}
                  </p>
                  <div className="space-y-1.5">
                    {fundacoes
                      .filter((f) => f.com_laje === laje)
                      .map((f) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 flex-1">
                            {f.altura_ate >= 900
                              ? "acima da faixa anterior"
                              : "pe-direito ate " + num(f.altura_ate, 2) + " m"}
                          </span>
                          <input
                            type="text"
                            defaultValue={txt(f.profundidade_m)}
                            onBlur={(e) => salvarFundacao(f.id, e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="text-xs text-slate-400">m</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* ---------- 3. MATRIZ DE FERRAGEM DO PILAR ---------- */}
          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Ferragem do pilar por faixa</p>
            <p className="text-xs text-slate-500 mb-3">
              Clique na celula para lancar as barras e os estribos daquela combinacao.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 rounded-lg">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Altura livre</th>
                    {vaos.map((v) => {
                      const f = faixasPilar.find((x) => x.vao_min === v);
                      return (
                        <th key={v} className="text-left px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Vao {num(v, 0)}-{num(f ? f.vao_max : 0, 0)} m
                            <button
                              type="button"
                              onClick={() => removerFaixaVao(v)}
                              className="text-slate-300 hover:text-red-500"
                              title="Remover esta faixa de vao"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alturas.map((a) => {
                    const linha = faixasPilar.filter((f) => f.altura_min === a);
                    const amax = linha[0] ? linha[0].altura_max : 0;
                    return (
                      <tr key={a}>
                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {num(a, 0)} a {num(amax, 0)} m
                            <button
                              type="button"
                              onClick={() => removerFaixaAltura(a)}
                              className="text-slate-300 hover:text-red-500"
                              title="Remover esta faixa de altura"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        </td>
                        {vaos.map((v) => {
                          const f = faixasPilar.find((x) => x.altura_min === a && x.vao_min === v);
                          if (!f)
                            return (
                              <td key={v} className="px-3 py-2 text-slate-300">
                                -
                              </td>
                            );
                          const resumo = resumoFaixa(f);
                          const aberta = faixaAberta === f.id;
                          return (
                            <td key={v} className="px-2 py-1.5 align-top">
                              <button
                                type="button"
                                onClick={() => setFaixaAberta(aberta ? null : f.id)}
                                className={
                                  "w-full text-left rounded-lg px-2 py-1.5 text-xs transition " +
                                  (aberta
                                    ? "bg-emerald-600 text-white"
                                    : resumo
                                    ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                    : "bg-slate-50 text-slate-400 hover:bg-slate-100")
                                }
                              >
                                {resumo || "cadastrar"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Faixas sao livres: inclua alturas e vaos conforme a demanda */}
            <div className="flex flex-wrap items-end gap-2 mt-3">
              {formAltura ? (
                <div className="flex items-end gap-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                  <div>
                    <label className="block text-[10px] text-slate-500">Altura de (m)</label>
                    <input
                      type="text"
                      value={formAltura.min}
                      onChange={(e) => setFormAltura({ ...formAltura, min: e.target.value })}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">ate (m)</label>
                    <input
                      type="text"
                      value={formAltura.max}
                      onChange={(e) => setFormAltura({ ...formAltura, max: e.target.value })}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={criarFaixaAltura}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                  >
                    Criar linha
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAltura(null)}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setFormAltura({ min: "", max: "" })}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5"
                >
                  <Plus size={13} /> Nova faixa de altura
                </button>
              )}

              {formVao ? (
                <div className="flex items-end gap-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                  <div>
                    <label className="block text-[10px] text-slate-500">Vao de (m)</label>
                    <input
                      type="text"
                      value={formVao.min}
                      onChange={(e) => setFormVao({ ...formVao, min: e.target.value })}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">ate (m)</label>
                    <input
                      type="text"
                      value={formVao.max}
                      onChange={(e) => setFormVao({ ...formVao, max: e.target.value })}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={criarFaixaVao}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                  >
                    Criar coluna
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormVao(null)}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setFormVao({ min: "", max: "" })}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5"
                >
                  <Plus size={13} /> Nova faixa de vao (pilar e tesoura)
                </button>
              )}
            </div>

            {faixaAberta &&
              faixas
                .filter((f) => f.id === faixaAberta)
                .map((f) => (
                  <div
                    key={f.id}
                    className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                      {f.papel === "PILAR"
                        ? "Pilar de " +
                          num(f.altura_min, 0) +
                          " a " +
                          num(f.altura_max, 0) +
                          " m - vao " +
                          num(f.vao_min, 0) +
                          " a " +
                          num(f.vao_max, 0) +
                          " m"
                        : "Tesoura - vao " + num(f.vao_min, 0) + " a " + num(f.vao_max, 0) + " m"}
                    </p>
                    {f.papel === "PILAR" && (
                      <div className="flex items-end gap-2 mb-3">
                        <div>
                          <label className="block text-[10px] text-slate-500">Secao: largura (m)</label>
                          <input
                            type="text"
                            defaultValue={txt(f.secao_largura_m)}
                            onBlur={(e) => salvarSecaoFaixa(f.id, "secao_largura_m", e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">altura (m)</label>
                          <input
                            type="text"
                            defaultValue={txt(f.secao_altura_m)}
                            onBlur={(e) => salvarSecaoFaixa(f.id, "secao_altura_m", e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 pb-1">
                          Esta faixa pode ter secao propria (ex: 0,25 x 0,30 num galpao menor).
                        </p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {(f.armadura_faixa_item || []).map((i) => (
                        <div
                          key={i.id}
                          className="flex flex-wrap items-end gap-2 bg-white rounded-lg p-2 border border-slate-200"
                        >
                          <span className="text-xs font-semibold text-slate-500 w-16">
                            {i.tipo === "ESTRIBO" ? "Estribo" : "Barras"}
                          </span>
                          <div>
                            <label className="block text-[10px] text-slate-500">Bitola</label>
                            <select
                              value={i.insumo_id}
                              onChange={(e) => atualizarItemFaixa(f.id, i.id, "insumo_id", e.target.value)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            >
                              {acos.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                          {i.tipo === "ESTRIBO" ? (
                            <>
                              <div className="w-24">
                                <label className="block text-[10px] text-slate-500">Espacamento (cm)</label>
                                <input
                                  type="text"
                                  value={txt(i.espacamento_cm)}
                                  onChange={(e) =>
                                    atualizarItemFaixa(f.id, i.id, "espacamento_cm", e.target.value)
                                  }
                                  className={campoClasse}
                                />
                              </div>
                              <div className="w-28">
                                <label className="block text-[10px] text-slate-500">Cada um tem (m)</label>
                                <input
                                  type="text"
                                  value={txt(i.perimetro_m)}
                                  onChange={(e) =>
                                    atualizarItemFaixa(f.id, i.id, "perimetro_m", e.target.value)
                                  }
                                  className={campoClasse}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-20">
                                <label className="block text-[10px] text-slate-500">Quantas</label>
                                <input
                                  type="text"
                                  value={txt(i.quantidade)}
                                  onChange={(e) =>
                                    atualizarItemFaixa(f.id, i.id, "quantidade", e.target.value)
                                  }
                                  className={campoClasse}
                                />
                              </div>
                              <div className="w-28">
                                <label className="block text-[10px] text-slate-500">Dobra extra (m)</label>
                                <input
                                  type="text"
                                  value={txt(i.acrescimo_m)}
                                  onChange={(e) =>
                                    atualizarItemFaixa(f.id, i.id, "acrescimo_m", e.target.value)
                                  }
                                  className={campoClasse}
                                />
                              </div>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => removerItemFaixa(f.id, i.id)}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Remover"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => adicionarItemFaixa(f.id, "LONGITUDINAL")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5"
                      >
                        <Plus size={13} /> Barras longitudinais
                      </button>
                      <button
                        type="button"
                        onClick={() => adicionarItemFaixa(f.id, "ESTRIBO")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5"
                      >
                        <Plus size={13} /> Estribos
                      </button>
                    </div>
                  </div>
                ))}
          </div>

          {/* ---------- 4. TESOURAS ---------- */}
          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Ferragem da tesoura por vao</p>
            <p className="text-xs text-slate-500 mb-3">Clique para lancar a ferragem de cada vao.</p>
            <div className="flex flex-wrap gap-2">
              {faixasTesoura.map((f) => {
                const resumo = resumoFaixa(f);
                const aberta = faixaAberta === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFaixaAberta(aberta ? null : f.id)}
                    className={
                      "rounded-lg px-3 py-2 text-xs transition border text-left " +
                      (aberta
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : resumo
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100")
                    }
                  >
                    <span className="font-medium block">
                      Vao {num(f.vao_min, 0)}-{num(f.vao_max, 0)} m
                    </span>
                    <span>{resumo || "cadastrar"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- MAO DE OBRA ---------- */}
          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Mao de obra do pilar</p>
            <p className="text-xs text-slate-500 mb-3">
              Tempos cronometrados na producao. O que e FIXO nao muda com o tamanho; o que e
              POR METRO foi medido numa peca de referencia e vira tempo por metro.
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Atividade</th>
                    <th className="text-left px-2 py-2 font-medium">Minutos</th>
                    <th className="text-left px-2 py-2 font-medium">Tipo</th>
                    <th className="text-left px-2 py-2 font-medium">Peca medida (m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {atividades
                    .filter((a) => a.papel === "PILAR")
                    .map((a) => (
                      <tr key={a.id}>
                        <td className="px-2 py-2 text-slate-700">{a.nome}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            defaultValue={txt(a.minutos)}
                            onBlur={(e) => salvarAtividade(a.id, "minutos", e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={a.tipo}
                            onChange={(e) => salvarAtividade(a.id, "tipo", e.target.value)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="FIXO">Fixo por peca</option>
                            <option value="POR_METRO">Varia com o tamanho</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          {a.tipo === "POR_METRO" ? (
                            <input
                              type="text"
                              defaultValue={txt(a.referencia_m)}
                              onBlur={(e) => salvarAtividade(a.id, "referencia_m", e.target.value)}
                              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs font-semibold text-slate-600 mb-2">Equipe que produz a peca</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {equipePilar.map((e) => {
                const f = funcoes.find((x) => x.id === e.mao_de_obra_id);
                return (
                  <div key={e.id} className="flex items-end gap-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                    <div>
                      <label className="block text-[10px] text-slate-500">
                        {f ? f.funcao : "?"} ({moeda(f?.valor_hora)}/h)
                      </label>
                      <input
                        type="text"
                        defaultValue={txt(e.quantidade)}
                        onBlur={(ev) => salvarEquipe(e.id, ev.target.value)}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Equipe: <b>{num(pessoasTotal, 0)} pessoas</b> - custo de <b>{moeda(custoHoraEquipe)}</b> por
              hora trabalhada. Exemplo: peca de 8,5 m leva{" "}
              <b>{num(minutosDaPeca(8.5), 0)} min</b> e custa{" "}
              <b>{moeda((minutosDaPeca(8.5) / 60) * custoHoraEquipe)}</b> de mao de obra.
            </p>
          </div>

          {/* ---------- 5. SIMULADOR ---------- */}
          <div className={cardClasse}>
            <p className="text-sm font-semibold text-slate-700 mb-1">Simulador de custo do pilar</p>
            <p className="text-xs text-slate-500 mb-3">
              Informe a medida LIVRE: o sistema soma a fundacao, calcula o concreto pelo traco e
              busca a ferragem da faixa.
            </p>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="w-32">
                <label className="block text-xs text-slate-500 mb-1">Pe-direito livre (m)</label>
                <input
                  type="text"
                  value={simPe}
                  onChange={(e) => setSimPe(e.target.value)}
                  className={campoClasse}
                />
              </div>
              <div className="w-32">
                <label className="block text-xs text-slate-500 mb-1">Vao da tesoura (m)</label>
                <input
                  type="text"
                  value={simVao}
                  onChange={(e) => setSimVao(e.target.value)}
                  className={campoClasse}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                <input
                  type="checkbox"
                  checked={simLaje}
                  onChange={(e) => setSimLaje(e.target.checked)}
                  className="rounded"
                />
                Galpao com laje
              </label>
              <button
                type="button"
                onClick={simular}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 transition"
              >
                <Calculator size={15} /> Calcular
              </button>
            </div>

            {sim && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm space-y-1">
                {sim.erro ? (
                  <p className="text-red-600">{sim.erro}</p>
                ) : (
                  <>
                    <p className="text-slate-600">
                      Fundacao: <b>{num(sim.fundacao_m, 2)} m</b> - peca fabricada:{" "}
                      <b className="text-slate-900">{num(sim.comprimento_total_m, 2)} m</b>
                    </p>
                    <p className="text-slate-600">
                      Secao: <b>{num(sim.secao_largura_m, 2)} x {num(sim.secao_altura_m, 2)} m</b> - volume:{" "}
                      <b>{num(sim.volume_m3, 3)} m3</b> - concreto:{" "}
                      <b>{moeda(sim.custo_concreto)}</b>
                      <span className="text-xs text-slate-400">
                        {" "}({moeda(sim.custo_m3_concreto)}/m3)
                      </span>
                    </p>
                    {sim.aviso ? (
                      <p className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">{sim.aviso}</p>
                    ) : (
                      <>
                        {(sim.aco || []).map((a, k) => (
                          <p key={k} className="text-xs text-slate-500">
                            {a.tipo === "ESTRIBO" ? "Estribos" : "Barras"} {a.insumo}:{" "}
                            {num(a.quantidade, 0)} un - {num(a.metros, 1)} m - {num(a.peso_kg, 1)} kg -{" "}
                            {moeda(a.custo)}
                          </p>
                        ))}
                        <p className="text-slate-600">
                          Aco: <b>{num(sim.peso_aco_kg, 1)} kg</b> - <b>{moeda(sim.custo_aco)}</b>
                        </p>
                      </>
                    )}
                    {sim.mao_de_obra && (
                      <p className="text-xs text-slate-500">
                        Mao de obra: {num(sim.mao_de_obra.minutos_total, 0)} min x{" "}
                        {num(sim.mao_de_obra.pessoas, 0)} pessoas = {num(sim.mao_de_obra.horas_homem, 2)} h -{" "}
                        {moeda(sim.custo_mao_de_obra)}
                      </p>
                    )}
                    <p className="text-slate-600 pt-1 border-t border-slate-200 mt-2">
                      <span className="text-slate-500">Material: </span>
                      <b>{moeda(sim.custo_material)}</b>
                      <span className="text-slate-500"> + mao de obra: </span>
                      <b>{moeda(sim.custo_mao_de_obra)}</b>
                    </p>
                    <div className="pt-2 border-t border-slate-200 mt-2 space-y-1">
                      <p className="text-base">
                        <span className="text-slate-500">Custo da peca: </span>
                        <b className="text-emerald-700">{moeda(sim.custo_total)}</b>
                        <span className="text-xs text-slate-400">
                          {" "}({sim.modo === "M3" ? "pelo m3 de concreto armado" : "composicao detalhada"})
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Comparativo: pelo m3 = {moeda(sim.custo_por_m3)} ({num(sim.volume_m3, 3)} m3 x{" "}
                        {moeda(sim.valor_m3_armado)}) | detalhado = {moeda(sim.custo_detalhado)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Porteiro: esta tela e exclusiva de administradores.
export default function EngenhariaPageProtegida() {
  const souAdmin = useSouAdmin();
  if (souAdmin === false) return <AcessoRestrito />;
  if (souAdmin !== true) return null;
  return <EngenhariaPage />;
}
