import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisLine, buildResponsesBook, type BookResponse } from "./book";

const answer = (patch: Partial<BookResponse>): BookResponse => ({
  engine: "chatgpt",
  repetition: 1,
  model: "modelo-x",
  createdAt: "2026-11-11T15:00:00Z",
  searchEnabled: true,
  searchExecuted: true,
  ok: true,
  errorMessage: null,
  text: "Texto",
  sources: [],
  promptId: "p1",
  question: "Melhores consultorias?",
  kind: "categoria",
  version: 1,
  analysis: null,
  ...patch,
});

test("livro: um capítulo por pergunta, seções por IA na ordem pedida, tudo escapado", () => {
  const html = buildResponsesBook({
    clientName: "Wyse <b>",
    runDate: "2026-11-11T15:00:00Z",
    runKind: "completa",
    responses: [
      answer({ engine: "perplexity", text: "**Wyse** lidera <script>x</script>", sources: [{ url: "https://exame.com/a", title: "Exame", domain: "exame.com" }, { url: "javascript:alert(1)" }] }),
      answer({ engine: "chatgpt", repetition: 2, text: "Segunda" }),
      answer({ engine: "chatgpt", repetition: 1, text: "Primeira" }),
      answer({ engine: "gemini", ok: false, text: null, errorMessage: "erro 503" }),
      answer({ promptId: "p2", question: "A Wyse é boa?", kind: "sobre_a_marca" }),
    ],
  });
  assert.equal((html.match(/class="capitulo"/g) ?? []).length, 2);
  assert.match(html, /Wyse &lt;b&gt;/);
  assert.doesNotMatch(html, /<script>x<\/script>|javascript:alert/);
  assert.match(html, /<strong>Wyse<\/strong> lidera/);
  const chapter = html.slice(html.indexOf('id="cap-2"'));
  const order = ["ChatGPT", "Claude", "Gemini", "Perplexity"].map((label) => chapter.indexOf(`<h3>${label}</h3>`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(chapter.indexOf("Primeira") < chapter.indexOf("Segunda"));
  assert.match(chapter, /Esta IA não foi consultada nesta pergunta/);
  assert.match(chapter, /A IA não respondeu a esta consulta\. erro 503/);
  assert.match(html, /5 consultas · 1 sem resposta/);
});

test("linha de análise resume citação, posição, tom e erros", () => {
  const base = {
    question_names_brand: false, brand_in_text: true, brand_mentioned: true, mention_divergence: false,
    brands_in_order: [], brand_position: 2, competitors_mentioned: [], own_domain_cited: false,
    sentiment: "positivo" as const, recognition: null, attributes_associated: [],
    claims: [{ claim: "x", verdict: "incorreta" as const, fact: "f" }],
  };
  assert.equal(analysisLine(base), "Análise: marca citada · 2ª entre as marcas citadas · tom positivo · 1 afirmação incorreta.");
  assert.equal(analysisLine({ ...base, brand_in_text: false, brand_mentioned: false }), "Análise: a marca não foi citada nesta resposta.");
  assert.equal(analysisLine(null), null);
});
