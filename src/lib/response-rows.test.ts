import assert from "node:assert/strict";
import { test } from "node:test";
import { errorRow, okRow } from "./response-rows";

const base = {
  run_id: "r",
  prompt_id: "p",
  engine: "perplexity",
  repetition: 1,
  search_enabled: true,
};

test("linhas de sucesso e de erro têm exatamente os mesmos campos", () => {
  const ok = okRow(base, {
    text: "t",
    sources: [{ url: "https://a.example", title: null, date: null, domain: "a.example" }],
    searchExecuted: true,
    model: "sonar",
    raw: {},
    latencyMs: 10,
  });
  const failed = errorRow(base, "sonar", new Error("falhou"));
  assert.deepEqual(Object.keys(ok).sort(), Object.keys(failed).sort());
});

test("linha de erro nunca deixa `sources` nulo e guarda a mensagem", () => {
  const failed = errorRow(base, "sonar", new Error("falhou"));
  assert.deepEqual(failed.sources, []);
  assert.equal(failed.status, "erro");
  assert.equal(failed.error_message, "falhou");
  assert.equal(errorRow(base, "sonar", "x").error_message, "Erro desconhecido ao consultar o motor.");
});
