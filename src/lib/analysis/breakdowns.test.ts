import assert from "node:assert/strict";
import { test } from "node:test";
import { listClaims, summarizeQuestions, summarizeSources, type DetailRow } from "./breakdowns";
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
let counter = 0;
const row = (patch: Partial<DetailRow>, analysis: Partial<Analysis> = {}): DetailRow => ({
  responseId: `r${(counter += 1)}`,
  engine: "chatgpt",
  repetition: 1,
  promptId: "p1",
  question: "Melhores consultorias?",
  kind: "categoria",
  sources: [],
  ...patch,
  analysis: { ...base, ...analysis },
});
const citedAt = (position: number): Partial<Analysis> => ({
  brand_in_text: true,
  brand_mentioned: true,
  brand_position: position,
  brands_in_order: ["Interbrand", "Wyse"],
  sentiment: "positivo",
});
const brand = { name: "Wyse", variants: [] };

test("resumo por pergunta: presença, consistência por motor e quem apareceu no lugar", () => {
  const summary = summarizeQuestions(
    [
      row({ engine: "chatgpt", repetition: 1 }, citedAt(2)),
      row({ engine: "chatgpt", repetition: 2 }, citedAt(2)),
      row({ engine: "gemini", repetition: 1 }, citedAt(1)),
      row({ engine: "gemini", repetition: 2 }, { brands_in_order: ["Interbrand", "FutureBrand"] }),
      row({ engine: "claude", repetition: 1 }, { brands_in_order: ["Interbrand"] }),
      row(
        { promptId: "p2", question: "A Wyse é boa?", kind: "sobre_a_marca" },
        { ...citedAt(1), question_names_brand: true, claims: [{ claim: "x", verdict: "incorreta", fact: "f" }] },
      ),
    ],
    brand,
  );
  assert.deepEqual(summary.map((item) => item.promptId), ["p1", "p2"]);
  const open = summary[0];
  assert.deepEqual([open.cited, open.responses], [3, 5]);
  assert.equal(open.meanPosition, 5 / 3);
  assert.deepEqual(open.consistency, { always: 1, sometimes: 1, never: 1 });
  assert.deepEqual(open.instead, [
    { name: "Interbrand", count: 2 },
    { name: "FutureBrand", count: 1 },
  ]);
  assert.equal(summary[1].incorrectClaims, 1);
  assert.equal(summary[1].tone.positivo, 1);
});

test("lista de afirmações por veredito", () => {
  const rows = [
    row({}, { claims: [{ claim: "errada", verdict: "incorreta", fact: "f" }, { claim: "solta", verdict: "nao_verificavel", fact: null }] }),
  ];
  assert.deepEqual(listClaims(rows, "incorreta").map((item) => item.claim), ["errada"]);
  assert.deepEqual(listClaims(rows, "nao_verificavel").map((item) => item.claim), ["solta"]);
});

test("fontes: conta respostas por site e marca o site da marca e de concorrentes", () => {
  const summary = summarizeSources(
    [
      row({ sources: [{ url: "https://www.wyse.com.br/a", domain: "wyse.com.br" }, { url: "https://exame.com/x", domain: "exame.com" }, { url: "https://exame.com/y", domain: "exame.com" }] }),
      row({ sources: [{ url: "https://exame.com/x", domain: "exame.com" }, { url: "https://interbrand.com/", domain: "interbrand.com" }] }),
      row({ sources: [] }),
    ],
    "wyse.com.br",
    [{ name: "Interbrand", domain: "https://interbrand.com" }],
  );
  assert.deepEqual([summary.withSources, summary.total, summary.ownDomainResponses], [2, 3, 1]);
  assert.deepEqual(summary.domains[0], { domain: "exame.com", responses: 2, share: 1, owner: null, ownerName: null });
  assert.equal(summary.domains.find((item) => item.domain === "wyse.com.br")?.owner, "marca");
  assert.equal(summary.domains.find((item) => item.domain === "interbrand.com")?.ownerName, "Interbrand");
  assert.equal(summary.pages[0].url, "https://exame.com/x");
  assert.equal(summary.pages[0].responses, 2);
});
