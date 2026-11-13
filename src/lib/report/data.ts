import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBenchmark } from "@/lib/analysis/benchmark";
import { listClaims, summarizeQuestions, summarizeSources, type DetailRow } from "@/lib/analysis/breakdowns";
import { normalize } from "@/lib/analysis/text";
import { ANALYZER_VERSION, type Analysis } from "@/lib/analysis/types";
import { saveSnapshots } from "@/lib/snapshots";
import type { IndicatorValue, ReportData } from "./types";

const MAX_CLAIMS = 30;

/** Junta, a partir do banco, tudo o que o relatório de uma rodada mostra. */
export async function buildReportData(supabase: SupabaseClient, runId: string): Promise<ReportData> {
  const { data: run, error } = await supabase
    .from("runs")
    .select("id, client_id, kind, engines, repetitions, created_at")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error(`Rodada não encontrada: ${error?.message ?? runId}`);

  const [client, competitors, attributes, facts, responses, snapshots, earlier] = await Promise.all([
    supabase.from("clients").select("*").eq("id", run.client_id).single(),
    supabase.from("competitors").select("name, name_variants, domain").eq("client_id", run.client_id),
    supabase.from("brand_attributes").select("name, weight").eq("client_id", run.client_id).eq("active", true),
    supabase.from("brand_facts").select("statement").eq("client_id", run.client_id).eq("active", true),
    supabase
      .from("responses")
      .select("id, engine, repetition, prompt_id, sources, prompts(text, kind), analyses(analyzer_version, result)")
      .eq("run_id", runId)
      .eq("status", "ok"),
    saveSnapshots(supabase, runId),
    supabase
      .from("runs")
      .select("id, created_at")
      .eq("client_id", run.client_id)
      .eq("kind", "completa")
      .eq("status", "concluida")
      .lte("created_at", run.created_at)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (client.error || !client.data) throw new Error(`Marca não encontrada: ${client.error?.message ?? ""}`);
  if (responses.error) throw new Error(responses.error.message);

  const rows: DetailRow[] = [];
  for (const row of (responses.data ?? []) as unknown as {
    id: string;
    engine: string;
    repetition: number;
    prompt_id: string;
    sources: DetailRow["sources"] | null;
    prompts: { text: string; kind: string } | null;
    analyses: { analyzer_version: string; result: Analysis }[] | null;
  }[]) {
    const analysis = (row.analyses ?? []).find((item) => item.analyzer_version === ANALYZER_VERSION);
    if (!analysis || !row.prompts) continue;
    rows.push({
      responseId: row.id,
      engine: row.engine,
      repetition: row.repetition,
      promptId: row.prompt_id,
      question: row.prompts.text,
      kind: row.prompts.kind,
      sources: Array.isArray(row.sources) ? row.sources : [],
      analysis: analysis.result,
    });
  }
  if (rows.length === 0) throw new Error("A rodada não tem respostas analisadas.");

  const brand = {
    name: client.data.name as string,
    variants: (client.data.name_variants as string[] | null) ?? [],
  };
  const rivals = ((competitors.data ?? []) as { name: string; name_variants: string[] | null; domain: string | null }[]).map(
    (item) => ({ name: item.name, variants: item.name_variants ?? [], domain: item.domain }),
  );

  const indicators: Record<string, IndicatorValue> = {};
  const byEngine = new Map<string, Record<string, number>>();
  for (const item of snapshots) {
    if (item.engine === null) {
      indicators[item.indicator] = { value: item.value, numerator: item.numerator, denominator: item.denominator };
    } else {
      byEngine.set(item.engine, { ...(byEngine.get(item.engine) ?? {}), [item.indicator]: item.value });
    }
  }

  // Evolução: esta rodada e as completas anteriores, da mais antiga para a mais recente.
  const earlierRuns = ((earlier.data ?? []) as { id: string; created_at: string }[]).filter((item) => item.id !== runId);
  const past = new Map<string, Record<string, number>>();
  if (earlierRuns.length > 0) {
    const { data } = await supabase
      .from("kpi_snapshots")
      .select("run_id, indicator, value")
      .is("engine", null)
      .in("run_id", earlierRuns.map((item) => item.id));
    for (const item of (data ?? []) as { run_id: string; indicator: string; value: number }[]) {
      past.set(item.run_id, { ...(past.get(item.run_id) ?? {}), [item.indicator]: Number(item.value) });
    }
  }
  const point = (date: string, values: Record<string, number | undefined>) => ({
    date,
    sei: values.sei ?? null,
    visibility: values.brand_visibility ?? null,
    understanding: values.brand_understanding ?? null,
  });
  const current = Object.fromEntries(Object.entries(indicators).map(([name, item]) => [name, item.value]));
  const history = [
    ...[...earlierRuns].reverse().map((item) => point(item.created_at, past.get(item.id) ?? {})),
    ...(run.kind === "completa" ? [point(run.created_at as string, current)] : []),
  ];

  // Atributos desejados: em quantas respostas sobre a marca cada um apareceu.
  const aboutBrand = rows.filter((row) => row.kind === "associacao" || row.kind === "sobre_a_marca");
  const weights = (attributes.data ?? []) as { name: string; weight: number }[];

  return {
    client: {
      name: brand.name,
      category: (client.data.category as string | null) ?? null,
      description: (client.data.canonical_description as string | null) ?? null,
      domain: (client.data.domain as string | null) ?? null,
      country: (client.data.country as string | null) ?? null,
    },
    run: {
      id: runId,
      createdAt: run.created_at as string,
      kind: run.kind as string,
      responses: rows.length,
      repetitions: run.repetitions as number,
      engines: run.engines as string[],
    },
    indicators,
    previous: earlierRuns.length > 0 ? (past.get(earlierRuns[0].id) ?? null) : null,
    engines: [...byEngine.entries()].map(([engine, values]) => ({ engine, indicators: values })),
    history,
    benchmark: computeBenchmark(
      rows.map((row) => ({ question: row.question, analysis: row.analysis })),
      brand,
      rivals,
    ),
    questions: summarizeQuestions(rows, brand),
    incorrect: listClaims(rows, "incorreta").slice(0, MAX_CLAIMS),
    unverified: listClaims(rows, "nao_verificavel").slice(0, MAX_CLAIMS),
    sources: summarizeSources(rows, (client.data.domain as string | null) ?? null, rivals, 20),
    attributes: weights.map((item) => ({
      name: item.name,
      weight: item.weight,
      associated: aboutBrand.filter((row) =>
        row.analysis.attributes_associated.some((name) => normalize(name) === normalize(item.name)),
      ).length,
      responses: aboutBrand.length,
    })),
    facts: ((facts.data ?? []) as { statement: string }[]).map((item) => item.statement),
  };
}
