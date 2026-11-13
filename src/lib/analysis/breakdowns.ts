import { bareDomain, brandNames, mentions, normalize, sameSite } from "./text";
import type { Analysis } from "./types";

/** Uma resposta analisada, com o que as visões de detalhe precisam. */
export type DetailRow = {
  responseId: string;
  engine: string;
  repetition: number;
  promptId: string;
  question: string;
  kind: string;
  sources: { url?: string | null; title?: string | null; domain?: string | null }[];
  analysis: Analysis;
};

const cited = (analysis: Analysis) => analysis.brand_in_text || analysis.brand_mentioned;

export type QuestionSummary = {
  promptId: string;
  question: string;
  kind: string;
  namesBrand: boolean;
  responses: number;
  cited: number;
  presence: number;
  meanPosition: number | null;
  /** Motores em que a marca apareceu em todas, em algumas ou em nenhuma repetição. */
  consistency: { always: number; sometimes: number; never: number };
  /** Marcas mais citadas nas respostas em que a nossa não apareceu. */
  instead: { name: string; count: number }[];
  tone: { positivo: number; neutro: number; negativo: number };
  incorrectClaims: number;
};

/** Resume cada pergunta da rodada. As que não citam a marca vêm primeiro, da menor para a maior presença. */
export function summarizeQuestions(rows: DetailRow[], brand: { name: string; variants: string[] }): QuestionSummary[] {
  const names = brandNames(brand.name, brand.variants);
  const groups = new Map<string, DetailRow[]>();
  for (const row of rows) groups.set(row.promptId, [...(groups.get(row.promptId) ?? []), row]);

  const summaries = [...groups.values()].map((group): QuestionSummary => {
    const citedRows = group.filter((row) => cited(row.analysis));
    const positions = citedRows.map((row) => row.analysis.brand_position).filter((value): value is number => Boolean(value));

    const byEngine = new Map<string, boolean[]>();
    for (const row of group) byEngine.set(row.engine, [...(byEngine.get(row.engine) ?? []), cited(row.analysis)]);
    const consistency = { always: 0, sometimes: 0, never: 0 };
    for (const flags of byEngine.values()) {
      if (flags.every(Boolean)) consistency.always += 1;
      else if (flags.some(Boolean)) consistency.sometimes += 1;
      else consistency.never += 1;
    }

    const instead = new Map<string, { name: string; count: number }>();
    for (const row of group) {
      if (cited(row.analysis)) continue;
      const seen = new Set<string>();
      for (const listed of row.analysis.brands_in_order) {
        const key = normalize(listed);
        if (!key || seen.has(key) || mentions(listed, names)) continue;
        seen.add(key);
        const entry = instead.get(key) ?? { name: listed, count: 0 };
        entry.count += 1;
        instead.set(key, entry);
      }
    }

    const tone = { positivo: 0, neutro: 0, negativo: 0 };
    for (const row of citedRows) if (row.analysis.sentiment) tone[row.analysis.sentiment] += 1;

    return {
      promptId: group[0].promptId,
      question: group[0].question,
      kind: group[0].kind,
      namesBrand: group[0].analysis.question_names_brand,
      responses: group.length,
      cited: citedRows.length,
      presence: citedRows.length / group.length,
      meanPosition: positions.length > 0 ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null,
      consistency,
      instead: [...instead.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      tone,
      incorrectClaims: group.reduce(
        (sum, row) => sum + row.analysis.claims.filter((claim) => claim.verdict === "incorreta").length,
        0,
      ),
    };
  });

  return summaries.sort(
    (a, b) =>
      Number(a.namesBrand) - Number(b.namesBrand) ||
      a.presence - b.presence ||
      a.question.localeCompare(b.question, "pt-BR"),
  );
}

export type ClaimEntry = {
  responseId: string;
  engine: string;
  question: string;
  claim: string;
  fact: string | null;
};

/** Afirmações de um veredito, uma por linha, na ordem das respostas. */
export function listClaims(rows: DetailRow[], verdict: "incorreta" | "nao_verificavel" | "correta"): ClaimEntry[] {
  return rows.flatMap((row) =>
    row.analysis.claims
      .filter((claim) => claim.verdict === verdict)
      .map((claim) => ({
        responseId: row.responseId,
        engine: row.engine,
        question: row.question,
        claim: claim.claim,
        fact: claim.fact,
      })),
  );
}

export type DomainEntry = {
  domain: string;
  /** Respostas que citaram ao menos uma página deste site. */
  responses: number;
  share: number;
  owner: "marca" | "concorrente" | null;
  /** Nome do concorrente dono do site, quando for o caso. */
  ownerName: string | null;
};

export type SourcesSummary = {
  /** Respostas que citaram ao menos uma fonte. */
  withSources: number;
  total: number;
  ownDomainResponses: number;
  domains: DomainEntry[];
  pages: { url: string; title: string | null; domain: string; responses: number }[];
};

/** Quais sites e páginas as IAs citaram, e quanto o site da marca aparece. */
export function summarizeSources(
  rows: DetailRow[],
  brandDomain: string | null,
  competitors: { name: string; domain: string | null }[],
  limit = 30,
): SourcesSummary {
  const domains = new Map<string, number>();
  const pages = new Map<string, { url: string; title: string | null; domain: string; responses: number }>();
  let withSources = 0;
  let ownDomainResponses = 0;

  for (const row of rows) {
    const seenDomains = new Set<string>();
    const seenPages = new Set<string>();
    for (const source of row.sources) {
      const domain = bareDomain(source.domain ?? source.url ?? null);
      if (!domain) continue;
      seenDomains.add(domain);
      if (source.url && /^https?:\/\//i.test(source.url) && !seenPages.has(source.url)) {
        seenPages.add(source.url);
        const page = pages.get(source.url) ?? { url: source.url, title: source.title ?? null, domain, responses: 0 };
        page.responses += 1;
        pages.set(source.url, page);
      }
    }
    if (seenDomains.size === 0) continue;
    withSources += 1;
    if ([...seenDomains].some((domain) => sameSite(domain, brandDomain))) ownDomainResponses += 1;
    for (const domain of seenDomains) domains.set(domain, (domains.get(domain) ?? 0) + 1);
  }

  const entries = [...domains.entries()]
    .map(([domain, responses]): DomainEntry => {
      const competitor = competitors.find((item) => sameSite(domain, item.domain));
      return {
        domain,
        responses,
        share: withSources > 0 ? responses / withSources : 0,
        owner: sameSite(domain, brandDomain) ? "marca" : competitor ? "concorrente" : null,
        ownerName: competitor?.name ?? null,
      };
    })
    .sort((a, b) => b.responses - a.responses || a.domain.localeCompare(b.domain));

  // O site da marca aparece sempre na lista, mesmo fora dos mais citados.
  const top = entries.slice(0, limit);
  const own = entries.find((entry) => entry.owner === "marca");
  if (own && !top.includes(own)) top.push(own);

  return {
    withSources,
    total: rows.length,
    ownDomainResponses,
    domains: top,
    pages: [...pages.values()].sort((a, b) => b.responses - a.responses).slice(0, 15),
  };
}
