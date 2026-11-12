import { EngineError, type AskOptions } from "./types";

const TIMEOUT_MS = 120_000;

/** Esperas, em ms, antes de cada nova tentativa quando a API pede calma. */
const RETRY_WAITS_MS = [3_000, 8_000, 15_000];
const MAX_RETRY_AFTER_MS = 20_000;

/** 429 = ritmo excedido; 503 e 529 = serviço sobrecarregado no momento. */
const RETRYABLE = new Set([429, 503, 529]);

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Envia um POST com JSON a um motor e devolve o JSON da resposta.
 * Se a API responder que o ritmo foi excedido ou que está sobrecarregada,
 * espera e tenta de novo, até três vezes. As mensagens de erro nunca incluem
 * a chave de API.
 */
export async function postJson(params: {
  engine: string;
  keyName: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  options?: AskOptions;
}): Promise<unknown> {
  const { engine, keyName, url, headers, body } = params;
  const sleep = params.options?.sleep ?? realSleep;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new EngineError(
        timedOut
          ? `O ${engine} não respondeu dentro do tempo limite.`
          : `Não foi possível conectar ao ${engine}.`,
      );
    }

    if (RETRYABLE.has(response.status) && attempt < RETRY_WAITS_MS.length) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
          : RETRY_WAITS_MS[attempt];
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 400);
      const hint =
        response.status === 401 || response.status === 403
          ? ` Confira a chave ${keyName}.`
          : response.status === 429
            ? " O limite de requisições por minuto da conta foi atingido, mesmo após novas tentativas."
            : "";
      throw new EngineError(`O ${engine} devolveu erro ${response.status}.${hint} ${detail}`.trim());
    }

    return (await response.json()) as unknown;
  }
}

/** Lê a chave de API de uma variável de ambiente, ou falha com mensagem clara. */
export function requireKey(keyName: string): string {
  const value = process.env[keyName];
  if (!value) {
    throw new EngineError(`A variável ${keyName} não está configurada na Vercel.`);
  }
  return value;
}
