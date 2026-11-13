import type { Benchmark } from "../analysis/benchmark";
import type { ClaimEntry, QuestionSummary, SourcesSummary } from "../analysis/breakdowns";
import type { SiteAudit } from "./audit";

export type IndicatorValue = { value: number; numerator: number | null; denominator: number | null };

/** Números e listas da rodada, guardados junto com o relatório. */
export type ReportData = {
  client: {
    name: string;
    category: string | null;
    description: string | null;
    domain: string | null;
    country: string | null;
  };
  run: { id: string; createdAt: string; kind: string; responses: number; repetitions: number; engines: string[] };
  /** Indicadores do agregado dos motores. */
  indicators: Record<string, IndicatorValue>;
  /** Indicadores da rodada completa anterior, se houver. */
  previous: Record<string, number> | null;
  engines: { engine: string; indicators: Record<string, number> }[];
  history: { date: string; sei: number | null; visibility: number | null; understanding: number | null }[];
  benchmark: Benchmark;
  questions: QuestionSummary[];
  incorrect: ClaimEntry[];
  unverified: ClaimEntry[];
  sources: SourcesSummary;
  /** Atributos desejados e em quantas respostas sobre a marca cada um foi associado. */
  attributes: { name: string; weight: number; associated: number; responses: number }[];
  facts: string[];
};

export const PRIORITIES = ["alta", "media", "baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PILLARS = ["Entender", "Estruturar", "Amplificar"] as const;
export type Pillar = (typeof PILLARS)[number];

/** Diagnóstico e recomendações escritos pelo modelo a partir de ReportData e da auditoria. */
export type ReportContent = {
  /** A conclusão da rodada em uma frase. */
  headline: string;
  summary: string[];
  strengths: string[];
  weaknesses: string[];
  content_gaps: { gap: string; evidence: string; kpi: string; priority: Priority }[];
  content_ideas: { title: string; format: string; answers: string; outline: string[]; kpi: string }[];
  corrections: { issue: string; action: string }[];
  technical_actions: { action: string; why: string; priority: Priority }[];
  earned_media: { target: string; action: string; why: string }[];
  plan: { action: string; pillar: Pillar; impact: Priority; effort: Priority }[];
};

export type Report = {
  status: "gerando" | "pronto" | "falhou";
  data: ReportData | null;
  audit: SiteAudit | null;
  content: ReportContent | null;
  model: string | null;
  error_message: string | null;
  created_at: string;
};
