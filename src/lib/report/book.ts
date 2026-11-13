import type { Analysis } from "../analysis/types";
import { LOGO_ON_COLOR } from "./logos";
import { escapeHtml, renderMarkdown } from "./markdown";

export type BookResponse = {
  engine: string;
  repetition: number;
  model: string;
  createdAt: string;
  searchEnabled: boolean;
  searchExecuted: boolean | null;
  /** A IA interrompeu a resposta por limite de tamanho. */
  truncated?: boolean;
  ok: boolean;
  errorMessage: string | null;
  text: string | null;
  sources: { url?: string | null; title?: string | null; domain?: string | null }[];
  promptId: string;
  question: string;
  kind: string;
  version: number;
  analysis: Analysis | null;
};

export type BookInput = {
  clientName: string;
  runDate: string;
  runKind: string;
  responses: BookResponse[];
};

/** Ordem das seções dentro de cada capítulo. */
const ENGINES = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
] as const;

const KIND_LABEL: Record<string, string> = {
  categoria: "Categoria",
  comparativa: "Comparativa",
  sobre_a_marca: "Sobre a marca",
  reconhecimento: "Reconhecimento",
  associacao: "Associação",
};

const longDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Resumo da análise de uma resposta, em uma linha. */
export function analysisLine(analysis: Analysis | null): string | null {
  if (!analysis) return null;
  const cited = analysis.brand_in_text || analysis.brand_mentioned;
  if (!cited) return "Análise: a marca não foi citada nesta resposta.";
  const incorrect = analysis.claims.filter((claim) => claim.verdict === "incorreta").length;
  const tone = { positivo: "tom positivo", neutro: "tom neutro", negativo: "tom negativo" } as const;
  return `Análise: ${[
    "marca citada",
    analysis.brand_position ? `${analysis.brand_position}ª entre as marcas citadas` : null,
    analysis.sentiment ? tone[analysis.sentiment] : null,
    incorrect > 0 ? `${incorrect} ${incorrect === 1 ? "afirmação incorreta" : "afirmações incorretas"}` : null,
  ]
    .filter(Boolean)
    .join(" · ")}.`;
}

const STYLE = `
:root { --ground:#f1f2f4; --ink:#000; --paper:#fff; --brand:#ff6200; --blue:#0131ff; --sun:#ffcc00; --muted:#4c4c4c; --line:#e3e5e8; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin:0; background:var(--ground); color:var(--ink); font-family:"Poppins",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-size:15px; line-height:1.6; }
a { color:inherit; }
.pagina { max-width: 920px; margin: 0 auto; padding: 32px 24px 80px; display:flex; flex-direction:column; gap:16px; }
.cartao { background:var(--paper); border-radius:28px; padding:32px; }
.capa { background:var(--brand); border-radius:28px; padding:48px 40px; min-height: 520px; display:flex; flex-direction:column; gap:20px; }
.capa img { width:150px; height:auto; }
.capa .rotulo { font-size:15px; font-weight:600; margin-top:48px; }
.capa h1 { font-size:52px; line-height:1.05; font-weight:600; letter-spacing:-0.02em; margin:0; overflow-wrap:anywhere; }
.capa .dados { margin-top:auto; font-size:15px; font-weight:500; }
.capa .assinatura { font-size:13px; font-weight:600; }
h2 { font-size:24px; line-height:1.25; font-weight:600; margin:0 0 12px; }
.sobre p { margin:0 0 10px; max-width:70ch; }
.indice ol { margin:0; padding:0; list-style:none; counter-reset:cap; }
.indice li { counter-increment:cap; border-top:1px solid var(--line); }
.indice li:first-child { border-top:0; }
.indice a { display:flex; gap:14px; align-items:baseline; padding:12px 0; text-decoration:none; min-height:44px; }
.indice a::before { content:counter(cap); font-weight:600; min-width:28px; }
.indice a:hover span, .indice a:focus-visible span { text-decoration:underline; }
.indice small { color:var(--muted); margin-left:auto; white-space:nowrap; padding-left:12px; }
.capitulo { display:flex; flex-direction:column; gap:16px; padding-top:24px; }
.abertura { background:var(--ink); color:var(--paper); border-radius:28px; padding:32px; }
.abertura .numero { display:inline-block; background:var(--brand); color:var(--ink); border-radius:999px; padding:4px 14px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; }
.abertura h2 { font-size:28px; margin:14px 0 8px; overflow-wrap:anywhere; }
.abertura p { margin:0; color:#cfd1d3; font-size:13px; }
.motor > h3 { font-size:20px; font-weight:600; margin:0 0 4px; display:flex; align-items:center; gap:10px; }
.motor > h3::before { content:""; width:12px; height:12px; border-radius:999px; background:var(--brand); }
.resposta { border-top:1px solid var(--line); padding-top:18px; margin-top:18px; }
.resposta:first-of-type { border-top:0; margin-top:8px; padding-top:0; }
.meta { font-size:12px; color:var(--muted); margin:0 0 4px; }
.analise { font-size:13px; font-weight:500; margin:0 0 12px; }
.texto { background:var(--ground); border-radius:16px; padding:18px 20px; overflow-wrap:anywhere; }
.texto > :first-child { margin-top:0; } .texto > :last-child { margin-bottom:0; }
.texto h4, .texto h5, .texto h6 { font-size:15px; font-weight:600; margin:16px 0 6px; }
.texto p { margin:0 0 10px; } .texto ul, .texto ol { margin:0 0 10px; padding-left:22px; } .texto li { margin-bottom:4px; }
.texto pre { background:var(--paper); border-radius:10px; padding:12px; overflow-x:auto; font-size:13px; }
.texto blockquote { margin:0 0 10px; padding-left:14px; border-left:3px solid var(--line); color:var(--muted); }
.texto hr { border:0; border-top:1px solid var(--line); margin:14px 0; }
.tabela { overflow-x:auto; margin:0 0 10px; }
table { border-collapse:collapse; width:100%; font-size:13px; }
th, td { border:1px solid var(--line); padding:6px 10px; text-align:left; vertical-align:top; background:var(--paper); }
.fontes { font-size:13px; margin:12px 0 0; }
.fontes ol { margin:4px 0 0; padding-left:22px; } .fontes li { margin-bottom:3px; overflow-wrap:anywhere; }
.erro { border:2px solid #b00020; color:#b00020; border-radius:16px; padding:12px 16px; font-size:14px; }
.vazio { color:var(--muted); font-size:14px; margin:8px 0 0; }
.voltar { font-size:13px; font-weight:600; align-self:flex-start; padding:10px 0; }
@media print {
  body { background:#fff; font-size:11pt; }
  .pagina { max-width:none; padding:0; gap:10pt; }
  .capa { min-height: 240mm; break-after:page; }
  .indice { break-after:page; }
  .capitulo { break-before:page; padding-top:0; }
  .cartao, .abertura, .capa { border-radius:12pt; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .cartao { padding:14pt; border:1px solid var(--line); }
  .resposta { break-inside:auto; } .meta, .analise, h3 { break-after:avoid; }
  .voltar { display:none; }
}
`;

/**
 * Monta o livro de respostas de uma rodada: um arquivo HTML único, com capa,
 * índice e um capítulo por pergunta; em cada capítulo, uma seção por IA com as
 * respostas na íntegra. O texto das respostas é sempre escapado.
 */
export function buildResponsesBook(input: BookInput): string {
  const chapters = new Map<string, BookResponse[]>();
  for (const response of input.responses) {
    chapters.set(response.promptId, [...(chapters.get(response.promptId) ?? []), response]);
  }
  const ordered = [...chapters.values()].sort((a, b) => a[0].question.localeCompare(b[0].question, "pt-BR"));
  const total = input.responses.length;
  const failed = input.responses.filter((response) => !response.ok).length;
  const client = escapeHtml(input.clientName);
  const runDay = longDate.format(new Date(input.runDate));

  const index = ordered
    .map(
      (group, position) =>
        `<li><a href="#cap-${position + 1}"><span>${escapeHtml(group[0].question)}</span><small>${group.length} ${group.length === 1 ? "resposta" : "respostas"}</small></a></li>`,
    )
    .join("\n");

  const body = ordered
    .map((group, position) => {
      const first = group[0];
      const sections = ENGINES.map((engine) => {
        const answers = group
          .filter((response) => response.engine === engine.id)
          .sort((a, b) => a.repetition - b.repetition);
        if (answers.length === 0) {
          return `<section class="cartao motor"><h3>${engine.label}</h3><p class="vazio">Esta IA não foi consultada nesta pergunta.</p></section>`;
        }
        const blocks = answers
          .map((answer) => {
            const search = !answer.searchEnabled
              ? "pergunta feita sem busca na web"
              : answer.searchExecuted
                ? "busca na web executada"
                : "respondeu sem buscar na web";
            const meta = `Repetição ${answer.repetition} · modelo ${escapeHtml(answer.model)} · ${dateTime.format(new Date(answer.createdAt))} · ${search}`;
            if (!answer.ok) {
              return `<article class="resposta"><p class="meta">${meta}</p><p class="erro">A IA não respondeu a esta consulta. ${escapeHtml(answer.errorMessage ?? "")}</p></article>`;
            }
            const line = analysisLine(answer.analysis);
            const sources = answer.sources.filter((source) => typeof source?.url === "string" && /^https?:\/\//i.test(source.url));
            const sourceList =
              sources.length === 0
                ? ""
                : `<div class="fontes"><strong>Fontes citadas pela IA: ${sources.length}</strong><ol>${sources
                    .map((source) => {
                      const url = escapeHtml(source.url as string);
                      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.domain || (source.url as string))}</a>${source.domain ? ` · ${escapeHtml(source.domain)}` : ""}</li>`;
                    })
                    .join("")}</ol></div>`;
            return `<article class="resposta"><p class="meta">${meta}</p>${line ? `<p class="analise">${escapeHtml(line)}</p>` : ""}<div class="texto">${renderMarkdown(answer.text ?? "")}</div>${answer.truncated ? '<p class="vazio">A IA interrompeu esta resposta por ter atingido o limite de tamanho: o texto acima termina onde ela parou.</p>' : ""}${sourceList}</article>`;
          })
          .join("\n");
        return `<section class="cartao motor"><h3>${engine.label}</h3>${blocks}</section>`;
      }).join("\n");

      return `<section class="capitulo" id="cap-${position + 1}">
<header class="abertura"><span class="numero">Pergunta ${position + 1} de ${ordered.length}</span><h2>${escapeHtml(first.question)}</h2><p>Tipo: ${escapeHtml(KIND_LABEL[first.kind] ?? first.kind)} · versão ${first.version} da pergunta · ${group.length} ${group.length === 1 ? "resposta" : "respostas"}</p></header>
${sections}
<a class="voltar" href="#indice">Voltar ao índice</a>
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Respostas das IAs — ${client} — ${escapeHtml(runDay)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap">
<style>${STYLE}</style>
</head>
<body>
<main class="pagina">
<section class="capa">
<img src="data:${LOGO_ON_COLOR}" alt="BrandVista">
<p class="rotulo">Respostas das IAs, na íntegra</p>
<h1>${client}</h1>
<p class="dados">${input.runKind === "teste" ? "Rodada de teste" : "Rodada completa"} de ${escapeHtml(runDay)}<br>${ordered.length} ${ordered.length === 1 ? "pergunta" : "perguntas"} · ${total} ${total === 1 ? "consulta" : "consultas"}${failed > 0 ? ` · ${failed} sem resposta` : ""}</p>
<p class="assinatura">by Wyse Brand Intelligence</p>
</section>

<section class="cartao sobre">
<h2>Sobre este documento</h2>
<p>Este documento reúne, sem cortes nem edição, tudo o que ChatGPT, Claude, Gemini e Perplexity responderam nesta rodada. Ele serve para conferir os números do relatório: cada indicador foi calculado a partir destas respostas.</p>
<p>Cada pergunta foi enviada exatamente como está escrita, sem nenhuma instrução adicional, e repetida para cada IA. O documento é organizado por pergunta; em cada uma, há uma seção por IA, com as repetições em ordem. Cada resposta traz a versão do modelo, a data e a hora da consulta, se houve busca na web e as fontes que a IA citou.</p>
<p>A linha "Análise" resume o que o BrandVista extraiu de cada resposta. O texto e os links das respostas são de responsabilidade de cada IA e podem conter erros.</p>
</section>

<nav class="cartao indice" id="indice" aria-label="Índice">
<h2>Índice</h2>
<ol>
${index}
</ol>
</nav>

${body}
</main>
</body>
</html>
`;
}


