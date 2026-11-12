"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CLIENT_COOKIE } from "@/lib/current-client";
import { dbMessage, fail, field, optional } from "@/lib/forms";
import { requireWyse } from "@/lib/session";
import { FREQUENCIES } from "@/lib/types";

const PATH = "/controle";

/** Cadastra uma empresa e já a deixa selecionada. */
export async function createClientRecord(formData: FormData) {
  const { supabase } = await requireWyse();
  const name = field(formData, "name");
  if (!name) fail(PATH, "Informe o nome da empresa.");

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      domain: optional(formData, "domain"),
      category: optional(formData, "category"),
    })
    .select("id")
    .single();

  if (error || !data) {
    fail(PATH, dbMessage(error ?? { message: "" }, "Não foi possível cadastrar a empresa."));
  }

  const cookieStore = await cookies();
  cookieStore.set(CLIENT_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/marca");
}

/** Altera os limites de um cliente: perguntas, frequência e se está ativo. */
export async function updateLimits(formData: FormData) {
  const { supabase } = await requireWyse();
  const clientId = field(formData, "client_id");
  const maxPrompts = Number.parseInt(field(formData, "max_prompts"), 10);
  const frequency = field(formData, "tracking_frequency");
  const repetitions = Number.parseInt(field(formData, "repetitions"), 10);

  if (!clientId) fail(PATH, "Empresa não identificada.");
  if (!Number.isInteger(maxPrompts) || maxPrompts < 1 || maxPrompts > 500) {
    fail(PATH, "O limite de perguntas deve ficar entre 1 e 500.");
  }
  if (!FREQUENCIES.some((item) => item.value === frequency)) {
    fail(PATH, "Frequência inválida.");
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    fail(PATH, "As repetições por rodada devem ficar entre 1 e 5.");
  }

  const { error } = await supabase.from("client_limits").upsert(
    {
      client_id: clientId,
      max_prompts: maxPrompts,
      tracking_frequency: frequency,
      repetitions,
      active: formData.get("active") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );

  if (error) {
    fail(
      PATH,
      dbMessage(
        error,
        "Não foi possível salvar os limites. Confira se o arquivo 0004_repeticoes.sql foi executado no Supabase.",
      ),
    );
  }

  revalidatePath(PATH);
  revalidatePath("/perguntas");
}
