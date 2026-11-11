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

const ENDPOINT = "https://api.openai.com/v1/responses";
const KEY = "OPENAI_API_KEY";

/** Modelo usado. Pode ser trocado pela variável OPENAI_MODEL. */
export function openaiModel(): string {
  return process.env.OPENAI_MODEL || "chat-latest";
}

/**
 * Converte o retorno da Responses API. A lista `output` traz um item
 * `web_search_call` para cada busca feita e um item `message` com o texto e
 * as citações (`url_citation`).
 */
export function parseOpenAIResponse(payload: unknown): {
  text: string;
  sources: EngineSource[];
  searchExecuted: boolean;
  model: string | null;
} {
  if (!isRecord(payload)) throw new EngineError("Resposta do ChatGPT em formato inesperado.");

  const output = Array.isArray(payload.output) ? payload.output : [];
  const sources = new SourceList();
  const parts: string[] = [];
  let searchExecuted = false;

  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "web_search_call") searchExecuted = true;
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (!isRecord(block) || block.type !== "output_text") continue;
      if (typeof block.text === "string") parts.push(block.text);
      if (!Array.isArray(block.annotations)) continue;
      for (const annotation of block.annotations) {
        if (isRecord(annotation) && annotation.type === "url_citation") {
          sources.add(annotation.url, annotation.title);
        }
      }
    }
  }

  const text = parts.join("\n").trim();
  if (!text) throw new EngineError("O ChatGPT não devolveu texto de resposta.");

  return {
    text,
    sources: sources.items,
    searchExecuted,
    model: typeof payload.model === "string" ? payload.model : null,
  };
}

/** Faz uma pergunta ao ChatGPT pela API, como um usuário faria. */
export async function askOpenAI(
  request: EngineRequest,
  options: AskOptions = {},
): Promise<EngineResult> {
  const apiKey = requireKey(KEY);
  const model = openaiModel();

  const body: Record<string, unknown> = { model, input: request.question };
  if (request.searchEnabled) {
    body.tools = [
      { type: "web_search", user_location: { type: "approximate", country: "BR" } },
    ];
  }

  const startedAt = Date.now();
  const payload = await postJson({
    engine: "ChatGPT",
    keyName: KEY,
    url: ENDPOINT,
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    options,
  });
  const parsed = parseOpenAIResponse(payload);

  return {
    text: parsed.text,
    sources: parsed.sources,
    searchExecuted: parsed.searchExecuted,
    model: parsed.model ?? model,
    raw: payload,
    latencyMs: Date.now() - startedAt,
  };
}
