import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { askAnthropic, parseAnthropicResponse } from "./anthropic";
import { askGemini, parseGeminiResponse } from "./gemini";
import { ENGINES } from "./index";
import { askOpenAI, parseOpenAIResponse } from "./openai";
import { EngineError } from "./types";

const realFetch = globalThis.fetch;
const KEYS = ["OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "PERPLEXITY_API_KEY"];
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of KEYS) delete process.env[key];
});

/** Simula a API: guarda o que foi enviado e devolve o retorno indicado. */
function mockFetch(reply: unknown) {
  const seen: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    seen.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return seen;
}

// ---------------------------------------------------------------- ChatGPT

const openaiSample = {
  model: "chat-latest-2026",
  output: [
    { type: "web_search_call", id: "ws_1", status: "completed" },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "A marca X é citada.",
          annotations: [
            { type: "url_citation", url: "https://www.a.example/p?utm_source=openai", title: "A", start_index: 0, end_index: 5 },
            { type: "url_citation", url: "https://www.a.example/p?utm_source=openai", title: "A de novo" },
            { type: "file_citation", url: "https://ignorar.example" },
          ],
        },
      ],
    },
  ],
};

test("ChatGPT: lê texto, citações e a marca de busca executada", () => {
  const parsed = parseOpenAIResponse(openaiSample);
  assert.equal(parsed.text, "A marca X é citada.");
  assert.equal(parsed.searchExecuted, true);
  assert.equal(parsed.model, "chat-latest-2026");
  assert.deepEqual(parsed.sources, [
    { url: "https://www.a.example/p?utm_source=openai", title: "A", date: null, domain: "a.example" },
  ]);
});

test("ChatGPT: sem item de busca, registra que respondeu sem buscar", () => {
  const parsed = parseOpenAIResponse({
    output: [{ type: "message", content: [{ type: "output_text", text: "Sei de cor." }] }],
  });
  assert.equal(parsed.searchExecuted, false);
  assert.deepEqual(parsed.sources, []);
  assert.throws(() => parseOpenAIResponse({ output: [] }), EngineError);
});

test("ChatGPT: com busca envia a ferramenta com Brasil; sem busca não envia ferramenta", async () => {
  process.env.OPENAI_API_KEY = "k";
  const seen = mockFetch(openaiSample);
  await askOpenAI({ question: "Qual?", searchEnabled: true });
  await askOpenAI({ question: "O que é X?", searchEnabled: false });

  assert.equal(seen[0].url, "https://api.openai.com/v1/responses");
  assert.equal(seen[0].headers.get("authorization"), "Bearer k");
  assert.equal(seen[0].body.input, "Qual?");
  assert.deepEqual(seen[0].body.tools, [
    { type: "web_search", user_location: { type: "approximate", country: "BR" } },
  ]);
  assert.equal(seen[0].body.instructions, undefined);
  assert.equal(seen[1].body.tools, undefined);
});

// ----------------------------------------------------------------- Gemini

const geminiSample = {
  steps: [
    { type: "thought", summary: [] },
    { type: "google_search_call", arguments: { queries: ["melhor x"] } },
    { type: "google_search_result", call_id: "c1", result: [] },
    {
      type: "model_output",
      content: [
        {
          type: "text",
          text: "Segundo as fontes, X lidera.",
          annotations: [
            { type: "url_citation", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "exemplo.com.br", start_index: 0, end_index: 5 },
            { type: "url_citation", url: "https://blog.b.example/post", title: "Um título de página" },
          ],
        },
      ],
    },
  ],
};

test("Gemini: lê texto e citações; título em forma de domínio vale como domínio", () => {
  const parsed = parseGeminiResponse(geminiSample);
  assert.equal(parsed.text, "Segundo as fontes, X lidera.");
  assert.equal(parsed.searchExecuted, true);
  assert.deepEqual(
    parsed.sources.map((source) => source.domain),
    ["exemplo.com.br", "blog.b.example"],
  );
});

test("Gemini: sem passo de busca, registra que não buscou; sem texto, falha", () => {
  const parsed = parseGeminiResponse({
    steps: [{ type: "model_output", content: [{ type: "text", text: "Resposta direta." }] }],
  });
  assert.equal(parsed.searchExecuted, false);
  assert.throws(() => parseGeminiResponse({ steps: [] }), EngineError);
});

test("Gemini: envia a chave no cabeçalho próprio e a ferramenta só com busca", async () => {
  process.env.GEMINI_API_KEY = "g";
  const seen = mockFetch(geminiSample);
  await askGemini({ question: "Qual?", searchEnabled: true });
  await askGemini({ question: "O que é X?", searchEnabled: false });

  assert.equal(seen[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(seen[0].headers.get("x-goog-api-key"), "g");
  assert.equal(seen[0].body.input, "Qual?");
  assert.deepEqual(seen[0].body.tools, [{ type: "google_search" }]);
  assert.equal(seen[1].body.tools, undefined);
});

// ----------------------------------------------------------------- Claude

const claudeSample = {
  model: "claude-sonnet-5-5",
  content: [
    { type: "text", text: "Vou pesquisar." },
    { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "melhor x" } },
    { type: "web_search_tool_result", tool_use_id: "srv1", content: [] },
    { type: "text", text: " A marca X " },
    {
      type: "text",
      text: "aparece em primeiro.",
      citations: [
        { type: "web_search_result_location", url: "https://a.example/1", title: "Fonte A", cited_text: "..." },
      ],
    },
  ],
  usage: { server_tool_use: { web_search_requests: 1 } },
};

test("Claude: junta os blocos de texto, lê citações e a marca de busca", () => {
  const parsed = parseAnthropicResponse(claudeSample);
  assert.equal(parsed.text, "Vou pesquisar. A marca X aparece em primeiro.");
  assert.equal(parsed.searchExecuted, true);
  assert.deepEqual(parsed.sources, [
    { url: "https://a.example/1", title: "Fonte A", date: null, domain: "a.example" },
  ]);
  assert.throws(() => parseAnthropicResponse({ content: [] }), EngineError);
});

test("Claude: envia versão da API, chave e ferramenta de busca com Brasil", async () => {
  process.env.ANTHROPIC_API_KEY = "a";
  const seen = mockFetch(claudeSample);
  await askAnthropic({ question: "Qual?", searchEnabled: true });
  await askAnthropic({ question: "O que é X?", searchEnabled: false });

  assert.equal(seen[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen[0].headers.get("x-api-key"), "a");
  assert.equal(seen[0].headers.get("anthropic-version"), "2023-06-01");
  assert.deepEqual(seen[0].body.messages, [{ role: "user", content: "Qual?" }]);
  assert.equal(seen[0].body.system, undefined);
  const tools = seen[0].body.tools as Record<string, unknown>[];
  assert.equal(tools[0].name, "web_search");
  assert.deepEqual(tools[0].user_location, { type: "approximate", country: "BR" });
  assert.equal(seen[1].body.tools, undefined);
});

// ------------------------------------------------------------ Em comum

test("todos os motores: sem chave, falham citando a variável e sem chamar a API", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  for (const engine of ENGINES) {
    await assert.rejects(
      () => engine.ask({ question: "x", searchEnabled: true }),
      new RegExp(engine.keyName),
    );
  }
  assert.equal(called, false);
});

test("todos os motores: erro 503 também gera nova tentativa", async () => {
  process.env.OPENAI_API_KEY = "k";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls === 1
      ? new Response("overloaded", { status: 503 })
      : new Response(JSON.stringify(openaiSample), { status: 200 });
  }) as typeof fetch;
  const result = await askOpenAI({ question: "x", searchEnabled: true }, { sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.text, "A marca X é citada.");
});

test("país da marca: enviado ao ChatGPT, ao Claude e ao Perplexity; código inválido vira Brasil", async () => {
  process.env.OPENAI_API_KEY = "k";
  process.env.ANTHROPIC_API_KEY = "a";
  process.env.PERPLEXITY_API_KEY = "p";
  const { askPerplexity } = await import("./perplexity");

  let seen = mockFetch(openaiSample);
  await askOpenAI({ question: "x", searchEnabled: true, country: "pt" });
  await askOpenAI({ question: "x", searchEnabled: true, country: "Portugal" });
  const location = (index: number) =>
    ((seen[index].body.tools as Record<string, unknown>[])[0].user_location as { country: string }).country;
  assert.equal(location(0), "PT");
  assert.equal(location(1), "BR");

  seen = mockFetch(claudeSample);
  await askAnthropic({ question: "x", searchEnabled: true, country: "US" });
  assert.equal(location(0), "US");

  seen = mockFetch({ model: "sonar", choices: [{ message: { content: "ok" } }] });
  await askPerplexity({ question: "x", searchEnabled: true, country: "MX" });
  assert.deepEqual(seen[0].body.web_search_options, { user_location: { country: "MX" } });
});

test("stoppedByLength reconhece o corte por tamanho em cada API", async () => {
  const { stoppedByLength } = await import("./types");
  assert.equal(stoppedByLength({ stop_reason: "max_tokens" }), true);
  assert.equal(stoppedByLength({ stop_reason: "end_turn" }), false);
  assert.equal(stoppedByLength({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), true);
  assert.equal(stoppedByLength({ choices: [{ finish_reason: "length" }] }), true);
  assert.equal(stoppedByLength({ choices: [{ finish_reason: "stop" }] }), false);
  assert.equal(stoppedByLength({ steps: [{ type: "model_output", finish_reason: "MAX_TOKENS" }] }), true);
  assert.equal(stoppedByLength(null), false);
});
