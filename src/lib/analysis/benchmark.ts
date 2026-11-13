import { brandNames, mentions, normalize } from "./text";
import type { Analysis } from "./types";

export type BenchmarkRow = { question: string; analysis: Analysis };
export type Named = { name: string; variants: string[] };

export type BenchmarkEntry = {
  name: string;
  /** A marca medida (as demais são concorrentes cadastrados). */
  isBrand: boolean;
  /** Respostas em que aparece. */
  cited: number;
  /** Respostas que contam para ela: perguntas que não citam a marca nem ela mesma. */
  total: number;
  /** cited ÷ total; nulo sem base. */
  presence: number | null;
  /** Posição média entre as marcas citadas, quando aparece; nulo se nunca aparece. */
  meanPosition: number | null;
};

export type Benchmark = {
  /** A marca e os concorrentes cadastrados, da maior para a menor presença. */
  entries: BenchmarkEntry[];
  /** Marcas que as IAs citaram e que não estão cadastradas como concorrentes. */
  others: { name: string; cited: number }[];
  /** Respostas a perguntas que não citam a marca. */
  openResponses: number;
};

const MAX_OTHERS = 12;

/**
 * Compara a marca com os concorrentes nas mesmas respostas. Usa só perguntas
 * que não citam a marca; para cada concorrente, também ficam de fora as
 * perguntas que o citam, pelo mesmo motivo: a IA cita de volta quem foi citado.
 */
export function computeBenchmark(rows: BenchmarkRow[], brand: Named, competitors: Named[]): Benchmark {
  const brandList = brandNames(brand.name, brand.variants);
  const open = rows.filter((row) => !row.analysis.question_names_brand && !mentions(row.question, brandList));

  const entryFor = (item: Named, isBrand: boolean): BenchmarkEntry => {
    const names = brandNames(item.name, item.variants);
    const eligible = isBrand ? open : open.filter((row) => !mentions(row.question, names));
    const positions: number[] = [];
    let cited = 0;
    for (const { analysis } of eligible) {
      const index = analysis.brands_in_order.findIndex((listed) => mentions(listed, names));
      const present = isBrand
        ? analysis.brand_in_text || analysis.brand_mentioned
        : index !== -1 || analysis.competitors_mentioned.some((name) => mentions(name, names));
      if (!present) continue;
      cited += 1;
      const position = isBrand ? analysis.brand_position : index === -1 ? null : index + 1;
      if (position) positions.push(position);
    }
    return {
      name: item.name,
      isBrand,
      cited,
      total: eligible.length,
      presence: eligible.length > 0 ? cited / eligible.length : null,
      meanPosition:
        positions.length > 0 ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null,
    };
  };

  const entries = [entryFor(brand, true), ...competitors.map((item) => entryFor(item, false))].sort(
    (a, b) => (b.presence ?? -1) - (a.presence ?? -1) || (a.meanPosition ?? 99) - (b.meanPosition ?? 99),
  );

  // Marcas citadas que não são a marca nem um concorrente cadastrado.
  const known = [brandList, ...competitors.map((item) => brandNames(item.name, item.variants))];
  const counts = new Map<string, { name: string; cited: number }>();
  for (const { analysis } of open) {
    const seen = new Set<string>();
    for (const listed of analysis.brands_in_order) {
      const key = normalize(listed);
      if (!key || seen.has(key) || known.some((names) => mentions(listed, names))) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { name: listed, cited: 0 };
      entry.cited += 1;
      counts.set(key, entry);
    }
  }
  const others = [...counts.values()]
    .sort((a, b) => b.cited - a.cited || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, MAX_OTHERS);

  return { entries, others, openResponses: open.length };
}
