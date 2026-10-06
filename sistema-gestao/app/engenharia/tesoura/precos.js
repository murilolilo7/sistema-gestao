"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { custoCompletoPeca } from "../custos-complementares";

// Preços de hoje para a tesoura (só leitura): aço por bitola, m³ de concreto
// pelo traço, parâmetros da Engenharia (espessura, perdas, BDI…) e a mão de
// obra das receitas de tesoura já cadastradas (até o Murilo medir os tempos).
export function usePrecosTesoura() {
  const [precos, setPrecos] = useState(null);
  useEffect(() => {
    (async () => {
      const [{ data: acos }, { data: concreto }, { data: param }, { data: comps }] = await Promise.all([
        supabase.from("insumos").select("nome, valor_unitario").ilike("nome", "AÇO %"),
        supabase.rpc("custo_m3_concreto"),
        supabase.from("parametros_engenharia").select("*").order("id").limit(1),
        supabase
          .from("composicoes_galpao")
          .select("nome, comprimento_referencia, composicao_itens(quantidade, mao_de_obra(valor_hora))")
          .eq("papel", "TESOURA")
          .eq("ativo", true),
      ]);
      const aco = {};
      for (const a of acos || []) aco[Number(a.nome.replace(/[^\d.]/g, ""))] = Number(a.valor_unitario) || 0;
      const maoDeObra = (comps || [])
        .map((c) => ({
          ref: Number(c.comprimento_referencia) || 0,
          nome: c.nome,
          valor: (c.composicao_itens || []).reduce(
            (s, it) => s + (it.mao_de_obra ? Number(it.quantidade) * Number(it.mao_de_obra.valor_hora) : 0),
            0
          ),
        }))
        .filter((m) => m.valor > 0 && m.ref > 0);
      setPrecos({ aco, concreto: Number(concreto) || 0, param: param?.[0] || {}, maoDeObra });
    })();
  }, []);
  return precos;
}

// Mão de obra da receita de tesoura com comprimento mais próximo
export function maoDeObraTesoura(precos, vao) {
  if (!precos?.maoDeObra?.length) return { valor: 0, origem: null };
  const m = [...precos.maoDeObra].sort((a, b) => Math.abs(a.ref - vao) - Math.abs(b.ref - vao))[0];
  return { valor: m.valor, origem: m.nome };
}

// Custo completo de uma tesoura calculada (resultado de calcularTesoura)
export function custoTesoura(resultado, precos) {
  if (!resultado || !precos) return null;
  const linhasAco = resultado.linhas.map((l) => ({ ...l, rs: l.kg * (precos.aco[l.bitola] || 0) }));
  const aco = linhasAco.reduce((s, l) => s + l.rs, 0);
  const concreto = resultado.volume * precos.concreto;
  const mo = maoDeObraTesoura(precos, resultado.vao);
  const completo = custoCompletoPeca(
    { concreto, aco, maoDeObra: mo.valor, volume: resultado.volume, maoDeObraInformada: false },
    precos.param
  );
  return { linhasAco, aco, concreto, maoDeObra: mo, completo };
}
