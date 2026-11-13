import { normalize } from "./text";
import type { Analysis } from "./types";

/** Uma resposta analisada, com o que o cálculo precisa. */
export type AnalyzedRow = {
  engine: string;
  /** Tipo da pergunta: categoria, comparativa, sobre_a_marca, reconhecimento, associacao. */
  kind: string;
  analysis: Analysis;
};

export type AttributeWeight = { name: string; weight: number };

/**
 * Um indicador calculado. `value` vai de 0 a 1 (exceto `mean_position`, que é
 * a posição média). `numerator` e `denominator` dizem em quantas respostas,
 * menções ou afirmações o valor se baseia.
 */
export type Indicator = {
  indicator: string;
  value: number;
  numerator: number | null;
  denominator: number | null;
};

/** Peso de cada bloco no índice. */
export const BLOCK_WEIGHTS = { visibility: 0.5, understanding: 0.5 } as const;

const cited = (analysis: Analysis) => analysis.brand_in_text || analysis.brand_mentioned;

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Calcula os indicadores de um conjunto de respostas analisadas.
 *
 * Visibilidade usa só respostas a perguntas que NÃO citam a marca: quando a
 * pergunta cita, a IA cita de volta e a presença ficaria inflada.
 * Entendimento usa as perguntas que citam a marca, separadas por tipo.
 * Um indicador sem base (denominador zero) não é devolvido.
 */
export function computeIndicators(rows: AnalyzedRow[], attributes: AttributeWeight[]): Indicator[] {
  const out: Indicator[] = [];
  const push = (indicator: string, value: number | null, numerator: number | null, denominator: number | null) => {
    if (value === null || !Number.isFinite(value)) return;
    out.push({ indicator, value, numerator, denominator });
  };
  const valueOf = (name: string) => out.find((item) => item.indicator === name)?.value ?? null;

  // ---- Bloco 1: Brand Visibility ------------------------------------------
  const open = rows.filter((row) => !row.analysis.question_names_brand);
  const openCited = open.filter((row) => cited(row.analysis));
  if (open.length > 0) {
    push("citation_presence", openCited.length / open.length, openCited.length, open.length);
    push(
      "mention_position",
      mean(open.map((row) => (cited(row.analysis) ? 1 / (row.analysis.brand_position ?? 1) : 0))),
      null,
      open.length,
    );
    const positions = openCited.map((row) => row.analysis.brand_position ?? 1);
    push("mean_position", mean(positions), null, positions.length);
  }

  // Erasure: outras marcas foram citadas e a nossa não.
  const others = open.filter((row) => {
    const analysis = row.analysis;
    const position = cited(analysis) ? 1 : 0;
    return analysis.competitors_mentioned.length > 0 || analysis.brands_in_order.length > position;
  });
  if (others.length > 0) {
    const erased = others.filter((row) => !cited(row.analysis)).length;
    push("erasure_rate", erased / others.length, erased, others.length);
  }

  // Tom: todas as respostas que citam a marca e têm tom identificado.
  const toned = rows.filter((row) => cited(row.analysis) && row.analysis.sentiment);
  if (toned.length > 0) {
    const count = (tone: string) => toned.filter((row) => row.analysis.sentiment === tone).length;
    const positive = count("positivo");
    const negative = count("negativo");
    push("sentiment", ((positive - negative) / toned.length + 1) / 2, positive - negative, toned.length);
    push("sentiment_positive", positive / toned.length, positive, toned.length);
    push("sentiment_neutral", count("neutro") / toned.length, count("neutro"), toned.length);
    push("sentiment_negative", negative / toned.length, negative, toned.length);
  }

  const erasure = valueOf("erasure_rate");
  const visibility = mean(
    [
      valueOf("citation_presence"),
      erasure === null ? null : 1 - erasure,
      valueOf("mention_position"),
      // O tom só entra na visibilidade se há perguntas abertas que a sustentem.
      open.length > 0 ? valueOf("sentiment") : null,
    ].filter((value): value is number => value !== null),
  );
  if (open.length > 0) push("brand_visibility", visibility, null, open.length);

  // ---- Bloco 2: Brand Understanding ---------------------------------------
  const ofKind = (kind: string) => rows.filter((row) => row.kind === kind);

  const recognitionRows = ofKind("reconhecimento");
  if (recognitionRows.length > 0) {
    const score = (row: AnalyzedRow) =>
      row.analysis.recognition === "sim" ? 1 : row.analysis.recognition === "parcial" ? 0.5 : 0;
    push(
      "entity_recognition",
      mean(recognitionRows.map(score)),
      recognitionRows.filter((row) => row.analysis.recognition === "sim").length,
      recognitionRows.length,
    );
  }

  const weights = new Map(attributes.map((item) => [normalize(item.name), Math.max(item.weight, 0)]));
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const share = (row: AnalyzedRow, weighted: boolean) => {
    const found = new Set(row.analysis.attributes_associated.map(normalize).filter((name) => weights.has(name)));
    if (!weighted) return found.size / weights.size;
    return [...found].reduce((sum, name) => sum + (weights.get(name) ?? 0), 0) / totalWeight;
  };

  const associationRows = ofKind("associacao");
  if (associationRows.length > 0 && totalWeight > 0) {
    push("attribute_association", mean(associationRows.map((row) => share(row, true))), null, associationRows.length);
  }

  const aboutRows = ofKind("sobre_a_marca");
  if (aboutRows.length > 0 && weights.size > 0) {
    push("brand_alignment", mean(aboutRows.map((row) => share(row, false))), null, aboutRows.length);
  }

  // Risco de erro: afirmações que contradizem um fato cadastrado, em qualquer resposta.
  const claims = rows.flatMap((row) => row.analysis.claims);
  const verifiable = claims.filter((claim) => claim.verdict !== "nao_verificavel");
  if (verifiable.length > 0) {
    const incorrect = verifiable.filter((claim) => claim.verdict === "incorreta").length;
    push("hallucination_risk", incorrect / verifiable.length, incorrect, verifiable.length);
  }

  const risk = valueOf("hallucination_risk");
  const understandingParts = [
    valueOf("entity_recognition"),
    valueOf("attribute_association"),
    valueOf("brand_alignment"),
  ].filter((value): value is number => value !== null);
  // O risco de erro sozinho não mede entendimento: só entra junto de outro indicador.
  if (understandingParts.length > 0) {
    const parts = risk === null ? understandingParts : [...understandingParts, 1 - risk];
    push("brand_understanding", mean(parts), null, rows.filter((row) => row.analysis.question_names_brand).length);
  }

  const v = valueOf("brand_visibility");
  const u = valueOf("brand_understanding");
  if (v !== null && u !== null) {
    push("sei", BLOCK_WEIGHTS.visibility * v + BLOCK_WEIGHTS.understanding * u, null, rows.length);
  }

  push("responses_analyzed", 1, rows.length, rows.length);
  return out;
}

/** Indicadores do agregado (engine nulo) e de cada motor. */
export function computeByEngine(
  rows: AnalyzedRow[],
  attributes: AttributeWeight[],
): { engine: string | null; indicators: Indicator[] }[] {
  const engines = [...new Set(rows.map((row) => row.engine))];
  return [
    { engine: null, indicators: computeIndicators(rows, attributes) },
    ...engines.map((engine) => ({
      engine,
      indicators: computeIndicators(rows.filter((row) => row.engine === engine), attributes),
    })),
  ];
}
