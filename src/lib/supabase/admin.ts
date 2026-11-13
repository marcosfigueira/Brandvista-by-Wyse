import { createClient } from "@supabase/supabase-js";

/** Nome da variável com a chave de serviço, no formato antigo ou no novo. */
export function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
}

/**
 * Cliente do Supabase com a chave de serviço, que ignora as regras de acesso
 * por usuário. Só para tarefas em segundo plano, onde não há usuário logado.
 * Nunca importe este arquivo em código que roda no navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) {
    throw new Error("A variável SUPABASE_SERVICE_ROLE_KEY não está configurada na Vercel.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
