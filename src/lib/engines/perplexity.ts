import { EngineError, type EngineRequest, type EngineResult, type EngineSource } from "./types";

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const TIMEOUT_MS = 90_000;

/** Esperas, em ms, antes de cada nova tentativa quando a API pede calma (429). */
const RETRY_WAITS_MS = [3_000, 8_000, 15_000];
const MAX_RETRY_AFTER_MS = 20_000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Modelo usado. Pode ser trocado pela variável PERPLEXITY_MODEL. */
export function perplexityModel(): string {
  return process.env.PERPLEXITY_MODEL || "sonar";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
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

  const sources: EngineSource[] = [];
  const seen = new Set<string>();
  const add = (url: unknown, title: unknown, date: unknown) => {
    if (!isHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    sources.push({
      url,
      title: typeof title === "string" && title ? title : null,
      date: typeof date === "string" && date ? date : null,
    });
  };

  if (Array.isArray(payload.search_results)) {
    for (const item of payload.search_results) {
      if (isRecord(item)) add(item.url, item.title, item.date);
    }
  }
  if (sources.length === 0 && Array.isArray(payload.citations)) {
    for (const url of payload.citations) add(url, null, null);
  }

  return {
    text,
    sources,
    model: typeof payload.model === "string" ? payload.model : null,
  };
}

/**
 * Faz uma pergunta ao Perplexity, como um usuário faria, sem instrução extra.
 * Se a API responder que o ritmo de requisições foi excedido (429), espera e
 * tenta de novo, até três vezes.
 */
export async function askPerplexity(
  request: EngineRequest,
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<EngineResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new EngineError("A variável PERPLEXITY_API_KEY não está configurada na Vercel.");
  }
  const sleep = options.sleep ?? realSleep;

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

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new EngineError(
        timedOut
          ? "O Perplexity não respondeu dentro do tempo limite."
          : "Não foi possível conectar ao Perplexity.",
      );
    }

    if (response.status === 429 && attempt < RETRY_WAITS_MS.length) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
          : RETRY_WAITS_MS[attempt];
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const hint =
        response.status === 401
          ? " Confira a chave PERPLEXITY_API_KEY."
          : response.status === 429
            ? " O limite de requisições por minuto da conta foi atingido, mesmo após novas tentativas."
            : "";
      throw new EngineError(`O Perplexity devolveu erro ${response.status}.${hint} ${detail}`.trim());
    }

    const payload: unknown = await response.json();
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
}
