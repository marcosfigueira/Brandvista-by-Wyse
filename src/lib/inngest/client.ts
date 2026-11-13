import { Inngest } from "inngest";
import type { RunPrompt } from "./order";

/** Cliente da fila. As chaves vêm das variáveis INNGEST_* na Vercel. */
export const inngest = new Inngest({ id: "brandvista" });

/** Evento que inicia a coleta de uma rodada completa. */
export const RUN_REQUESTED = "brandvista/rodada.solicitada";

/** Evento interno: a parte de um motor dentro de uma rodada. */
export const ENGINE_REQUESTED = "brandvista/rodada.motor";

/** Evento que pede a análise das respostas de uma rodada. */
export const ANALYSIS_REQUESTED = "brandvista/rodada.analisar";

/** Evento que interrompe tudo o que estiver rodando para uma rodada. */
export const RUN_CANCELLED = "brandvista/rodada.cancelada";

export type { RunPrompt };

export type EngineJob = {
  runId: string;
  engine: string;
  country: string | null;
  repetitions: number;
  prompts: RunPrompt[];
};
