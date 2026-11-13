import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeText, parseHome, parseRobots, publicHost } from "./audit";

test("robots.txt: grupo do robô vale mais que o grupo geral", () => {
  const robots = `
User-agent: *
Disallow: /admin

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /
Allow: /
`;
  const access = parseRobots(robots, ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]);
  assert.deepEqual(access, { GPTBot: false, ClaudeBot: false, PerplexityBot: true, "OAI-SearchBot": true });
});

test("robots.txt: bloqueio geral vale para quem não tem grupo próprio; vazio libera todos", () => {
  assert.deepEqual(parseRobots("User-agent: *\nDisallow: / # tudo", ["GPTBot"]), { GPTBot: false });
  assert.deepEqual(parseRobots("", ["GPTBot"]), { GPTBot: true });
});

test("página inicial: título, descrição, idioma e dados estruturados", () => {
  const home = parseHome(`<!doctype html><html lang="pt-BR"><head>
    <title>Wyse &amp; Co</title>
    <meta content="Consultoria de branding" name="description">
    <link rel="canonical" href="https://wyse.com.br/">
    <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
    <script type="application/ld+json">{ quebrado }</script>
    </head><body><h1><span>Brand Intelligence</span></h1></body></html>`);
  assert.equal(home.title, "Wyse & Co");
  assert.equal(home.description, "Consultoria de branding");
  assert.equal(home.h1, "Brand Intelligence");
  assert.equal(home.lang, "pt-BR");
  assert.equal(home.canonical, true);
  assert.deepEqual(home.schemaTypes, ["Organization", "Thing", "WebSite"]);
});

test("llms.txt só conta se for texto, e só domínios públicos são conferidos", () => {
  assert.equal(looksLikeText("# Wyse\n> Consultoria"), true);
  assert.equal(looksLikeText("<!DOCTYPE html><html>não encontrado</html>"), false);
  assert.equal(looksLikeText("  "), false);
  assert.equal(publicHost("https://www.wyse.com.br/sobre"), "www.wyse.com.br");
  assert.equal(publicHost("localhost"), null);
  assert.equal(publicHost("192.168.0.1"), null);
  assert.equal(publicHost("intranet.local"), null);
  assert.equal(publicHost(null), null);
});
