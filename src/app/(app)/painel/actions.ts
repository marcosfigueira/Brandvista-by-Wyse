"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fail, field } from "@/lib/forms";
import { REPORT_REQUESTED, inngest } from "@/lib/inngest/client";
import { requireWyse } from "@/lib/session";
import { serviceKey } from "@/lib/supabase/admin";

/** Pede o relatório de uma rodada já analisada. Refaz, se já existir. */
export async function requestReport(formData: FormData) {
  const { supabase } = await requireWyse();
  const runId = field(formData, "run_id");
  if (!runId) fail("/", "Rodada não identificada.");
  const back = `/?rodada=${runId}`;

  if (!serviceKey()) fail(back, "A variável SUPABASE_SERVICE_ROLE_KEY não está configurada na Vercel.");
  if (!process.env.ANTHROPIC_API_KEY) {
    fail(back, "A variável ANTHROPIC_API_KEY, usada para escrever o relatório, não está configurada na Vercel.");
  }

  const { error } = await supabase.from("reports").upsert(
    { run_id: runId, status: "gerando", error_message: null, updated_at: new Date().toISOString() },
    { onConflict: "run_id" },
  );
  if (error) {
    console.error("Erro ao registrar o pedido de relatório:", error.code, error.message);
    fail(back, "Não foi possível pedir o relatório. Confira se o arquivo 0008_relatorios.sql foi executado no Supabase.");
  }

  try {
    await inngest.send({ name: REPORT_REQUESTED, data: { runId } });
  } catch (sendError) {
    console.error("Erro ao pedir o relatório:", sendError instanceof Error ? sendError.message : sendError);
    await supabase.from("reports").update({ status: "falhou", error_message: "A fila não aceitou o pedido." }).eq("run_id", runId);
    fail(back, "A fila (Inngest) não aceitou o pedido do relatório. Confira as variáveis INNGEST_* na Vercel.");
  }

  revalidatePath("/");
  redirect(back);
}
