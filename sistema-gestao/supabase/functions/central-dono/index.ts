// Central do Dono: ações sobre contas de usuário que só o dono do sistema pode fazer.
// Quem chama precisa estar logado; a função confere no banco (rpc eh_dono) antes de agir.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function erro(mensagem: string, status = 400) {
  return resposta({ erro: mensagem }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  // 1) Quem está chamando é o dono?
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: usuario } = await comoUsuario.auth.getUser();
  if (!usuario?.user) return erro("Faça login novamente.", 401);
  const { data: souDono, error: erroDono } = await comoUsuario.rpc("eh_dono");
  if (erroDono || souDono !== true) return erro("Apenas o dono do sistema pode fazer isso.", 403);
  const meuId = usuario.user.id;

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }
  const acao = String(corpo.acao ?? "");
  const alvo = String(corpo.user_id ?? "");
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  const senhaValida = (s: unknown) => typeof s === "string" && s.length >= 6;

  if (acao === "criar") {
    const email = String(corpo.email ?? "").trim().toLowerCase();
    const nome = String(corpo.nome ?? "").trim();
    if (!nome) return erro("Informe o nome.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro("E-mail inválido.");
    if (!senhaValida(corpo.senha)) return erro("A senha precisa ter pelo menos 6 caracteres.");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: corpo.senha as string,
      email_confirm: true,
      user_metadata: { nome_completo: nome },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return erro("Já existe uma conta com esse e-mail.");
      return erro(error.message);
    }
    return resposta({ ok: true, user_id: data.user?.id });
  }

  if (!/^[0-9a-f-]{36}$/i.test(alvo)) return erro("Usuário inválido.");

  if (acao === "senha") {
    if (!senhaValida(corpo.senha)) return erro("A senha precisa ter pelo menos 6 caracteres.");
    const { error } = await admin.auth.admin.updateUserById(alvo, { password: corpo.senha as string });
    if (error) return erro(error.message);
    return resposta({ ok: true });
  }

  if (acao === "bloquear" || acao === "desbloquear") {
    if (alvo === meuId) return erro("Você não pode bloquear a sua própria conta.");
    const { error } = await admin.auth.admin.updateUserById(alvo, {
      ban_duration: acao === "bloquear" ? "876000h" : "none",
    });
    if (error) return erro(error.message);
    return resposta({ ok: true });
  }

  if (acao === "nome") {
    const nome = String(corpo.nome ?? "").trim();
    if (!nome) return erro("Informe o nome.");
    const { error } = await admin.auth.admin.updateUserById(alvo, { user_metadata: { nome_completo: nome } });
    if (error) return erro(error.message);
    return resposta({ ok: true });
  }

  if (acao === "excluir") {
    if (alvo === meuId) return erro("Você não pode excluir a sua própria conta.");
    const { error } = await admin.auth.admin.deleteUser(alvo);
    if (error) return erro(error.message);
    return resposta({ ok: true });
  }

  return erro("Ação desconhecida.");
});
