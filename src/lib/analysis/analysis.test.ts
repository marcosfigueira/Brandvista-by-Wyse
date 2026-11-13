import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalysis, hasIncorrectClaim, parseJudgement } from "./build";
import { readToolInput } from "./judge";
import { bareDomain, brandNames, mentions, sameSite } from "./text";
import type { BrandContext, Judgement } from "./types";

const brand: BrandContext = {
  name: "Wyse",
  variants: ["Wyse Brand Intelligence"],
  domain: "https://www.wyse.com.br",
  category: "Consultoria de branding",
  description: null,
  facts: ["A Wyse tem sede em São Paulo."],
  attributes: ["Estratégica", "Inovadora"],
  competitors: [{ name: "Ana Couto", variants: [] }, { name: "Interbrand", variants: [] }],
};

const judgement: Judgement = {
  brand_mentioned: true,
  brands_in_order: ["Interbrand", "Wyse", "Ana Couto"],
  sentiment: "positivo",
  recognition: "sim",
  attributes_associated: ["estrategica", "Barata"],
  claims: [{ claim: "A Wyse fica no Rio.", verdict: "incorreta", fact: "A Wyse tem sede em São Paulo." }],
};

test("mentions ignora acentos e maiúsculas e exige palavra inteira", () => {
  assert.equal(mentions("A WYSE é confiável?", ["Wyse"]), true);
  assert.equal(mentions("Use com sabedoria (wysely).", ["Wyse"]), false);
  assert.equal(mentions("Conheça a Água-Viva, de São Paulo", ["agua viva"]), true);
  assert.equal(mentions("Qualquer texto", [""]), false);
});

test("brandNames remove vazios e repetidos", () => {
  assert.deepEqual(brandNames("Wyse", ["wyse", "", "Wyse BI"]), ["Wyse", "Wyse BI"]);
});

test("sameSite compara domínios e aceita subdomínio", () => {
  assert.equal(bareDomain("https://www.Wyse.com.br/sobre"), "wyse.com.br");
  assert.equal(sameSite("blog.wyse.com.br", "https://www.wyse.com.br"), true);
  assert.equal(sameSite("outrowyse.com.br", "wyse.com.br"), false);
  assert.equal(sameSite(null, "wyse.com.br"), false);
});

test("buildAnalysis calcula posição, concorrentes, fonte própria e atributos", () => {
  const analysis = buildAnalysis({
    brand,
    question: "Quais as melhores consultorias de branding do Brasil?",
    responseText: "Destacam-se a Interbrand, a Wyse e a Ana Couto.",
    sourceDomains: ["exame.com", "wyse.com.br"],
    judgement,
  });
  assert.equal(analysis.question_names_brand, false);
  assert.equal(analysis.brand_in_text, true);
  assert.equal(analysis.mention_divergence, false);
  assert.equal(analysis.brand_position, 2);
  assert.deepEqual(analysis.competitors_mentioned, ["Ana Couto", "Interbrand"]);
  assert.equal(analysis.own_domain_cited, true);
  assert.deepEqual(analysis.attributes_associated, ["Estratégica"]);
  assert.equal(hasIncorrectClaim(analysis), true);
});

test("buildAnalysis marca pergunta que cita a marca e zera campos quando a marca não aparece", () => {
  const analysis = buildAnalysis({
    brand,
    question: "A Wyse é confiável?",
    responseText: "Não encontrei informações sobre essa empresa.",
    sourceDomains: [],
    judgement: { ...judgement, brand_mentioned: false, brands_in_order: [] },
  });
  assert.equal(analysis.question_names_brand, true);
  assert.equal(analysis.brand_in_text, false);
  assert.equal(analysis.brand_position, null);
  assert.equal(analysis.sentiment, null);
  assert.deepEqual(analysis.claims, []);
});

test("buildAnalysis estima a posição quando o modelo esquece a marca na lista", () => {
  const analysis = buildAnalysis({
    brand,
    question: "Quais consultorias?",
    responseText: "Interbrand, depois Wyse, depois Ana Couto.",
    sourceDomains: [],
    judgement: { ...judgement, brand_mentioned: false, brands_in_order: ["Interbrand", "Ana Couto"] },
  });
  assert.equal(analysis.brand_position, 2);
  assert.equal(analysis.mention_divergence, true);
});

test("parseJudgement descarta valores fora do formato", () => {
  const parsed = parseJudgement({
    brand_mentioned: true,
    brands_in_order: ["A", 3, " "],
    sentiment: "eufórico",
    recognition: "parcial",
    attributes_associated: "x",
    claims: [{ claim: "ok", verdict: "correta", fact: "" }, { claim: "", verdict: "correta" }, { claim: "x", verdict: "talvez" }],
  });
  assert.deepEqual(parsed.brands_in_order, ["A"]);
  assert.equal(parsed.sentiment, null);
  assert.equal(parsed.recognition, "parcial");
  assert.deepEqual(parsed.claims, [{ claim: "ok", verdict: "correta", fact: null }]);
  assert.throws(() => parseJudgement({ brands_in_order: [] }));
});

test("readToolInput lê o bloco da ferramenta", () => {
  const input = readToolInput({
    content: [{ type: "text", text: "..." }, { type: "tool_use", name: "registrar_analise", input: { brand_mentioned: false } }],
  });
  assert.deepEqual(input, { brand_mentioned: false });
  assert.throws(() => readToolInput({ content: [] }));
});

test("saída estruturada: lê a ferramenta ou, na falta dela, o JSON escrito no texto", async () => {
  const { firstJsonObject, readStructured } = await import("../engines/anthropic-tool");
  assert.deepEqual(readStructured({ content: [{ type: "tool_use", name: "t", input: { a: 1 } }] }, "t"), { a: 1 });
  assert.deepEqual(
    readStructured({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: 'Segue:\n```json\n{"a": {"b": "}"}}\n```' }] }, "t"),
    { a: { b: "}" } },
  );
  assert.equal(readStructured({ content: [{ type: "text", text: "sem json" }] }, "t"), null);
  assert.equal(firstJsonObject("{ quebrado"), null);
});
