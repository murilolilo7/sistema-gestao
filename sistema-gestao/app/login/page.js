"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function traduzErro(msg) {
    if (!msg) return "Ocorreu um erro. Tente novamente.";
    if (msg.includes("Invalid login credentials"))
          return "E-mail ou senha incorretos.";
    if (msg.includes("already registered") || msg.includes("already exists"))
          return "Este e-mail ja esta cadastrado. Tente entrar.";
    if (msg.includes("Password should be at least"))
          return "A senha deve ter pelo menos 6 caracteres.";
    if (msg.includes("Unable to validate email")) return "E-mail invalido.";
    return msg;
}

export default function LoginPage() {
    const [modo, setModo] = useState("entrar");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [erro, setErro] = useState("");
    const [mensagem, setMensagem] = useState("");
    const [carregando, setCarregando] = useState(false);
    const router = useRouter();

  async function handleSubmit(e) {
        e.preventDefault();
        setErro("");
        setMensagem("");
        setCarregando(true);

      if (modo === "entrar") {
              const resultado = await supabase.auth.signInWithPassword({
                        email: email,
                        password: senha,
              });
              if (resultado.error) {
                        setErro(traduzErro(resultado.error.message));
              } else {
                        router.replace("/");
              }
      } else {
              const resultado = await supabase.auth.signUp({
                        email: email,
                        password: senha,
              });
              if (resultado.error) {
                        setErro(traduzErro(resultado.error.message));
              } else {
                        setMensagem("Conta criada! Confirme seu e-mail se for pedido, depois entre.");
                        setModo("entrar");
              }
      }
        setCarregando(false);
  }

  function trocarModo(novoModo) {
        setModo(novoModo);
                    setErro("");
                setMensagem("");
}

            const abaEntrarClasse =
                  modo === "entrar"
        ? "flex-1 rounded-md py-1.5 transition bg-white shadow text-slate-900"
                    : "flex-1 rounded-md py-1.5 transition text-slate-500";

  const abaCadastrarClasse =
        modo === "cadastrar"
        ? "flex-1 rounded-md py-1.5 transition bg-white shadow text-slate-900"
          : "flex-1 rounded-md py-1.5 transition text-slate-500";

  const textoBotao = carregando
      ? "Aguarde..."
        : modo === "entrar"
      ? "Entrar"
        : "Criar conta";

  const classeCampo =
        "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-slate-900">
                MR7 <span className="text-emerald-600">Pre-Moldados</span>
    </h1>
            <p className="text-sm text-slate-500 mt-1">Sistema de Gestao</p>
    </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex mb-5 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                <button type="button" onClick={() => trocarModo("entrar")} className={abaEntrarClasse}>Entrar</button>
            <button type="button" onClick={() => trocarModo("cadastrar")} className={abaCadastrarClasse}>Criar conta</button>
  </div>

{erro ? (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{erro}</div>
            ) : null}
{mensagem ? (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-sm">{mensagem}</div>
            ) : null}

          <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">E-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={classeCampo} placeholder="voce@empresa.com" />
            </div>
            <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Senha</label>
              <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} className={classeCampo} placeholder="Sua senha" />
            </div>
            <button type="submit" disabled={carregando} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 transition">{textoBotao}</button>
            </form>
            </div>
            </div>
            </div>
  );
}
