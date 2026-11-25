"use client";

import { useEffect, useState } from "react";
import { Crown, KeyRound, Lock, LockOpen, Pencil, Trash2, UserPlus, Copy, RefreshCw, X, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notificar, confirmar, useSouDono } from "@/components/Ui";

// ---------- utilidades ----------

// Senha fácil de ditar: Mr7-abcd-1234 (sem letras que confundem: l, o, i)
function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const n = new Uint32Array(8);
  crypto.getRandomValues(n);
  const parteL = Array.from(n.slice(0, 4), (v) => letras[v % letras.length]).join("");
  const parteN = Array.from(n.slice(4), (v) => String(v % 10)).join("");
  return `Mr7-${parteL}-${parteN}`;
}

function dataHora(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function haQuanto(iso) {
  if (!iso) return "nunca entrou";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

async function chamarCentral(corpo) {
  const { data, error } = await supabase.functions.invoke("central-dono", { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j?.erro) msg = j.erro;
    } catch (e) { /* mantém a mensagem original */ }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    notificar("Copiado.");
  } catch (e) {
    notificar("Não consegui copiar. Selecione e copie à mão.", "erro");
  }
}

const classeCampo =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

// ---------- janelas ----------

function Janela({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-5">
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-semibold text-slate-900">{titulo}</h2>
          <button onClick={aoFechar} className="text-slate-400 hover:text-slate-700" title="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CampoSenha({ senha, setSenha }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">Senha (mínimo 6 caracteres)</label>
      <div className="flex gap-2">
        <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} className={classeCampo + " font-mono"} />
        <button
          type="button"
          onClick={() => setSenha(gerarSenha())}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Gerar uma senha fácil de passar para a pessoa"
        >
          <RefreshCw size={13} /> Gerar
        </button>
      </div>
    </div>
  );
}

// Mostra a senha depois de salva, para copiar e mandar para a pessoa.
function SenhaPronta({ email, senha, aoFechar }) {
  const texto = `Acesso ao sistema MR7\nE-mail: ${email}\nSenha: ${senha}`;
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
        Pronto. A senha já vale. Copie e mande para a pessoa. Depois de fechar esta janela a senha não aparece mais.
      </div>
      <pre className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm font-mono whitespace-pre-wrap">{texto}</pre>
      <div className="flex justify-end gap-2">
        <button onClick={() => copiar(texto)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2">
          <Copy size={14} /> Copiar
        </button>
        <button onClick={aoFechar} className="rounded-lg border border-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50">
          Fechar
        </button>
      </div>
    </div>
  );
}

function JanelaNovoUsuario({ aoFechar, aoCriar }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(() => gerarSenha());
  const [admin, setAdmin] = useState(false);
  const [producao, setProducao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(null);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const r = await chamarCentral({ acao: "criar", nome, email, senha });
      if (admin) await supabase.rpc("definir_admin", { usuario_id_input: r.user_id, novo_valor: true });
      if (producao) await supabase.rpc("definir_lanca_producao", { usuario_id_input: r.user_id, novo_valor: true });
      setPronto({ email: email.trim().toLowerCase(), senha });
      aoCriar();
    } catch (err) {
      setErro(err.message);
    }
    setSalvando(false);
  }

  return (
    <Janela titulo="Novo usuário" aoFechar={aoFechar}>
      {pronto ? (
        <SenhaPronta email={pronto.email} senha={pronto.senha} aoFechar={aoFechar} />
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <p className="text-xs text-slate-500">
            A conta já nasce liberada, sem precisar confirmar e-mail. Você passa o e-mail e a senha para a pessoa.
          </p>
          {erro && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{erro}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={classeCampo} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">E-mail (é o que a pessoa digita para entrar)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={classeCampo} required />
          </div>
          <CampoSenha senha={senha} setSenha={setSenha} />
          <div className="space-y-1.5 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              Administrador (altera preços, vê custos e usuários)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={producao} onChange={(e) => setProducao(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              Lança produção
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
              {salvando ? "Criando..." : "Criar usuário"}
            </button>
          </div>
        </form>
      )}
    </Janela>
  );
}

function JanelaSenha({ usuario, aoFechar }) {
  const [senha, setSenha] = useState(() => gerarSenha());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await chamarCentral({ acao: "senha", user_id: usuario.user_id, senha });
      setPronto(true);
    } catch (err) {
      setErro(err.message);
    }
    setSalvando(false);
  }

  return (
    <Janela titulo={`Definir senha — ${usuario.nome_completo || usuario.email}`} aoFechar={aoFechar}>
      {pronto ? (
        <SenhaPronta email={usuario.email} senha={senha} aoFechar={aoFechar} />
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <p className="text-xs text-slate-500">
            A senha antiga deixa de valer na hora. Ninguém consegue ver a senha antiga, nem o dono: o sistema só guarda
            ela embaralhada.
          </p>
          {erro && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{erro}</div>}
          <CampoSenha senha={senha} setSenha={setSenha} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
              {salvando ? "Salvando..." : "Definir senha"}
            </button>
          </div>
        </form>
      )}
    </Janela>
  );
}

function JanelaNome({ usuario, aoFechar, aoSalvar }) {
  const [nome, setNome] = useState(usuario.nome_completo || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await chamarCentral({ acao: "nome", user_id: usuario.user_id, nome });
      notificar("Nome atualizado.");
      aoSalvar();
      aoFechar();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <Janela titulo="Alterar nome" aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        {erro && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{erro}</div>}
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={classeCampo} required />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            Salvar
          </button>
        </div>
      </form>
    </Janela>
  );
}

// ---------- tela ----------

function Cartao({ titulo, valor, detalhe }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-2xl font-bold text-slate-900">{valor}</p>
      {detalhe && <p className="text-[11px] text-slate-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}

function Selo({ cor, children }) {
  const cores = {
    verde: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cinza: "bg-slate-50 text-slate-600 border-slate-200",
    ambar: "bg-amber-50 text-amber-800 border-amber-200",
    vermelho: "bg-red-50 text-red-700 border-red-200",
    azul: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cores[cor]}`}>{children}</span>;
}

function BotaoAcao({ onClick, titulo, icone: Icone, perigoso, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed ${
        perigoso ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icone size={13} /> {titulo}
    </button>
  );
}

function Central() {
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const [janela, setJanela] = useState(null); // {tipo, usuario}
  const [ocupado, setOcupado] = useState(null);
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    let ativo = true;
    supabase.rpc("dono_listar_usuarios").then(({ data, error }) => {
      if (!ativo) return;
      if (error) setErro("Não foi possível carregar os usuários: " + error.message);
      else {
        setErro("");
        setAgora(Date.now());
        setUsuarios(data || []);
      }
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);

  async function bloquear(u) {
    const vaiBloquear = !u.bloqueado;
    const nome = u.nome_completo || u.email;
    const ok = await confirmar({
      titulo: vaiBloquear ? `Bloquear ${nome}?` : `Desbloquear ${nome}?`,
      texto: vaiBloquear
        ? "A pessoa sai do sistema e não consegue mais entrar. Os lançamentos e orçamentos dela continuam guardados. Dá para desbloquear depois."
        : "A pessoa volta a entrar com a mesma senha de antes.",
      confirmarTexto: vaiBloquear ? "Bloquear" : "Desbloquear",
      perigoso: vaiBloquear,
    });
    if (!ok) return;
    setOcupado(u.user_id);
    try {
      await chamarCentral({ acao: vaiBloquear ? "bloquear" : "desbloquear", user_id: u.user_id });
      notificar(vaiBloquear ? "Acesso bloqueado." : "Acesso liberado.");
      recarregar();
    } catch (err) {
      notificar(err.message, "erro");
    }
    setOcupado(null);
  }

  async function liberar(u) {
    const nome = u.nome_completo || u.email;
    const ok = await confirmar({
      titulo: `Liberar o acesso de ${nome}?`,
      texto:
        "A pessoa passa a entrar no sistema e ver os dados. Logo abaixo do nome dela você marca se é Administrador ou se Lança produção.",
      confirmarTexto: "Liberar",
    });
    if (!ok) return;
    setOcupado(u.user_id);
    const { error } = await supabase.rpc("dono_liberar_usuario", { usuario_id_input: u.user_id, liberar: true });
    if (error) notificar("Erro: " + error.message, "erro");
    else {
      notificar("Acesso liberado.");
      recarregar();
    }
    setOcupado(null);
  }

  async function recusar(u) {
    const nome = u.nome_completo || u.email;
    const ok = await confirmar({
      titulo: `Recusar ${nome}?`,
      texto: "A conta é apagada. Se a pessoa tentar de novo, ela precisa se cadastrar outra vez.",
      confirmarTexto: "Recusar e apagar",
      perigoso: true,
    });
    if (!ok) return;
    setOcupado(u.user_id);
    try {
      await chamarCentral({ acao: "excluir", user_id: u.user_id });
      notificar("Cadastro recusado.");
      recarregar();
    } catch (err) {
      notificar(err.message, "erro");
    }
    setOcupado(null);
  }

  async function excluir(u) {
    const nome = u.nome_completo || u.email;
    const ok = await confirmar({
      titulo: `Excluir a conta de ${nome}?`,
      texto:
        "A conta é apagada de vez e não tem como desfazer. Os orçamentos e lançamentos continuam no sistema, mas o histórico de preços perde o nome de quem alterou.\n\nSe a pessoa só saiu da empresa, prefira Bloquear.",
      confirmarTexto: "Excluir de vez",
      perigoso: true,
    });
    if (!ok) return;
    setOcupado(u.user_id);
    try {
      await chamarCentral({ acao: "excluir", user_id: u.user_id });
      notificar("Conta excluída.");
      recarregar();
    } catch (err) {
      notificar(err.message, "erro");
    }
    setOcupado(null);
  }

  async function alternar(u, campo) {
    const rpc = campo === "admin" ? "definir_admin" : "definir_lanca_producao";
    const atual = campo === "admin" ? u.is_admin : u.lanca_producao;
    setOcupado(u.user_id);
    const { error } = await supabase.rpc(rpc, { usuario_id_input: u.user_id, novo_valor: !atual });
    if (error) notificar("Erro: " + error.message, "erro");
    else {
      notificar("Permissão atualizada.");
      recarregar();
    }
    setOcupado(null);
  }

  if (erro) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{erro}</div>;
  if (!usuarios) return <p className="text-sm text-slate-500">Carregando...</p>;

  const semana = agora - 7 * 86400000;
  const ativosSemana = usuarios.filter((u) => u.ultimo_login && new Date(u.ultimo_login).getTime() >= semana).length;
  const bloqueados = usuarios.filter((u) => u.bloqueado).length;
  const admins = usuarios.filter((u) => u.is_admin || u.eh_dono).length;
  const aguardando = usuarios.filter((u) => !u.liberado).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Cartao titulo="Usuários" valor={usuarios.length} />
        <Cartao titulo="Entraram nos últimos 7 dias" valor={ativosSemana} />
        <Cartao titulo="Administradores" valor={admins} detalhe="contando você" />
        <Cartao titulo="Bloqueados" valor={bloqueados} />
      </div>
      {aguardando > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{aguardando} {aguardando === 1 ? "pessoa se cadastrou" : "pessoas se cadastraram"}</b> e{" "}
          {aguardando === 1 ? "está" : "estão"} aguardando liberação (no topo da lista). Enquanto você não liberar, não
          veem nada no sistema.
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setJanela({ tipo: "novo" })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2"
        >
          <UserPlus size={16} /> Novo usuário
        </button>
      </div>

      <div className="space-y-3">
        {usuarios.map((u) => {
          const travado = ocupado === u.user_id;
          return (
            <div
              key={u.user_id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                !u.liberado ? "border-amber-300 bg-amber-50/40" : u.bloqueado ? "border-red-200 bg-red-50/30" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{u.nome_completo || "(sem nome)"}</p>
                    {u.eh_dono && (
                      <Selo cor="ambar">
                        <Crown size={11} /> Dono (você)
                      </Selo>
                    )}
                    {!u.liberado ? (
                      <Selo cor="ambar">Aguardando liberação</Selo>
                    ) : u.bloqueado ? (
                      <Selo cor="vermelho">Bloqueado</Selo>
                    ) : (
                      <Selo cor="verde">Ativo</Selo>
                    )}
                    {(u.is_admin || u.eh_dono) && <Selo cor="azul">Administrador</Selo>}
                    {u.lanca_producao && <Selo cor="cinza">Lança produção</Selo>}
                  </div>
                  <p className="text-sm text-slate-500 break-all">{u.email}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Último login: <b className="text-slate-700">{haQuanto(u.ultimo_login)}</b>
                    {u.ultimo_login && <span className="text-slate-400"> ({dataHora(u.ultimo_login)})</span>}
                    <span className="text-slate-400"> · conta criada em {dataHora(u.criado_em).slice(0, 10)}</span>
                    {!u.email_confirmado && <span className="text-amber-700"> · e-mail não confirmado</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!u.liberado && (
                    <>
                      <button
                        onClick={() => liberar(u)}
                        disabled={travado}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                      >
                        <UserCheck size={13} /> Liberar
                      </button>
                      <BotaoAcao icone={X} titulo="Recusar" perigoso onClick={() => recusar(u)} disabled={travado} />
                    </>
                  )}
                  <BotaoAcao icone={KeyRound} titulo="Definir senha" onClick={() => setJanela({ tipo: "senha", usuario: u })} disabled={travado} />
                  <BotaoAcao icone={Pencil} titulo="Nome" onClick={() => setJanela({ tipo: "nome", usuario: u })} disabled={travado} />
                  {!u.eh_dono && u.liberado && (
                    <>
                      <BotaoAcao icone={u.bloqueado ? LockOpen : Lock} titulo={u.bloqueado ? "Desbloquear" : "Bloquear"} onClick={() => bloquear(u)} disabled={travado} />
                      <BotaoAcao icone={Trash2} titulo="Excluir" perigoso onClick={() => excluir(u)} disabled={travado} />
                    </>
                  )}
                </div>
              </div>
              {!u.eh_dono && (
                <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!u.is_admin} onChange={() => alternar(u, "admin")} disabled={travado} className="w-4 h-4 accent-emerald-600" />
                    Administrador
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!u.lanca_producao} onChange={() => alternar(u, "producao")} disabled={travado} className="w-4 h-4 accent-emerald-600" />
                    Lança produção
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {janela?.tipo === "novo" && <JanelaNovoUsuario aoFechar={() => setJanela(null)} aoCriar={recarregar} />}
      {janela?.tipo === "senha" && <JanelaSenha usuario={janela.usuario} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === "nome" && <JanelaNome usuario={janela.usuario} aoFechar={() => setJanela(null)} aoSalvar={recarregar} />}
    </div>
  );
}

export default function CentralDoDonoPage() {
  const [chave, setChave] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setChave(data.session?.user?.id || "sem"));
  }, []);
  const souDono = useSouDono(chave);

  if (souDono === null) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (!souDono) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm max-w-lg mx-auto mt-8">
        <p className="font-semibold text-slate-800">Acesso restrito</p>
        <p className="text-sm text-slate-500 mt-1">Esta área é exclusiva do dono do sistema.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Crown className="text-amber-500" size={24} /> Central do Dono
      </h1>
      <p className="text-slate-500 mb-6 text-sm">
        Só você vê esta tela. Aqui você libera quem se cadastrou, cria contas, define a senha de qualquer pessoa
        (inclusive a sua), bloqueia quem saiu e vê quando cada um entrou pela última vez. As senhas nunca aparecem: o sistema guarda só uma versão
        embaralhada delas, mas você pode trocar a de qualquer um a qualquer hora.
      </p>
      <Central />
    </div>
  );
}
