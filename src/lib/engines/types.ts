/** Uma fonte citada pelo motor na resposta. */
export type EngineSource = {
  url: string;
  title: string | null;
  date: string | null;
  /** Domínio da fonte, sem "www". Alguns motores devolvem links de redirecionamento. */
  domain: string | null;
};

/**
 * Formato único devolvido por todos os motores. Cada adaptador converte o
 * retorno da sua API para este formato, e o resto do sistema só conhece ele.
 */
export type EngineResult = {
  /** Texto da resposta, como o motor devolveu. */
  text: string;
  sources: EngineSource[];
  /** Se o motor de fato consultou a web nesta resposta. */
  searchExecuted: boolean;
  /** Versão exata do modelo que respondeu. */
  model: string;
  /** Retorno completo da API, guardado para auditoria. */
  raw: unknown;
  latencyMs: number;
};

export type EngineRequest = {
  question: string;
  /** Falso para perguntas que medem o que o modelo sabe sem consultar a web. */
  searchEnabled: boolean;
};

export type AskOptions = {
  /** Trocável nos testes, para não esperar de verdade entre tentativas. */
  sleep?: (ms: number) => Promise<void>;
};

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

/** Domínio de uma URL, sem "www". */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Junta fontes sem repetir a mesma URL e sem aceitar o que não for http(s). */
export class SourceList {
  private readonly seen = new Set<string>();
  readonly items: EngineSource[] = [];

  add(url: unknown, title?: unknown, date?: unknown, domain?: string | null) {
    if (!isHttpUrl(url) || this.seen.has(url)) return;
    this.seen.add(url);
    this.items.push({
      url,
      title: typeof title === "string" && title ? title : null,
      date: typeof date === "string" && date ? date : null,
      domain: domain ?? domainOf(url),
    });
  }
}
