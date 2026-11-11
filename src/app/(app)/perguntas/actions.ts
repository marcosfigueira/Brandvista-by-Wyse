"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentClient } from "@/lib/current-client";
import { dbMessage, fail, field, optional } from "@/lib/forms";
import { requireWyse } from "@/lib/session";
import { PROMPT_KINDS } from "@/lib/types";

const PATH = "/perguntas";

/** Lê e valida os campos de uma pergunta. A busca é definida pelo tipo. */
function readPrompt(formData: FormData, errorPath: string) {
  const text = field(formData, "text");
  const kind = PROMPT_KINDS.find((item) => item.value === field(formData, "kind"));
  if (!text) fail(errorPath, "Escreva o texto da pergunta.");
  if (!kind) fail(errorPath, "Tipo de pergunta inválido.");
  return {
    text,
    kind: kind.value,
    persona: optional(formData, "persona"),
    journey_stage: optional(formData, "journey_stage"),
    search_enabled: kind.search,
  };
}

export async function createPrompt(formData: FormData) {
  const { supabase } = await requireWyse();
  const { current } = await getCurrentClient();
  if (!current) fail(PATH, "Selecione ou cadastre uma empresa primeiro.");

  const prompt = readPrompt(formData, PATH);
  const { error } = await supabase
    .from("prompts")
    .insert({ client_id: current.id, ...prompt });

  if (error) fail(PATH, dbMessage(error, "Não foi possível cadastrar a pergunta."));
  revalidatePath(PATH);
}

/** Pausa ou reativa uma pergunta. Reativar respeita o limite do cliente. */
export async function togglePrompt(formData: FormData) {
  const { supabase } = await requireWyse();
  const id = field(formData, "id");
  const activate = field(formData, "activate") === "true";
  if (!id) fail(PATH, "Pergunta não identificada.");

  const { error } = await supabase.from("prompts").update({ active: activate }).eq("id", id);
  if (error) fail(PATH, dbMessage(error, "Não foi possível alterar a pergunta."));
  revalidatePath(PATH);
}

/** Salva a edição. Se o texto mudou, o banco cria uma nova versão. */
export async function revisePrompt(formData: FormData) {
  const { supabase } = await requireWyse();
  const id = field(formData, "id");
  if (!id) fail(PATH, "Pergunta não identificada.");

  const editPath = `${PATH}/${id}`;
  const prompt = readPrompt(formData, editPath);

  const { error } = await supabase.rpc("revise_prompt", {
    p_prompt_id: id,
    p_text: prompt.text,
    p_kind: prompt.kind,
    p_persona: prompt.persona,
    p_journey_stage: prompt.journey_stage,
    p_search_enabled: prompt.search_enabled,
  });

  if (error) fail(editPath, dbMessage(error, "Não foi possível salvar a pergunta."));
  revalidatePath(PATH);
  redirect(PATH);
}
