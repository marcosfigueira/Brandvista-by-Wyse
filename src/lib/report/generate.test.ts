import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReportContent } from "./generate";

test("o relatório do modelo é validado: prioridades e pilares fora da lista viram o padrão", () => {
  const content = parseReportContent({
    headline: " A marca some no mercado. ",
    summary: ["a", "", 3, "b"],
    strengths: [],
    weaknesses: ["x"],
    content_gaps: [{ gap: "Falta guia", evidence: "0 de 12", kpi: "Presença", priority: "urgente" }, { gap: "" }],
    content_ideas: [{ title: "Guia", format: "Artigo", answers: "Pergunta?", outline: ["1", "2"], kpi: "Presença" }],
    corrections: [{ issue: "erro", action: "corrigir" }, { issue: "sem ação" }],
    technical_actions: [{ action: "Publicar llms.txt", why: "Não existe", priority: "alta" }],
    earned_media: [{ target: "site.com", action: "Pauta", why: "Mais citado" }],
    plan: [{ action: "Fazer", pillar: "Outro", impact: "alta", effort: "baixa" }],
  });
  assert.equal(content.headline, "A marca some no mercado.");
  assert.deepEqual(content.summary, ["a", "b"]);
  assert.equal(content.content_gaps.length, 1);
  assert.equal(content.content_gaps[0].priority, "media");
  assert.equal(content.corrections.length, 1);
  assert.equal(content.plan[0].pillar, "Estruturar");
  assert.throws(() => parseReportContent({ summary: [] }));
});
