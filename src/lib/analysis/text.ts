/** Minúsculas, sem acentos e com pontuação trocada por espaço. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Posição da primeira vez em que um dos nomes aparece no texto, como palavra
 * inteira ("Wyse" não casa com "wysely"). Devolve -1 se nenhum aparece.
 * A comparação ignora maiúsculas, acentos e pontuação.
 */
export function firstMention(text: string, names: readonly string[]): number {
  const haystack = ` ${normalize(text)} `;
  let first = -1;
  for (const name of names) {
    const needle = normalize(name);
    if (!needle) continue;
    const index = haystack.indexOf(` ${needle} `);
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  return first;
}

/** Se o texto cita algum dos nomes. */
export function mentions(text: string, names: readonly string[]): boolean {
  return firstMention(text, names) !== -1;
}

/** Nome principal e variações de uma marca, sem vazios nem repetidos. */
export function brandNames(name: string, variants?: readonly string[] | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [name, ...(variants ?? [])]) {
    const key = normalize(item ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item.trim());
  }
  return result;
}

/** Domínio sem protocolo, "www" e caminho: "https://www.wyse.com.br/x" vira "wyse.com.br". */
export function bareDomain(value: string | null | undefined): string | null {
  const cleaned = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return cleaned || null;
}

/** Se um domínio é o da marca ou um subdomínio dele. */
export function sameSite(domain: string | null | undefined, brandDomain: string | null | undefined): boolean {
  const a = bareDomain(domain);
  const b = bareDomain(brandDomain);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}
