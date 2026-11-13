"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail, field } from "@/lib/forms";
import { ANALYSIS_REQUESTED, RUN_CANCELLED, inngest } from "@/lib/inngest/client";
import { requireWyse } from "@/lib/session";
import { serviceKey } from "@/lib/supabase/admin";

const PATH = "/respostas";

/** Interrompe uma rodada em andamento. As respostas já coletadas ficam guardadas. */
export async function cancelRun(formData: FormData) {
  const { supabase } = await requireWyse();
  const runId = field(formData, "run_id");
  if (!runId) fail(PATH, "Rodada não identificada.");
  const back = `${PATH}?rodada=${runId}`;

  const { data, error } = await supabase
    .from("runs")
    .update({ status: "cancelada", finished_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["pendente", "coletando", "analisando"])
    .select("id");

  if (error) {
    console.error("Erro ao cancelar a rodada:", error.code, error.message);
    fail(back, "Não foi possível cancelar. Confira se o arquivo 0007_analise_e_cancelamento.sql foi executado no Supabase.");
  }
  if ((data ?? []).length === 0) fail(back, "Esta rodada já não está em andamento.");

  try {
    await inngest.send({ name: RUN_CANCELLED, data: { runId } });
  } catch (sendError) {
    // A rodada já consta como cancelada; a fila só não foi avisada.
    console.error("Erro ao avisar a fila do cancelamento:", sendError instanceof Error ? sendError.message : sendError);
  }

  revalidatePath(PATH);
  redirect(back);
}

/** Pede a análise das respostas de uma rodada. Com `redo`, refaz as já analisadas. */
export async function requestAnalysis(formData: FormData) {
  const { supabase } = await requireWyse();
  const runId = field(formData, "run_id");
  if (!runId) fail(PATH, "Rodada não identificada.");
  const back = `${PATH}?rodada=${runId}`;

  if (!serviceKey()) fail(back, "A variável SUPABASE_SERVICE_ROLE_KEY não está configurada na Vercel.");
  if (!process.env.ANTHROPIC_API_KEY) {
    fail(back, "A variável ANTHROPIC_API_KEY, usada pelo analisador, não está configurada na Vercel.");
  }

  const { data: run } = await supabase.from("runs").select("id, status").eq("id", runId).maybeSingle();
  if (!run) fail(back, "Rodada não encontrada.");
  if (run.status !== "concluida" && run.status !== "falhou" && run.status !== "cancelada") {
    fail(back, "Espere a rodada terminar antes de pedir a análise.");
  }

  try {
    await inngest.send({
      name: ANALYSIS_REQUESTED,
      data: { runId, redo: field(formData, "redo") === "true" },
    });
  } catch (error) {
    console.error("Erro ao pedir a análise:", error instanceof Error ? error.message : error);
    fail(back, "A fila (Inngest) não aceitou o pedido de análise. Confira as variáveis INNGEST_* na Vercel.");
  }

  await supabase.from("runs").update({ status: "analisando" }).eq("id", runId);
  revalidatePath(PATH);
  redirect(back);
}
