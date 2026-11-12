import { postJson, requireKey } from "./http";
import {
  EngineError,
  SourceList,
  isRecord,
  type AskOptions,
  type EngineRequest,
  type EngineResult,
  type EngineSource,
} from "./types";

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const KEY = "PERPLEXITY_API_KEY";

/** Modelo usado. Pode ser trocado pela variável PERPLEXITY_MODEL. */
export function perplexityModel(): string {
  return process.env.PERPLEXITY_MODEL || "sonar";
}

/**
 * Converte o retorno da API do Perplexity para o formato comum.
 * As fontes vêm de `search_results` (com título e data); se a API devolver só
 * a lista `citations`, ela é usada no lugar.
 */
export function parsePerplexityResponse(payload: unknown): {
  text: string;
  sources: EngineSource[];
  model: string | null;
} {
  if (!isRecord(payload)) throw new EngineError("Resposta do Perplexity em formato inesperado.");

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = isRecord(first) && isRecord(first.message) ? first.message : null;
  const text = message && typeof message.content === "string" ? message.content : "";
  if (!text) throw new EngineError("O Perplexity não devolveu texto de resposta.");

  const sources = new SourceList();
  if (Array.isArray(payload.search_results)) {
    for (const item of payload.search_results) {
      if (isRecord(item)) sources.add(item.url, item.title, item.date);
    }
  }
  if (sources.items.length === 0 && Array.isArray(payload.citations)) {
    for (const url of payload.citations) sources.add(url);
  }

  return {
    text,
    sources: sources.items,
    model: typeof payload.model === "string" ? payload.model : null,
  };
}

/** Faz uma pergunta ao Perplexity, como um usuário faria, sem instrução extra. */
export async function askPerplexity(
  request: EngineRequest,
  options: AskOptions = {},
): Promise<EngineResult> {
  const apiKey = requireKey(KEY);
  const model = perplexityModel();

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: request.question }],
  };
  if (request.searchEnabled) {
    body.web_search_options = { user_location: { country: "BR" } };
  } else {
    body.disable_search = true;
  }

  const startedAt = Date.now();
  const payload = await postJson({
    engine: "Perplexity",
    keyName: KEY,
    url: ENDPOINT,
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    options,
  });
  const parsed = parsePerplexityResponse(payload);

  return {
    text: parsed.text,
    sources: parsed.sources,
    searchExecuted: request.searchEnabled && parsed.sources.length > 0,
    model: parsed.model ?? model,
    raw: payload,
    latencyMs: Date.now() - startedAt,
  };
}
