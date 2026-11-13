import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown";

test("markdown: títulos, listas, negrito, links e tabela", () => {
  const html = renderMarkdown(
    ["## Opções", "", "1. **Wyse**: consultoria", "2. Outra", "", "- item *leve*", "", "| Marca | Nota |", "| --- | --- |", "| Wyse | 9 |", "", "Veja [o site](https://wyse.com.br/a?b=1&c=2)."].join("\n"),
  );
  assert.match(html, /<h5>Opções<\/h5>/);
  assert.match(html, /<ol><li><strong>Wyse<\/strong>: consultoria<\/li><li>Outra<\/li><\/ol>/);
  assert.match(html, /<ul><li>item <em>leve<\/em><\/li><\/ul>/);
  assert.match(html, /<th>Marca<\/th><th>Nota<\/th>/);
  assert.match(html, /<td>Wyse<\/td><td>9<\/td>/);
  assert.match(html, /<a href="https:\/\/wyse\.com\.br\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">o site<\/a>/);
});

test("markdown: nenhuma marcação da resposta é executada", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[clique](javascript:alert(1))\n\n<img src=x onerror="x()">');
  assert.doesNotMatch(html, /<script|<img|href="javascript/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("markdown: bloco de código preserva o texto e não aplica formatação", () => {
  const html = renderMarkdown("```\n**não é negrito**\n```");
  assert.equal(html, "<pre><code>**não é negrito**</code></pre>");
});
