import { engineById } from "@/lib/engines";
import { errorRow, okRow } from "@/lib/response-rows";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAnalysis, hasIncorrectClaim } from "@/lib/analysis/build";
import { judgeResponse } from "@/lib/analysis/judge";
import { ANALYZER_VERSION, type BrandContext } from "@/lib/analysis/types";
import {
  ANALYSIS_REQUESTED,
  ENGINE_REQUESTED,
  RUN_CANCELLED,
  RUN_REQUESTED,
  inngest,
  type EngineJob,
  type RunPrompt,
} from "./client";
import { callOrder } from "./order";

async function markFailed(runId: string) {
  await createAdminClient()
    .from("runs")
    .update({ status: "falhou", finished_at: new Date().toISOString() })
    .eq("id", runId);
}

/**
 * A parte de um motor em uma rodada. Cada pergunta é um passo, feito um de
 * cada vez. O limite de concorrência por motor vale para todos os clientes:
 * duas rodadas simultâneas não disparam duas perguntas juntas no mesmo motor.
 */
export const collectEngine = inngest.createFunction(
  {
    id: "coletar-motor",
    triggers: [{ event: ENGINE_REQUESTED }],
    concurrency: { key: "event.data.engine", limit: 1 },
    cancelOn: [{ event: RUN_CANCELLED, match: "data.runId" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const job = event.data as EngineJob;
    const engine = engineById(job.engine);
    if (!engine) throw new Error(`Motor desconhecido: ${job.engine}`);

    let ok = 0;
    let failed = 0;
    for (const { prompt, repetition } of callOrder(job.prompts, job.repetitions)) {
      const success = await step.run(`${prompt.id}-r${repetition}`, async () => {
        const base = {
          run_id: job.runId,
          prompt_id: prompt.id,
          engine: engine.id,
          repetition,
          search_enabled: prompt.search_enabled,
        };
        // Um erro do motor vira uma resposta com erro, registrada; só uma
        // falha ao gravar no banco faz o passo ser tentado de novo.
        let row;
        try {
          const result = await engine.ask({
            question: prompt.text,
            searchEnabled: prompt.search_enabled,
            country: job.country ?? undefined,
          });
          row = okRow(base, result);
        } catch (error) {
          console.error(`Erro do motor ${engine.id}:`, error instanceof Error ? error.message : error);
          row = errorRow(base, engine.model(), error);
        }
        const { error } = await createAdminClient()
          .from("responses")
          .upsert(row, { onConflict: "run_id,prompt_id,engine,repetition" });
        if (error) throw new Error(`Não foi possível gravar a resposta: ${error.message}`);
        // O passo devolve só o resultado; o texto fica no banco.
        return row.status === "ok";
      });
      if (success) ok += 1;
      else failed += 1;
    }
    return { engine: engine.id, ok, failed };
  },
);

/** Quantas respostas são analisadas ao mesmo tempo. */
const ANALYSIS_BATCH = 3;

/** Carrega o que a marca cadastrou em Marca: o gabarito da análise. */
async function loadBrandContext(clientId: string): Promise<BrandContext> {
  const supabase = createAdminClient();
  const [client, facts, attributes, competitors] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("brand_facts").select("statement").eq("client_id", clientId).eq("active", true),
    supabase.from("brand_attributes").select("name").eq("client_id", clientId).eq("active", true),
    supabase.from("competitors").select("name, name_variants").eq("client_id", clientId),
  ]);
  if (client.error || !client.data) throw new Error(`Marca não encontrada: ${client.error?.message ?? clientId}`);
  return {
    name: client.data.name as string,
    variants: (client.data.name_variants as string[] | null) ?? [],
    domain: (client.data.domain as string | null) ?? null,
    category: (client.data.category as string | null) ?? null,
    description: (client.data.canonical_description as string | null) ?? null,
    facts: (facts.data ?? []).map((row) => row.statement as string),
    attributes: (attributes.data ?? []).map((row) => row.name as string),
    competitors: (competitors.data ?? []).map((row) => ({
      name: row.name as string,
      variants: (row.name_variants as string[] | null) ?? [],
    })),
  };
}

/** Analisa uma resposta e grava o resultado. Devolve falso se a resposta não existe mais. */
async function analyzeOne(responseId: string, brand: BrandContext): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: response, error } = await supabase
    .from("responses")
    .select("id, raw_text, sources, prompts(text)")
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = response as unknown as {
    raw_text: string | null;
    sources: { domain?: string | null }[] | null;
    prompts: { text: string } | null;
  } | null;
  if (!row?.raw_text || !row.prompts) return false;

  const { judgement, model } = await judgeResponse(brand, row.prompts.text, row.raw_text);
  const analysis = buildAnalysis({
    brand,
    question: row.prompts.text,
    responseText: row.raw_text,
    sourceDomains: (Array.isArray(row.sources) ? row.sources : []).map((source) => source?.domain ?? null),
    judgement,
  });
  const saved = await supabase.from("analyses").upsert(
    {
      response_id: responseId,
      analyzer_version: ANALYZER_VERSION,
      analyzer_model: model,
      result: analysis,
      flagged_incorrect: hasIncorrectClaim(analysis),
    },
    { onConflict: "response_id,analyzer_version" },
  );
  if (saved.error) throw new Error(`Não foi possível gravar a análise: ${saved.error.message}`);
  return true;
}

/**
 * Analisa as respostas válidas de uma rodada. Roda ao fim da coleta e também
 * a pedido, pelo botão em Respostas. Respostas já analisadas nesta versão do
 * analisador são puladas, a menos que o pedido peça para refazer.
 */
export const analyzeRun = inngest.createFunction(
  {
    id: "analisar-rodada",
    triggers: [{ event: ANALYSIS_REQUESTED }],
    cancelOn: [{ event: RUN_CANCELLED, match: "data.runId" }],
    concurrency: { limit: ANALYSIS_BATCH },
    retries: 2,
    onFailure: async ({ event }) => {
      // A coleta continua válida; a rodada volta a "concluída" com a análise incompleta.
      const runId = (event.data.event.data as { runId?: string }).runId;
      if (!runId) return;
      await createAdminClient()
        .from("runs")
        .update({ status: "concluida" })
        .eq("id", runId)
        .eq("status", "analisando");
    },
  },
  async ({ event, step }) => {
    const { runId, redo } = event.data as { runId: string; redo?: boolean };

    const plan = await step.run("carregar-analise", async () => {
      const supabase = createAdminClient();
      const { data: run, error } = await supabase.from("runs").select("id, client_id").eq("id", runId).single();
      if (error || !run) throw new Error(`Rodada não encontrada: ${error?.message ?? runId}`);

      const { data: rows, error: rowsError } = await supabase
        .from("responses")
        .select("id, analyses(analyzer_version)")
        .eq("run_id", runId)
        .eq("status", "ok")
        .order("created_at");
      if (rowsError) throw new Error(rowsError.message);

      const pending = ((rows ?? []) as unknown as { id: string; analyses: { analyzer_version: string }[] | null }[])
        .filter((row) => redo || !(row.analyses ?? []).some((item) => item.analyzer_version === ANALYZER_VERSION))
        .map((row) => row.id);

      await supabase.from("runs").update({ status: "analisando" }).eq("id", runId);
      return { responseIds: pending, brand: await loadBrandContext(run.client_id as string) };
    });

    let analyzed = 0;
    let failed = 0;
    for (let start = 0; start < plan.responseIds.length; start += ANALYSIS_BATCH) {
      const batch = plan.responseIds.slice(start, start + ANALYSIS_BATCH);
      const results = await Promise.all(
        batch.map((responseId) =>
          step.run(`analisar-${responseId}`, async () => {
            try {
              return await analyzeOne(responseId, plan.brand);
            } catch (error) {
              // Uma resposta que o analisador não conseguiu ler não derruba a rodada.
              console.error("Erro do analisador:", error instanceof Error ? error.message : error);
              return false;
            }
          }),
        ),
      );
      for (const ok of results) {
        if (ok) analyzed += 1;
        else failed += 1;
      }
    }

    await step.run("encerrar-analise", async () => {
      const { error } = await createAdminClient()
        .from("runs")
        .update({ status: "concluida", finished_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "analisando");
      if (error) throw new Error(error.message);
    });
    return { analyzed, failed };
  },
);

/**
 * Rodada completa: fotografa as perguntas ativas, entrega uma parte a cada
 * motor, espera todos terminarem e manda as respostas para análise.
 */
export const collectRun = inngest.createFunction(
  {
    id: "coletar-rodada",
    triggers: [{ event: RUN_REQUESTED }],
    cancelOn: [{ event: RUN_CANCELLED, match: "data.runId" }],
    retries: 1,
    onFailure: async ({ event }) => {
      const runId = (event.data.event.data as { runId?: string }).runId;
      if (runId) await markFailed(runId);
    },
  },
  async ({ event, step }) => {
    const runId = (event.data as { runId: string }).runId;

    const plan = await step.run("carregar-rodada", async () => {
      const supabase = createAdminClient();
      const { data: run, error } = await supabase
        .from("runs")
        .select("id, client_id, engines, repetitions, status")
        .eq("id", runId)
        .single();
      if (error || !run) throw new Error(`Rodada não encontrada: ${error?.message ?? runId}`);

      const [promptsResult, clientResult] = await Promise.all([
        supabase
          .from("prompts")
          .select("id, text, search_enabled")
          .eq("client_id", run.client_id)
          .eq("active", true)
          .order("created_at"),
        supabase.from("clients").select("country").eq("id", run.client_id).maybeSingle(),
      ]);
      if (promptsResult.error) throw new Error(promptsResult.error.message);

      const prompts = (promptsResult.data ?? []) as RunPrompt[];
      const engines = run.engines as string[];
      await supabase
        .from("runs")
        .update({
          status: "coletando",
          started_at: new Date().toISOString(),
          expected_responses: prompts.length * engines.length * run.repetitions,
        })
        .eq("id", runId);

      return {
        engines,
        repetitions: run.repetitions as number,
        country: (clientResult.data?.country as string | undefined) ?? null,
        prompts,
      };
    });

    if (plan.prompts.length > 0) {
      await Promise.all(
        plan.engines.map((engine) =>
          step.invoke(`motor-${engine}`, {
            function: collectEngine,
            data: {
              runId,
              engine,
              country: plan.country,
              repetitions: plan.repetitions,
              prompts: plan.prompts,
            } satisfies EngineJob,
            timeout: "12h",
          }),
        ),
      );
    }

    const collected = await step.run("encerrar-coleta", async () => {
      const supabase = createAdminClient();
      const { count } = await supabase
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("status", "ok");
      const ok = count ?? 0;
      // Sem nenhuma resposta válida não há o que analisar.
      const { error } = await supabase
        .from("runs")
        .update(
          ok > 0
            ? { status: "analisando" }
            : { status: "falhou", finished_at: new Date().toISOString() },
        )
        .eq("id", runId);
      if (error) throw new Error(error.message);
      return { ok };
    });

    if (collected.ok === 0) return { status: "falhou", ok: 0 };

    // A análise é uma função à parte: se ela falhar, a coleta continua válida.
    await step.sendEvent("pedir-analise", { name: ANALYSIS_REQUESTED, data: { runId } });
    return { status: "analisando", ok: collected.ok };
  },
);

export const functions = [collectRun, collectEngine, analyzeRun];
