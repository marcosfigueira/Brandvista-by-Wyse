/** Robôs de IA conferidos no robots.txt, com o que cada um faz. */
export const AI_BOTS = [
  { agent: "GPTBot", label: "GPTBot", role: "Treino dos modelos da OpenAI" },
  { agent: "OAI-SearchBot", label: "OAI-SearchBot", role: "Busca do ChatGPT" },
  { agent: "ChatGPT-User", label: "ChatGPT-User", role: "Páginas abertas a pedido do usuário no ChatGPT" },
  { agent: "ClaudeBot", label: "ClaudeBot", role: "Treino dos modelos da Anthropic" },
  { agent: "Claude-SearchBot", label: "Claude-SearchBot", role: "Busca do Claude" },
  { agent: "PerplexityBot", label: "PerplexityBot", role: "Índice de busca do Perplexity" },
  { agent: "Google-Extended", label: "Google-Extended", role: "Uso do conteúdo pelo Gemini" },
] as const;

export type BotAccess = { agent: string; role: string; allowed: boolean };

export type SiteAudit = {
  domain: string | null;
  checkedAt: string;
  /** O site respondeu à página inicial. Se não, os demais campos não dizem nada. */
  reachable: boolean;
  llmsTxt: boolean;
  llmsFullTxt: boolean;
  robotsTxt: boolean;
  bots: BotAccess[];
  sitemap: boolean;
  home: {
    title: string | null;
    description: string | null;
    h1: string | null;
    lang: string | null;
    canonical: boolean;
    /** Tipos de dados estruturados (schema.org) encontrados na página inicial. */
    schemaTypes: string[];
  };
};

/**
 * Lê um robots.txt e diz se cada robô pode acessar a raiz do site. Vale o
 * grupo com o nome do robô; sem ele, o grupo "*". Um robô só é considerado
 * bloqueado quando o grupo tem "Disallow: /" sem um "Allow: /".
 */
export function parseRobots(text: string, agents: readonly string[]): Record<string, boolean> {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (field === "allow" || field === "disallow")) {
        current.rules.push({ allow: field === "allow", path: value });
      }
    }
  }
  const result: Record<string, boolean> = {};
  for (const agent of agents) {
    const group =
      groups.find((item) => item.agents.includes(agent.toLowerCase())) ??
      groups.find((item) => item.agents.includes("*"));
    const blocked = Boolean(group?.rules.some((rule) => !rule.allow && rule.path === "/"));
    const reopened = Boolean(group?.rules.some((rule) => rule.allow && rule.path === "/"));
    result[agent] = !blocked || reopened;
  }
  return result;
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decode(match[2] ?? match[3] ?? "") : null;
}

/** Extrai da página inicial o que importa para as IAs entenderem o site. */
export function parseHome(html: string): SiteAudit["home"] {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const descriptionTag = metaTags.find((tag) => /name\s*=\s*["']description["']/i.test(tag));
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  const canonical = (html.match(/<link\b[^>]*>/gi) ?? []).some((tag) => /rel\s*=\s*["']canonical["']/i.test(tag));

  const types = new Set<string>();
  const collect = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    for (const item of Array.isArray(type) ? type : [type]) if (typeof item === "string") types.add(item);
    if (record["@graph"]) collect(record["@graph"]);
  };
  for (const block of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collect(JSON.parse(block[1]));
    } catch {
      // Bloco de dados estruturados mal formado: ignorado.
    }
  }

  return {
    title: title ? decode(title[1].replace(/<[^>]+>/g, "")) || null : null,
    description: descriptionTag ? attribute(descriptionTag, "content") : null,
    h1: h1 ? decode(h1[1].replace(/<[^>]+>/g, "")) || null : null,
    lang: htmlTag ? attribute(htmlTag[0], "lang") : null,
    canonical,
    schemaTypes: [...types].sort(),
  };
}

/** Um arquivo de texto de verdade, e não a página de erro ou a inicial devolvida no lugar. */
export function looksLikeText(body: string): boolean {
  const start = body.trimStart().slice(0, 200).toLowerCase();
  return body.trim().length > 0 && !start.startsWith("<!doctype") && !start.startsWith("<html") && !start.includes("<head");
}

/** Só domínios públicos comuns: nada de endereços numéricos ou nomes internos. */
export function publicHost(domain: string | null | undefined): string | null {
  const host = (domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#:]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (/^[0-9.]+$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return null;
  return host;
}

const MAX_BYTES = 400_000;

async function fetchText(url: string): Promise<{ ok: boolean; text: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "BrandVistaAudit/1.0 (+https://brandvista.ai)", Accept: "text/html,text/plain,*/*" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) return { ok: false, text: "" };
    return { ok: true, text: (await response.text()).slice(0, MAX_BYTES) };
  } catch {
    return { ok: false, text: "" };
  }
}

/** Confere no site da marca os arquivos e marcações que ajudam as IAs a ler o conteúdo. */
export async function auditSite(domain: string | null | undefined): Promise<SiteAudit> {
  const host = publicHost(domain);
  const empty: SiteAudit = {
    domain: host,
    checkedAt: new Date().toISOString(),
    reachable: false,
    llmsTxt: false,
    llmsFullTxt: false,
    robotsTxt: false,
    bots: [],
    sitemap: false,
    home: { title: null, description: null, h1: null, lang: null, canonical: false, schemaTypes: [] },
  };
  if (!host) return empty;

  const base = `https://${host}`;
  const [home, llms, llmsFull, robots, sitemap] = await Promise.all([
    fetchText(`${base}/`),
    fetchText(`${base}/llms.txt`),
    fetchText(`${base}/llms-full.txt`),
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/sitemap.xml`),
  ]);
  if (!home.ok) return empty;

  const robotsFound = robots.ok && looksLikeText(robots.text);
  const access = parseRobots(robotsFound ? robots.text : "", AI_BOTS.map((bot) => bot.agent));
  return {
    ...empty,
    reachable: true,
    llmsTxt: llms.ok && looksLikeText(llms.text),
    llmsFullTxt: llmsFull.ok && looksLikeText(llmsFull.text),
    robotsTxt: robotsFound,
    bots: AI_BOTS.map((bot) => ({ agent: bot.agent, role: bot.role, allowed: access[bot.agent] })),
    sitemap:
      (sitemap.ok && /<(urlset|sitemapindex)\b/i.test(sitemap.text)) ||
      (robotsFound && /^\s*sitemap\s*:/im.test(robots.text)),
    home: parseHome(home.text),
  };
}
