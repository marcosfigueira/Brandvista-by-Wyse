import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBenchmark } from "./benchmark";
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
const brand = { name: "Wyse", variants: [] };
const competitors = [
  { name: "Interbrand", variants: [] },
  { name: "Ana Couto", variants: ["Ana Couto Branding"] },
];
const answer = (question: string, listed: string[], patch: Partial<Analysis> = {}) => ({
  question,
  analysis: {
    ...base,
    brands_in_order: listed,
    brand_in_text: listed.includes("Wyse"),
    brand_mentioned: listed.includes("Wyse"),
    brand_position: listed.includes("Wyse") ? listed.indexOf("Wyse") + 1 : null,
    ...patch,
  },
});

test("benchmark compara presença e posição nas perguntas abertas", () => {
  const result = computeBenchmark(
    [
      answer("Melhores consultorias de branding?", ["Interbrand", "Wyse", "FutureBrand"]),
      answer("Quem contratar para reposicionar a marca?", ["Interbrand", "Ana Couto Branding", "futurebrand"]),
      answer("Consultorias de naming?", ["Interbrand"]),
      // Cita a marca: fora do benchmark inteiro.
      answer("A Wyse é confiável?", ["Wyse"], { question_names_brand: true }),
      // Cita um concorrente: fora só da conta dele.
      answer("A Interbrand vale o preço?", ["Interbrand", "Wyse"]),
    ],
    brand,
    competitors,
  );
  assert.equal(result.openResponses, 4);
  const byName = Object.fromEntries(result.entries.map((entry) => [entry.name, entry]));
  assert.deepEqual([byName.Wyse.cited, byName.Wyse.total], [2, 4]);
  assert.equal(byName.Wyse.meanPosition, 2);
  assert.deepEqual([byName.Interbrand.cited, byName.Interbrand.total], [3, 3]);
  assert.equal(byName.Interbrand.meanPosition, 1);
  assert.deepEqual([byName["Ana Couto"].cited, byName["Ana Couto"].total], [1, 4]);
  assert.deepEqual(result.entries.map((entry) => entry.name), ["Interbrand", "Wyse", "Ana Couto"]);
  // Grafias diferentes da mesma marca não cadastrada contam juntas.
  assert.deepEqual(result.others, [{ name: "FutureBrand", cited: 2 }]);
});

test("benchmark sem respostas abertas não tem base", () => {
  const result = computeBenchmark([answer("A Wyse é boa?", ["Wyse"], { question_names_brand: true })], brand, competitors);
  assert.equal(result.openResponses, 0);
  assert.equal(result.entries[0].presence, null);
});
