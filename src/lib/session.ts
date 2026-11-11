import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

/**
 * Quem está logado e com qual papel. `needsMigration` fica verdadeiro quando
 * a tabela de perfis ainda não existe, ou seja, quando o arquivo
 * 0002_papeis_e_limites.sql ainda não foi executado no Supabase.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    role: ((profile?.role as Role | undefined) ?? "cliente") as Role,
    needsMigration: Boolean(error),
  };
});

/** Para páginas e ações exclusivas da equipe Wyse. */
export async function requireWyse() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "wyse") redirect("/");
  return session;
}
