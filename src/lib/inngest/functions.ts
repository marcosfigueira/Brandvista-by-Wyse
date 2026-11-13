import { engineById } from "@/lib/engines";
import { errorRow, okRow } from "@/lib/response-rows";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENGINE_REQUESTED, RUN_REQUESTED, inngest, type EngineJob, type RunPrompt } from "./client";
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

/**
 * Rodada completa: fotografa as perguntas ativas, entrega uma parte a cada
 * motor, espera todos terminarem e encerra a rodada.
 */
export const collectRun = inngest.createFunction(
  {
    id: "coletar-rodada",
    triggers: [{ event: RUN_REQUESTED }],
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

    return step.run("encerrar-rodada", async () => {
      const supabase = createAdminClient();
      const { count } = await supabase
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("status", "ok");
      const status = (count ?? 0) > 0 ? "concluida" : "falhou";
      const { error } = await supabase
        .from("runs")
        .update({ status, finished_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw new Error(error.message);
      return { status, ok: count ?? 0 };
    });
  },
);

export const functions = [collectRun, collectEngine];
