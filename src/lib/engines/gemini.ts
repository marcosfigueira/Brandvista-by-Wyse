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

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const KEY = "GEMINI_API_KEY";

/** Modelo usado. Pode ser trocado pela variável GEMINI_MODEL. */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

/** Um título que é só um domínio, como "exemplo.com.br". */
function asDomain(title: unknown): string | null {
  if (typeof title !== "string") return null;
  const value = title.trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value) ? value : null;
}

/**
 * Converte o retorno da Interactions API. A lista `steps` traz um passo
 * `google_search_call` para cada busca e um passo `model_output` com o texto
 * e as citações (`url_citation`). Os links do Gemini podem ser de
 * redirecionamento; quando o título é um domínio, ele vale como domínio.
 */
export function parseGeminiResponse(payload: unknown): {
  text: string;
  sources: EngineSource[];
  searchExecuted: boolean;
  model: string | null;
} {
  if (!isRecord(payload)) throw new EngineError("Resposta do Gemini em formato inesperado.");

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const sources = new SourceList();
  const parts: string[] = [];
  let searchExecuted = false;

  for (const step of steps) {
    if (!isRecord(step)) continue;
    if (step.type === "google_search_call") searchExecuted = true;
    if (step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const block of step.content) {
      if (!isRecord(block) || block.type !== "text") continue;
      if (typeof block.text === "string") parts.push(block.text);
      if (!Array.isArray(block.annotations)) continue;
      for (const annotation of block.annotations) {
        if (isRecord(annotation) && annotation.type === "url_citation") {
          sources.add(annotation.url, annotation.title, undefined, asDomain(annotation.title));
        }
      }
    }
  }

  const text = parts.join("\n").trim();
  if (!text) throw new EngineError("O Gemini não devolveu texto de resposta.");

  return {
    text,
    sources: sources.items,
    searchExecuted,
    model: typeof payload.model === "string" ? payload.model : null,
  };
}

/**
 * Faz uma pergunta ao Gemini pela API, como um usuário faria. A API do Gemini
 * não tem parâmetro de localização, então o país da marca não é enviado.
 */
export async function askGemini(
  request: EngineRequest,
  options: AskOptions = {},
): Promise<EngineResult> {
  const apiKey = requireKey(KEY);
  const model = geminiModel();

  const body: Record<string, unknown> = { model, input: request.question };
  if (request.searchEnabled) body.tools = [{ type: "google_search" }];

  const startedAt = Date.now();
  const payload = await postJson({
    engine: "Gemini",
    keyName: KEY,
    url: ENDPOINT,
    headers: { "x-goog-api-key": apiKey },
    body,
    options,
  });
  const parsed = parseGeminiResponse(payload);

  return {
    text: parsed.text,
    sources: parsed.sources,
    searchExecuted: parsed.searchExecuted,
    model: parsed.model ?? model,
    raw: payload,
    latencyMs: Date.now() - startedAt,
  };
}
