import { anthropicModel, askAnthropic } from "./anthropic";
import { askGemini, geminiModel } from "./gemini";
import { askOpenAI, openaiModel } from "./openai";
import { askPerplexity, perplexityModel } from "./perplexity";
import type { AskOptions, EngineRequest, EngineResult } from "./types";

export type EngineId = "chatgpt" | "gemini" | "claude" | "perplexity";

export type Engine = {
  id: EngineId;
  label: string;
  /** Variável de ambiente com a chave de API. */
  keyName: string;
  /** Modelo configurado no momento. */
  model: () => string;
  ask: (request: EngineRequest, options?: AskOptions) => Promise<EngineResult>;
};

/** Os quatro motores, na ordem em que aparecem nas telas. */
export const ENGINES: readonly Engine[] = [
  { id: "chatgpt", label: "ChatGPT", keyName: "OPENAI_API_KEY", model: openaiModel, ask: askOpenAI },
  { id: "gemini", label: "Gemini", keyName: "GEMINI_API_KEY", model: geminiModel, ask: askGemini },
  { id: "claude", label: "Claude", keyName: "ANTHROPIC_API_KEY", model: anthropicModel, ask: askAnthropic },
  { id: "perplexity", label: "Perplexity", keyName: "PERPLEXITY_API_KEY", model: perplexityModel, ask: askPerplexity },
];

export function engineById(id: string): Engine | undefined {
  return ENGINES.find((engine) => engine.id === id);
}

export function engineLabel(id: string): string {
  return engineById(id)?.label ?? id;
}
