"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentClient } from "@/lib/current-client";
import { dbMessage, fail, field, optional } from "@/lib/forms";
import { requireWyse } from "@/lib/session";
import { askPerplexity, perplexityModel } from "@/lib/engines/perplexity";
import { PROMPT_KINDS } from "@/lib/types";

const PATH = "/perguntas";

/** Quantas perguntas uma rodada de teste aceita. */
const TEST_RUN_MAX = 5;

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

/**
 * Rodada de teste: faz até 5 perguntas ao Perplexity, uma vez cada, e guarda
 * as respostas brutas. Serve para conferir as respostas antes das rodadas
 * completas; não entra no histórico de indicadores.
 */
export async function startTestRun(formData: FormData) {
  const { supabase } = await requireWyse();
  const { current } = await getCurrentClient();
  if (!current) fail(PATH, "Selecione ou cadastre uma empresa primeiro.");

  const ids = formData.getAll("prompt").map(String).filter(Boolean);
  if (ids.length === 0) fail(PATH, "Marque ao menos uma pergunta para o teste.");
  if (ids.length > TEST_RUN_MAX) {
    fail(PATH, `O teste aceita até ${TEST_RUN_MAX} perguntas por vez. Você marcou ${ids.length}.`);
  }

  const [promptsResult, limitsResult] = await Promise.all([
    supabase
      .from("prompts")
      .select("id, text, search_enabled")
      .eq("client_id", current.id)
      .eq("active", true)
      .in("id", ids),
    supabase.from("client_limits").select("active").eq("client_id", current.id).maybeSingle(),
  ]);

  const prompts = (promptsResult.data ?? []) as {
    id: string;
    text: string;
    search_enabled: boolean;
  }[];
  if (prompts.length === 0) fail(PATH, "As perguntas marcadas não estão ativas.");
  if (limitsResult.data && limitsResult.data.active === false) {
    fail(PATH, "O tracking deste cliente está desativado em Controle.");
  }

  const { data: run, error: runError } = await supabase
    .from("runs")
    .insert({
      client_id: current.id,
      kind: "teste",
      engines: ["perplexity"],
      repetitions: 1,
      status: "coletando",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("Erro ao criar a rodada:", runError?.code, runError?.message);
    fail(
      PATH,
      "Não foi possível criar a rodada. Confira se o arquivo 0003_tipo_de_rodada.sql foi executado no Supabase.",
    );
  }

  const model = perplexityModel();
  const rows = await Promise.all(
    prompts.map(async (prompt) => {
      const base = {
        run_id: run.id,
        prompt_id: prompt.id,
        engine: "perplexity",
        repetition: 1,
        search_enabled: prompt.search_enabled,
      };
      try {
        const result = await askPerplexity({
          question: prompt.text,
          searchEnabled: prompt.search_enabled,
        });
        return {
          ...base,
          model: result.model,
          search_executed: result.searchExecuted,
          status: "ok",
          raw_text: result.text,
          sources: result.sources,
          raw_payload: result.raw,
          latency_ms: result.latencyMs,
        };
      } catch (error) {
        return {
          ...base,
          model,
          status: "erro",
          error_message:
            error instanceof Error ? error.message : "Erro desconhecido ao consultar o motor.",
        };
      }
    }),
  );

  const { error: insertError } = await supabase.from("responses").insert(rows);
  const allFailed = rows.every((row) => row.status === "erro");

  await supabase
    .from("runs")
    .update({
      status: insertError || allFailed ? "falhou" : "concluida",
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  if (insertError) {
    fail(PATH, dbMessage(insertError, "As respostas foram coletadas, mas não foi possível gravá-las."));
  }

  revalidatePath("/respostas");
  redirect(`/respostas?rodada=${run.id}`);
}
