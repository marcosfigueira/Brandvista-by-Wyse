import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeByEngine,
  computeIndicators,
  computeSpread,
  libraryFingerprint,
  type AnalyzedRow,
} from "./indicators";
import type { Analysis } from "./types";

const base: Analysis = {
  question_names_brand: false,
  brand_in_text: false,
  brand_mentioned: false,
  mention_divergence: false,
  brands_in_order: [],
  brand_position: null,
  competitors_mentioned: [],
  own_domain_cited: false,
  sentiment: null,
  recognition: null,
  attributes_associated: [],
  claims: [],
};
const row = (kind: string, patch: Partial<Analysis>, engine = "chatgpt"): AnalyzedRow => ({
  engine,
  kind,
  analysis: { ...base, ...patch },
});
const citedAt = (position: number, sentiment: Analysis["sentiment"] = "positivo"): Partial<Analysis> => ({
  brand_in_text: true,
  brand_mentioned: true,
  brand_position: position,
  brands_in_order: ["A", "B", "C"].slice(0, Math.max(position, 2)),
  sentiment,
});
const attributes = [
  { name: "Estratégica", weight: 3 },
  { name: "Inovadora", weight: 1 },
];
const get = (list: ReturnType<typeof computeIndicators>, name: string) => list.find((item) => item.indicator === name);

test("visibilidade usa só perguntas que não citam a marca", () => {
  const rows = [
    row("categoria", citedAt(1)),
    row("categoria", citedAt(2, "neutro")),
    row("categoria", { brands_in_order: ["A", "B"] }),
    row("categoria", {}),
    // Pergunta que cita a marca: fica fora de presença, erasure e posição.
    row("sobre_a_marca", { ...citedAt(1), question_names_brand: true }),
  ];
  const result = computeIndicators(rows, attributes);
  assert.deepEqual(
    [get(result, "citation_presence")?.numerator, get(result, "citation_presence")?.denominator],
    [2, 4],
  );
  assert.equal(get(result, "citation_presence")?.value, 0.5);
  // Outras marcas aparecem em 3 respostas abertas; em 1 delas a nossa não aparece.
  assert.deepEqual([get(result, "erasure_rate")?.numerator, get(result, "erasure_rate")?.denominator], [1, 3]);
  assert.equal(get(result, "mention_position")?.value, (1 + 0.5 + 0 + 0) / 4);
  assert.equal(get(result, "mean_position")?.value, 1.5);
});

test("tom considera todas as menções e vai de 0 a 1", () => {
  const rows = [
    row("categoria", citedAt(1, "positivo")),
    row("categoria", citedAt(1, "negativo")),
    row("sobre_a_marca", { ...citedAt(1, "positivo"), question_names_brand: true }),
  ];
  const result = computeIndicators(rows, attributes);
  assert.equal(get(result, "sentiment")?.denominator, 3);
  assert.equal(get(result, "sentiment")?.value, (1 / 3 + 1) / 2);
  assert.equal(get(result, "sentiment_positive")?.numerator, 2);
});

test("entendimento: reconhecimento, associação com peso, alinhamento e risco de erro", () => {
  const branded = { question_names_brand: true, brand_in_text: true, brand_mentioned: true };
  const rows = [
    row("reconhecimento", { ...branded, recognition: "sim" }),
    row("reconhecimento", { ...branded, recognition: "parcial" }),
    row("associacao", { ...branded, attributes_associated: ["Estratégica"] }),
    row("sobre_a_marca", {
      ...branded,
      attributes_associated: ["Inovadora"],
      claims: [
        { claim: "a", verdict: "correta", fact: "f" },
        { claim: "b", verdict: "incorreta", fact: "f" },
        { claim: "c", verdict: "nao_verificavel", fact: null },
      ],
    }),
  ];
  const result = computeIndicators(rows, attributes);
  assert.equal(get(result, "entity_recognition")?.value, 0.75);
  assert.equal(get(result, "attribute_association")?.value, 0.75);
  assert.equal(get(result, "brand_alignment")?.value, 0.5);
  assert.deepEqual(
    [get(result, "hallucination_risk")?.numerator, get(result, "hallucination_risk")?.denominator],
    [1, 2],
  );
  assert.equal(get(result, "brand_understanding")?.value, (0.75 + 0.75 + 0.5 + 0.5) / 4);
  // Sem perguntas abertas não há visibilidade nem índice.
  assert.equal(get(result, "brand_visibility"), undefined);
  assert.equal(get(result, "sei"), undefined);
});

test("índice é a média dos dois blocos e só existe com os dois", () => {
  const rows = [
    row("categoria", citedAt(1)),
    row("reconhecimento", { question_names_brand: true, brand_in_text: true, recognition: "sim" }),
  ];
  const result = computeIndicators(rows, attributes);
  const v = get(result, "brand_visibility")?.value ?? 0;
  const u = get(result, "brand_understanding")?.value ?? 0;
  assert.equal(get(result, "sei")?.value, 0.5 * v + 0.5 * u);
});

test("sem respostas não há indicadores de bloco; por motor separa os dados", () => {
  assert.deepEqual(
    computeIndicators([], attributes).map((item) => item.indicator),
    ["responses_analyzed"],
  );
  const groups = computeByEngine(
    [row("categoria", citedAt(1), "chatgpt"), row("categoria", {}, "gemini")],
    attributes,
  );
  assert.deepEqual(groups.map((group) => group.engine), [null, "chatgpt", "gemini"]);
  assert.equal(get(groups[1].indicators, "citation_presence")?.value, 1);
  assert.equal(get(groups[2].indicators, "citation_presence")?.value, 0);
});

test("oscilação é metade da diferença entre repetições e exige pelo menos duas", () => {
  const rep = (repetition: number, cited: boolean): AnalyzedRow => ({
    ...row("categoria", cited ? citedAt(1) : {}),
    repetition,
    promptId: "p1",
  });
  // Repetição 1: presença 100%. Repetição 2: presença 0%.
  const spread = computeSpread([rep(1, true), rep(2, false)], attributes);
  assert.equal(spread.find((item) => item.indicator === "citation_presence:spread")?.value, 0.5);
  assert.deepEqual(computeSpread([rep(1, true)], attributes), []);
});

test("a impressão digital da biblioteca muda só quando as perguntas mudam", () => {
  const withPrompt = (promptId: string): AnalyzedRow => ({ ...row("categoria", {}), promptId });
  const a = libraryFingerprint([withPrompt("p1"), withPrompt("p2"), withPrompt("p1")]);
  assert.equal(a, libraryFingerprint([withPrompt("p2"), withPrompt("p1")]));
  assert.notEqual(a, libraryFingerprint([withPrompt("p1"), withPrompt("p3")]));
});
