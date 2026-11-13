import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALC_VERSION,
  computeByEngine,
  computeSpread,
  libraryFingerprint,
  type AnalyzedRow,
  type Indicator,
} from "@/lib/analysis/indicators";
import { ANALYZER_VERSION, type Analysis } from "@/lib/analysis/types";

export type Snapshot = Indicator & { engine: string | null };

type Row = {
  engine: string;
  repetition: number;
  prompt_id: string;
  prompts: { kind: string } | null;
  analyses: { analyzer_version: string; result: Analysis }[] | null;
};

/**
 * Calcula os indicadores de uma rodada a partir das análises gravadas e
 * substitui os valores guardados em `kpi_snapshots`. Devolve o que gravou;
 * lista vazia se a rodada ainda não tem respostas analisadas.
 */
export async function saveSnapshots(supabase: SupabaseClient, runId: string): Promise<Snapshot[]> {
  const { data: run, error: runError } = await supabase.from("runs").select("id, client_id").eq("id", runId).single();
  if (runError || !run) throw new Error(`Rodada não encontrada: ${runError?.message ?? runId}`);

  const [responses, attributes] = await Promise.all([
    supabase
      .from("responses")
      .select("engine, repetition, prompt_id, prompts(kind), analyses(analyzer_version, result)")
      .eq("run_id", runId)
      .eq("status", "ok"),
    supabase.from("brand_attributes").select("name, weight").eq("client_id", run.client_id).eq("active", true),
  ]);
  if (responses.error) throw new Error(responses.error.message);

  const rows: AnalyzedRow[] = [];
  for (const row of (responses.data ?? []) as unknown as Row[]) {
    const analysis = (row.analyses ?? []).find((item) => item.analyzer_version === ANALYZER_VERSION);
    if (analysis && row.prompts) {
      rows.push({
        engine: row.engine,
        kind: row.prompts.kind,
        analysis: analysis.result,
        repetition: row.repetition,
        promptId: row.prompt_id,
      });
    }
  }
  if (rows.length === 0) return [];

  const weights = (attributes.data ?? []) as { name: string; weight: number }[];
  const snapshots: Snapshot[] = [
    ...computeByEngine(rows, weights).flatMap((group) =>
      group.indicators.map((indicator) => ({ ...indicator, engine: group.engine })),
    ),
    // Só no agregado: oscilação entre repetições, biblioteca usada e versão do cálculo.
    ...computeSpread(rows, weights).map((indicator) => ({ ...indicator, engine: null })),
    { engine: null, indicator: "library_fingerprint", value: libraryFingerprint(rows), numerator: null, denominator: null },
    { engine: null, indicator: "calc_version", value: CALC_VERSION, numerator: null, denominator: null },
  ];

  const removed = await supabase.from("kpi_snapshots").delete().eq("run_id", runId);
  if (removed.error) throw new Error(removed.error.message);
  const inserted = await supabase
    .from("kpi_snapshots")
    .insert(snapshots.map((snapshot) => ({ run_id: runId, ...snapshot })));
  if (inserted.error) throw new Error(inserted.error.message);
  return snapshots;
}
