import { postJson, requireKey } from "./http";
import {
  EngineError,
  SourceList,
  countryOf,
  isRecord,
  type AskOptions,
  type EngineRequest,
  type EngineResult,
  type EngineSource,
} from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const KEY = "ANTHROPIC_API_KEY";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

/** Modelo usado. Pode ser trocado pela variável ANTHROPIC_MODEL. */
export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

/** Versão da ferramenta de busca. Pode ser trocada por ANTHROPIC_WEB_SEARCH_TOOL. */
function webSearchTool(): string {
  return process.env.ANTHROPIC_WEB_SEARCH_TOOL || "web_search_20250305";
}

/**
 * Converte o retorno da Messages API. A lista `content` traz blocos de texto
 * com as citações (`web_search_result_location`) e um bloco `server_tool_use`
 * para cada busca feita.
 */
export function parseAnthropicResponse(payload: unknown): {
  text: string;
  sources: EngineSource[];
  searchExecuted: boolean;
  model: string | null;
} {
  if (!isRecord(payload)) throw new EngineError("Resposta do Claude em formato inesperado.");

  const content = Array.isArray(payload.content) ? payload.content : [];
  const sources = new SourceList();
  const parts: string[] = [];
  let searchExecuted = false;

  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "server_tool_use" && block.name === "web_search") searchExecuted = true;
    if (block.type !== "text") continue;
    if (typeof block.text === "string") parts.push(block.text);
    if (!Array.isArray(block.citations)) continue;
    for (const citation of block.citations) {
      if (isRecord(citation) && citation.type === "web_search_result_location") {
        sources.add(citation.url, citation.title);
      }
    }
  }

  // Os blocos de texto vêm fatiados entre as citações; juntos formam a resposta.
  const text = parts.join("").trim();
  if (!text) throw new EngineError("O Claude não devolveu texto de resposta.");

  return {
    text,
    sources: sources.items,
    searchExecuted,
    model: typeof payload.model === "string" ? payload.model : null,
  };
}

/** Faz uma pergunta ao Claude pela API, como um usuário faria. */
export async function askAnthropic(
  request: EngineRequest,
  options: AskOptions = {},
): Promise<EngineResult> {
  const apiKey = requireKey(KEY);
  const model = anthropicModel();

  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: request.question }],
  };
  if (request.searchEnabled) {
    body.tools = [
      {
        type: webSearchTool(),
        name: "web_search",
        max_uses: 5,
        user_location: { type: "approximate", country: countryOf(request) },
      },
    ];
  }

  const startedAt = Date.now();
  const payload = await postJson({
    engine: "Claude",
    keyName: KEY,
    url: ENDPOINT,
    headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION },
    body,
    options,
  });
  const parsed = parseAnthropicResponse(payload);

  return {
    text: parsed.text,
    sources: parsed.sources,
    searchExecuted: parsed.searchExecuted,
    model: parsed.model ?? model,
    raw: payload,
    latencyMs: Date.now() - startedAt,
  };
}
