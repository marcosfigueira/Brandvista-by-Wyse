import type { EngineResult, EngineSource } from "@/lib/engines/types";

/**
 * Linha da tabela `responses`. Todas as linhas levam os mesmos campos, com
 * valor explícito: numa gravação em lote, um campo ausente em parte das
 * linhas é gravado como nulo, e não com o valor padrão da coluna.
 */
export type ResponseRow = {
  run_id: string;
  prompt_id: string;
  engine: string;
  model: string;
  repetition: number;
  search_enabled: boolean;
  search_executed: boolean | null;
  status: "ok" | "erro";
  error_message: string | null;
  raw_text: string | null;
  sources: EngineSource[];
  raw_payload: unknown;
  latency_ms: number | null;
};

type Base = Pick<ResponseRow, "run_id" | "prompt_id" | "engine" | "repetition" | "search_enabled">;

export function okRow(base: Base, result: EngineResult): ResponseRow {
  return {
    ...base,
    model: result.model,
    search_executed: result.searchExecuted,
    status: "ok",
    error_message: null,
    raw_text: result.text,
    sources: result.sources,
    raw_payload: result.raw,
    latency_ms: result.latencyMs,
  };
}

export function errorRow(base: Base, model: string, error: unknown): ResponseRow {
  return {
    ...base,
    model,
    search_executed: null,
    status: "erro",
    error_message:
      error instanceof Error ? error.message : "Erro desconhecido ao consultar o motor.",
    raw_text: null,
    sources: [],
    raw_payload: null,
    latency_ms: null,
  };
}
