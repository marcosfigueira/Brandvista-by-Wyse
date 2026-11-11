/** Uma fonte citada pelo motor na resposta. */
export type EngineSource = {
  url: string;
  title: string | null;
  date: string | null;
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

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}
