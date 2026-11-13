import type { SupabaseClient } from "@supabase/supabase-js";
import { CALC_VERSION } from "@/lib/analysis/indicators";
import type { DetailRow } from "@/lib/analysis/breakdowns";
import { ANALYZER_VERSION, type Analysis } from "@/lib/analysis/types";
import { getCurrentClient } from "@/lib/current-client";
import { getSession } from "@/lib/session";
import { saveSnapshots, type Snapshot } from "@/lib/snapshots";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { ClientSummary, Role } from "@/lib/types";

export type PainelRun = { id: string; kind: string; status: string; created_at: string };

export type Painel =
  | { state: "sem-config" }
  | { state: "sem-empresa" }
  | { state: "sem-rodada"; current: ClientSummary }
  | {
      state: "ok";
      supabase: SupabaseClient;
      role: Role;
      current: ClientSummary;
      runs: PainelRun[];
      selected: PainelRun;
      snapshots: Snapshot[];
    };

async function readSnapshots(supabase: SupabaseClient, runId: string): Promise<Snapshot[]> {
  const { data } = await supabase
    .from("kpi_snapshots")
    .select("engine, indicator, value, numerator, denominator")
    .eq("run_id", runId);
  return ((data ?? []) as Snapshot[]).map((item) => ({ ...item, value: Number(item.value) }));
}

const isCurrent = (snapshots: Snapshot[]) =>
  (snapshots.find((item) => item.engine === null && item.indicator === "calc_version")?.value ?? 0) >= CALC_VERSION;

/**
 * Indicadores de uma rodada. Se foram gravados por uma versão antiga do
 * cálculo (ou ainda não foram), a equipe Wyse os recalcula ao abrir a tela.
 */
async function snapshotsFor(supabase: SupabaseClient, role: Role, runId: string): Promise<Snapshot[]> {
  const stored = await readSnapshots(supabase, runId);
  if (isCurrent(stored) || role !== "wyse") return stored;
  try {
    const fresh = await saveSnapshots(supabase, runId);
    return fresh.length > 0 ? fresh : stored;
  } catch (error) {
    console.error("Erro ao calcular os indicadores:", error instanceof Error ? error.message : error);
    return stored;
  }
}

/** Empresa, rodadas concluídas e a rodada escolhida, para todas as telas do Painel. */
export async function getPainel(requestedRun: string | undefined): Promise<Painel> {
  if (getSupabaseEnv() === null) return { state: "sem-config" };
  const session = await getSession();
  const { current } = session ? await getCurrentClient() : { current: null };
  if (!session || !current) return { state: "sem-empresa" };

  const { supabase, role } = session;
  const { data } = await supabase
    .from("runs")
    .select("id, kind, status, created_at")
    .eq("client_id", current.id)
    .eq("status", "concluida")
    .order("created_at", { ascending: false })
    .limit(12);
  const runs = (data ?? []) as PainelRun[];

  // Por padrão, a rodada completa mais recente; sem nenhuma, a rodada mais recente.
  const selected =
    runs.find((run) => run.id === requestedRun) ?? runs.find((run) => run.kind === "completa") ?? runs[0] ?? null;
  if (!selected) return { state: "sem-rodada", current };

  const snapshots = await snapshotsFor(supabase, role, selected.id);
  if (snapshots.length === 0) return { state: "sem-rodada", current };
  return { state: "ok", supabase, role, current, runs, selected, snapshots };
}

export type HistoryPoint = {
  run: PainelRun;
  /** Valor de um indicador do agregado, ou nulo se não houve base. */
  value: (indicator: string) => number | null;
};

/** Rodadas completas concluídas, da mais antiga para a mais recente, com os indicadores do agregado. */
export async function loadHistory(painel: Extract<Painel, { state: "ok" }>): Promise<HistoryPoint[]> {
  const full = painel.runs.filter((run) => run.kind === "completa").reverse();
  const points: HistoryPoint[] = [];
  for (const run of full) {
    const snapshots =
      run.id === painel.selected.id ? painel.snapshots : await snapshotsFor(painel.supabase, painel.role, run.id);
    const values = new Map(snapshots.filter((item) => item.engine === null).map((item) => [item.indicator, item.value]));
    points.push({ run, value: (indicator) => values.get(indicator) ?? null });
  }
  return points;
}

/** Respostas analisadas de uma rodada, para as visões por pergunta, erros e fontes. */
export async function loadDetailRows(supabase: SupabaseClient, runId: string): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("responses")
    .select("id, engine, repetition, prompt_id, sources, prompts(text, kind), analyses(analyzer_version, result)")
    .eq("run_id", runId)
    .eq("status", "ok");
  if (error) {
    console.error("Erro ao carregar as respostas:", error.message);
    return [];
  }
  const rows: DetailRow[] = [];
  for (const row of (data ?? []) as unknown as {
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
  return rows;
}

export const painelDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const painelDay = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
