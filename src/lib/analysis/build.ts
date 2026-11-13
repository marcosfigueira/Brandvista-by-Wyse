import { brandNames, firstMention, mentions, normalize, sameSite } from "./text";
import {
  RECOGNITIONS,
  SENTIMENTS,
  VERDICTS,
  type Analysis,
  type BrandContext,
  type Claim,
  type Judgement,
} from "./types";

const MAX_BRANDS = 30;
const MAX_CLAIMS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}

/** Valida o que o modelo devolveu. Campos fora do formato são descartados. */
export function parseJudgement(input: unknown): Judgement {
  if (!isRecord(input)) throw new Error("O analisador devolveu um formato inesperado.");
  if (typeof input.brand_mentioned !== "boolean") {
    throw new Error("O analisador não informou se a marca foi citada.");
  }
  const claims: Claim[] = [];
  for (const item of Array.isArray(input.claims) ? input.claims.slice(0, MAX_CLAIMS) : []) {
    if (!isRecord(item) || typeof item.claim !== "string" || !item.claim.trim()) continue;
    const verdict = oneOf(item.verdict, VERDICTS);
    if (!verdict) continue;
    claims.push({
      claim: item.claim.trim(),
      verdict,
      fact: typeof item.fact === "string" && item.fact.trim() ? item.fact.trim() : null,
    });
  }
  return {
    brand_mentioned: input.brand_mentioned,
    brands_in_order: strings(input.brands_in_order, MAX_BRANDS),
    sentiment: oneOf(input.sentiment, SENTIMENTS),
    recognition: oneOf(input.recognition, RECOGNITIONS),
    attributes_associated: strings(input.attributes_associated, 50),
    claims,
  };
}

/**
 * Junta o julgamento do modelo com o que se confere por regra de texto.
 * A posição da marca é calculada aqui, a partir da lista ordenada de marcas.
 */
export function buildAnalysis(params: {
  brand: BrandContext;
  question: string;
  responseText: string;
  sourceDomains: (string | null)[];
  judgement: Judgement;
}): Analysis {
  const { brand, question, responseText, sourceDomains, judgement } = params;
  const names = brandNames(brand.name, brand.variants);

  const brandInText = mentions(responseText, names);
  const cited = brandInText || judgement.brand_mentioned;

  const index = judgement.brands_in_order.findIndex((item) => mentions(item, names));
  let position: number | null = index === -1 ? null : index + 1;
  // O modelo esqueceu a marca na lista, mas ela está no texto: conta as
  // marcas listadas que aparecem antes dela.
  if (position === null && brandInText) {
    const at = firstMention(responseText, names);
    const before = judgement.brands_in_order.filter((item) => {
      const other = firstMention(responseText, [item]);
      return other !== -1 && other < at;
    }).length;
    position = before + 1;
  }

  const wanted = new Map(brand.attributes.map((name) => [normalize(name), name]));
  const attributes = [
    ...new Set(
      judgement.attributes_associated
        .map((name) => wanted.get(normalize(name)))
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  return {
    question_names_brand: mentions(question, names),
    brand_in_text: brandInText,
    brand_mentioned: judgement.brand_mentioned,
    mention_divergence: brandInText !== judgement.brand_mentioned,
    brands_in_order: judgement.brands_in_order,
    brand_position: position,
    competitors_mentioned: brand.competitors
      .filter((competitor) => mentions(responseText, brandNames(competitor.name, competitor.variants)))
      .map((competitor) => competitor.name),
    own_domain_cited: sourceDomains.some((domain) => sameSite(domain, brand.domain)),
    sentiment: cited ? judgement.sentiment : null,
    recognition: cited ? judgement.recognition : null,
    attributes_associated: cited ? attributes : [],
    claims: cited ? judgement.claims : [],
  };
}

/** Uma análise com afirmação incorreta sobre a marca fica sinalizada. */
export function hasIncorrectClaim(analysis: Analysis): boolean {
  return analysis.claims.some((claim) => claim.verdict === "incorreta");
}
