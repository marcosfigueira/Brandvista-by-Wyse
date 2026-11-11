import { cache } from "react";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import type { ClientSummary } from "@/lib/types";

export const CLIENT_COOKIE = "bv_client";

/**
 * Empresas que o usuário pode ver e a empresa selecionada no momento.
 * A seleção fica em um cookie; sem cookie válido, vale a primeira da lista.
 */
export const getCurrentClient = cache(async () => {
  const session = await getSession();
  if (!session) return { clients: [] as ClientSummary[], current: null };

  const { data } = await session.supabase
    .from("clients")
    .select("id, name")
    .order("name");

  const clients = (data ?? []) as ClientSummary[];
  const cookieStore = await cookies();
  const selected = cookieStore.get(CLIENT_COOKIE)?.value;
  const current =
    clients.find((client) => client.id === selected) ?? clients[0] ?? null;

  return { clients, current };
});
