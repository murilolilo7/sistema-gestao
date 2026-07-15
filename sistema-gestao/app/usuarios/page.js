"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar } from "@/components/Ui";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [souAdmin, setSouAdmin] = useState(null); // null = ainda checando
  const [meuId, setMeuId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [alterandoId, setAlterandoId] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([supabase.auth.getSession(), supabase.rpc("eh_admin")]).then(
      ([sessaoRes, adminRes]) => {
        if (!ativo) return;
        const meuIdAtual = sessaoRes.data.session?.user?.id || null;
        const admin = !!adminRes.data;
        setMeuId(meuIdAtual);
        setSouAdmin(admin);

        if (!admin) {
          setLoading(false);
          return;
        }
        supabase.rpc("listar_usuarios").then(({ data, error }) => {
          if (!ativo) return;
          if (error) setErro("Não foi possível carregar os usuários: " + error.message);
          else setUsuarios(data || []);
          setLoading(false);
        });
      }
    );
    return () => {
      ativo = false;
    };
  }, []);

  async function alternarAdmin(usuario) {
    if (usuario.user_id === meuId) {
      setErro("Você não pode remover sua própria permissão de administrador por aqui.");
      return;
    }
    const novoValor = !usuario.is_admin;
    const ok = await confirmar({
      titulo: novoValor ? "Tornar administrador?" : "Remover administrador?",
      texto: novoValor
        ? `"${usuario.nome_completo || usuario.email}" vai poder alterar preços e aprovar usuários.`
        : `"${usuario.nome_completo || usuario.email}" perderá as permissões de administrador.`,
      confirmarTexto: novoValor ? "Tornar admin" : "Remover",
      perigoso: !novoValor,
    });
    if (!ok) return;

    setAlterandoId(usuario.user_id);
    setErro("");
    setMensagem("");
    const { error } = await supabase.rpc("definir_admin", {
      usuario_id_input: usuario.user_id,
      novo_valor: novoValor,
    });
    if (error) {
      setErro("Erro ao alterar permissão: " + error.message);
    } else {
      notificar("Permissão atualizada.");
      setUsuarios((atual) =>
        atual.map((u) => (u.user_id === usuario.user_id ? { ...u, is_admin: novoValor } : u))
      );
    }
    setAlterandoId(null);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-slate-600 hover:text-slate-900 font-medium">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold mb-1">Usuários</h1>
      <p className="text-slate-500 mb-6">
        Quem pode alterar, incluir ou excluir preços (insumos, mão de obra, peças de galpão).
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

      {!souAdmin ? (
        <div className="rounded-lg bg-slate-100 border border-slate-200 text-slate-600 px-4 py-3 text-sm">
          Só administradores podem ver e gerenciar essa tela.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">E-mail</th>
                <th className="px-4 py-2 font-medium">Administrador</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">
                    {u.nome_completo || "-"}
                    {u.user_id === meuId && <span className="text-slate-400 font-normal"> (você)</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{u.email}</td>
                  <td className="px-4 py-2">
                    {u.is_admin ? (
                      <span className="inline-block rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 text-xs font-medium">
                        Administrador
                      </span>
                    ) : (
                      <span className="inline-block rounded-full border bg-slate-50 text-slate-600 border-slate-200 px-2 py-0.5 text-xs font-medium">
                        Somente leitura
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => alternarAdmin(u)}
                      disabled={alterandoId === u.user_id || u.user_id === meuId}
                      className="text-emerald-700 hover:text-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                    >
                      {alterandoId === u.user_id
                        ? "..."
                        : u.is_admin
                          ? "Remover admin"
                          : "Tornar admin"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
