/** Troca os caracteres especiais do HTML, para o texto nunca ser lido como marcação. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Só endereços http e https viram link. */
function safeUrl(url: string): string | null {
  const clean = url.trim().replace(/&amp;/g, "&");
  return /^https?:\/\/[^\s<>"']+$/i.test(clean) ? escapeHtml(clean) : null;
}

/** Negrito, itálico, código e links dentro de uma linha. Recebe texto já escapado. */
function inline(escaped: string): string {
  const codes: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const href = safeUrl(url);
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : match;
  });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => codes[Number(index)]);
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

/**
 * Converte o markdown de uma resposta em HTML. Todo o texto é escapado antes,
 * então nenhuma marcação vinda da resposta é executada: só as tags escritas
 * aqui chegam ao documento. `baseLevel` é o nível do primeiro título (4 = h4).
 */
export function renderMarkdown(markdown: string, baseLevel = 4): string {
  const lines = escapeHtml(markdown.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join("<br>"))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (index += 1; index < lines.length && !/^\s*```/.test(lines[index]); index += 1) code.push(lines[index]);
      out.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    if (isTableRow(line) && index + 1 < lines.length && isTableRule(lines[index + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (index += 2; index < lines.length && isTableRow(lines[index]); index += 1) rows.push(cells(lines[index]));
      index -= 1;
      out.push(
        `<div class="tabela"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(6, baseLevel + heading[1].length - 1);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      continue;
    }

    const bullet = /^\s*[-*+•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list = list ?? { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    const quote = /^\s*&gt;\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    // Linha recuada logo depois de um item de lista continua o item.
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += `<br>${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flush();
  return out.join("\n");
}
