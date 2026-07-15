"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Warehouse, PencilRuler, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function traduzErro(msg) {
  if (!msg) return "Ocorreu um erro. Tente novamente.";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "Este e-mail já está cadastrado. Tente entrar.";
  if (msg.includes("Password should be at least"))
    return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("Unable to validate email")) return "E-mail inválido.";
  return msg;
}

const DESTAQUES = [
  {
    icone: Warehouse,
    titulo: "Orçamentos de galpão em minutos",
    texto: "Peças, telhas, terças e laje calculadas sozinhas pelas medidas.",
  },
  {
    icone: PencilRuler,
    titulo: "Desenho 3D na proposta",
    texto: "O cliente recebe o galpão desenhado com as cotas, direto no PDF.",
  },
  {
    icone: Users,
    titulo: "Tudo num lugar só",
    texto: "Clientes, produtos, preços, vendas e propostas integrados.",
  },
];

export default function LoginPage() {
  const [modo, setModo] = useState("entrar");
  const [nomeCompleto, setNomeCompleto] = useState("");
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
      if (!nomeCompleto.trim()) {
        setErro("Informe seu nome completo.");
        setCarregando(false);
        return;
      }
      const resultado = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: { data: { nome_completo: nomeCompleto.trim() } },
      });
      if (resultado.error) {
        setErro(traduzErro(resultado.error.message));
      } else {
        setMensagem("Conta criada! Confirme seu e-mail se for pedido, depois entre.");
        setModo("entrar");
        setNomeCompleto("");
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

  const textoBotao = carregando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta";

  const classeCampo =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* -------- Painel da marca (telas médias/grandes) -------- */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden bg-slate-900 flex-col justify-between p-10 text-white">
        {/* fundo decorativo */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-600 text-white font-black text-lg">
            M7
          </span>
          <div>
            <p className="font-bold text-lg leading-tight">
              MR7 <span className="text-emerald-400">Pré-Moldados</span>
            </p>
            <p className="text-xs text-slate-400">Sistema de Gestão</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-snug mb-8">
            Do orçamento à venda,
            <br />
            <span className="text-emerald-400">tudo sob controle.</span>
          </h1>
          <div className="space-y-5">
            {DESTAQUES.map((d) => (
              <div key={d.titulo} className="flex gap-3.5">
                <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                  <d.icone size={18} />
                </span>
                <div>
                  <p className="font-semibold text-sm">{d.titulo}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{d.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-slate-500">
          © {new Date().getFullYear()} MR7 Pré-Moldados · Feito com Next.js + Supabase
        </p>
      </div>

      {/* -------- Formulário -------- */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* marca compacta no celular */}
          <div className="md:hidden text-center mb-6">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white font-black text-lg mb-2">
              M7
            </span>
            <h1 className="text-xl font-bold text-slate-900">
              MR7 <span className="text-emerald-600">Pré-Moldados</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Sistema de Gestão</p>
          </div>

          <div className="hidden md:block mb-6">
            <h2 className="text-2xl font-bold text-slate-900">
              {modo === "entrar" ? "Bem-vindo de volta" : "Criar sua conta"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {modo === "entrar"
                ? "Entre com seus dados para acessar o sistema."
                : "Preencha os dados — o administrador libera o acesso."}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex mb-5 rounded-lg bg-slate-100 p-1 text-sm font-medium">
              <button type="button" onClick={() => trocarModo("entrar")} className={abaEntrarClasse}>
                Entrar
              </button>
              <button
                type="button"
                onClick={() => trocarModo("cadastrar")}
                className={abaCadastrarClasse}
              >
                Criar conta
              </button>
            </div>

            {erro ? (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                {erro}
              </div>
            ) : null}
            {mensagem ? (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-sm">
                {mensagem}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3">
              {modo === "cadastrar" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={nomeCompleto}
                    onChange={(e) => setNomeCompleto(e.target.value)}
                    className={classeCampo}
                    placeholder="Seu nome e sobrenome"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={classeCampo}
                  placeholder="voce@empresa.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Senha</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={classeCampo}
                  placeholder="Sua senha"
                />
              </div>
              <button
                type="submit"
                disabled={carregando}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 transition"
              >
                {textoBotao}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
