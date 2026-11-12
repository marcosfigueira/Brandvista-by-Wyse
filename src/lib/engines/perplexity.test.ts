import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { askPerplexity, parsePerplexityResponse } from "./perplexity";
import { EngineError } from "./types";

const sample = {
  id: "abc",
  model: "sonar",
  choices: [{ index: 0, message: { role: "assistant", content: "Resposta [1][2]." } }],
  citations: ["https://a.example/1", "https://b.example/2"],
  search_results: [
    { title: "Fonte A", url: "https://a.example/1", date: "2026-10-01" },
    { title: "Fonte B", url: "https://b.example/2" },
    { title: "Repetida", url: "https://a.example/1" },
    { title: "Sem esquema", url: "javascript:alert(1)" },
  ],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PERPLEXITY_API_KEY;
});

test("extrai texto, modelo e fontes, sem repetir nem aceitar URL que não seja http", () => {
  const parsed = parsePerplexityResponse(sample);
  assert.equal(parsed.text, "Resposta [1][2].");
  assert.equal(parsed.model, "sonar");
  assert.deepEqual(parsed.sources, [
    { url: "https://a.example/1", title: "Fonte A", date: "2026-10-01", domain: "a.example" },
    { url: "https://b.example/2", title: "Fonte B", date: null, domain: "b.example" },
  ]);
});

test("usa citations quando search_results não vem", () => {
  const parsed = parsePerplexityResponse({ ...sample, search_results: undefined });
  assert.deepEqual(
    parsed.sources.map((source) => source.url),
    ["https://a.example/1", "https://b.example/2"],
  );
});

test("recusa retorno sem texto", () => {
  assert.throws(() => parsePerplexityResponse({ choices: [] }), EngineError);
  assert.throws(() => parsePerplexityResponse(null), EngineError);
});

test("sem chave configurada, falha com mensagem clara e sem chamar a API", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  await assert.rejects(
    () => askPerplexity({ question: "x", searchEnabled: true }),
    /PERPLEXITY_API_KEY/,
  );
  assert.equal(called, false);
});

test("com busca: envia a pergunta sem instrução de sistema e com localização no Brasil", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-de-teste";
  let sent: Record<string, unknown> = {};
  let auth = "";
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    auth = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify(sample), { status: 200 });
  }) as typeof fetch;

  const result = await askPerplexity({ question: "Qual a melhor?", searchEnabled: true });

  assert.equal(auth, "Bearer chave-de-teste");
  assert.deepEqual(sent.messages, [{ role: "user", content: "Qual a melhor?" }]);
  assert.deepEqual(sent.web_search_options, { user_location: { country: "BR" } });
  assert.equal(sent.disable_search, undefined);
  assert.equal(result.searchExecuted, true);
  assert.equal(result.sources.length, 2);
  assert.equal(result.model, "sonar");
});

test("sem busca: pede disable_search e registra que não buscou", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-de-teste";
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ model: "sonar", choices: [{ message: { content: "Sei pouco." } }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await askPerplexity({ question: "O que é X?", searchEnabled: false });

  assert.equal(sent.disable_search, true);
  assert.equal(sent.web_search_options, undefined);
  assert.equal(result.searchExecuted, false);
  assert.deepEqual(result.sources, []);
});

test("erro 401 vira mensagem que aponta a chave, sem expor o valor", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-secreta-123";
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  await assert.rejects(
    () => askPerplexity({ question: "x", searchEnabled: true }),
    (error: Error) => {
      assert.match(error.message, /erro 401/);
      assert.match(error.message, /PERPLEXITY_API_KEY/);
      assert.doesNotMatch(error.message, /chave-secreta-123/);
      return true;
    },
  );
});

test("erro 429 espera e tenta de novo; a resposta seguinte é aproveitada", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-de-teste";
  let calls = 0;
  const waits: number[] = [];
  globalThis.fetch = (async () => {
    calls++;
    return calls < 3
      ? new Response("rate limit", { status: 429 })
      : new Response(JSON.stringify(sample), { status: 200 });
  }) as typeof fetch;

  const result = await askPerplexity(
    { question: "x", searchEnabled: true },
    { sleep: async (ms) => void waits.push(ms) },
  );

  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 8000]);
  assert.equal(result.text, "Resposta [1][2].");
});

test("erro 429 respeita o cabeçalho retry-after, com teto", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-de-teste";
  let calls = 0;
  const waits: number[] = [];
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response("", { status: 429, headers: { "retry-after": "4" } });
    if (calls === 2) return new Response("", { status: 429, headers: { "retry-after": "600" } });
    return new Response(JSON.stringify(sample), { status: 200 });
  }) as typeof fetch;

  await askPerplexity({ question: "x", searchEnabled: true }, { sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(waits, [4000, 20000]);
});

test("erro 429 persistente desiste após três novas tentativas, com mensagem sobre ritmo", async () => {
  process.env.PERPLEXITY_API_KEY = "chave-de-teste";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("rate limit", { status: 429 });
  }) as typeof fetch;

  await assert.rejects(
    () => askPerplexity({ question: "x", searchEnabled: true }, { sleep: async () => {} }),
    /requisições por minuto/,
  );
  assert.equal(calls, 4);
});
