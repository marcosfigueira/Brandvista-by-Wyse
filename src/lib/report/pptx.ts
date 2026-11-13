import PptxGenJS from "pptxgenjs";
import { engineLabel } from "../engines";
import type { SiteAudit } from "./audit";
import { LOGO_COLOR, LOGO_ON_COLOR } from "./logos";
import type { Priority, ReportContent, ReportData } from "./types";

type Slide = PptxGenJS.Slide;
type TextOptions = PptxGenJS.TextPropsOptions;

// Mesmas cores e fonte do web app.
const C = {
  ground: "F1F2F4",
  ink: "000000",
  paper: "FFFFFF",
  brand: "FF6200",
  blue: "0131FF",
  sun: "FFCC00",
  navy: "000D3C",
  muted: "4C4C4C",
  line: "E3E5E8",
  soft: "CFD1D3",
  track: "262626",
} as const;
const FONT = "Poppins";
const W = 13.333;
const H = 7.5;
const M = 0.45;

const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

const pct = (value: number | null | undefined) => (value == null ? "–" : `${Math.round(value * 100)}%`);
const score = (value: number | null | undefined) => (value == null ? "–" : String(Math.round(value * 100)));
const decimal = (value: number | null | undefined) => (value == null ? "–" : value.toFixed(1).replace(".", ","));
const day = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Corta um texto longo para caber no espaço do slide. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Divide uma lista em páginas de tamanho fixo. */
function pages<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function card(slide: Slide, x: number, y: number, w: number, h: number, color: string) {
  slide.addShape("roundRect", { x, y, w, h, fill: { color }, line: { color, width: 0 }, rectRadius: 0.24 });
}

function text(slide: Slide, value: string, x: number, y: number, w: number, h: number, options: TextOptions = {}) {
  slide.addText(value, { x, y, w, h, fontFace: FONT, fontSize: 12, color: C.ink, margin: 0, valign: "top", ...options });
}

function bullets(slide: Slide, items: string[], x: number, y: number, w: number, h: number, options: TextOptions = {}) {
  if (items.length === 0) return;
  slide.addText(
    items.map((item) => ({ text: item, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 6 } })),
    { x, y, w, h, fontFace: FONT, fontSize: 12, color: C.ink, margin: 0, valign: "top", ...options },
  );
}

/** Etiqueta em forma de pílula. */
function pill(slide: Slide, label: string, x: number, y: number, w: number, fill: string, color: string) {
  slide.addShape("roundRect", { x, y, w, h: 0.3, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.15 });
  text(slide, label, x, y, w, 0.3, { fontSize: 9, bold: true, color, align: "center", valign: "middle" });
}

/** Anel de pontuação de 0 a 100 com o número no centro. */
function ring(
  pptx: PptxGenJS,
  slide: Slide,
  value: number | null | undefined,
  x: number,
  y: number,
  size: number,
  colors: { fill: string; track: string; number: string; caption: string },
) {
  const filled = value == null ? 0 : Math.round(Math.min(Math.max(value, 0), 1) * 100);
  slide.addChart(pptx.ChartType.doughnut, [{ name: "Pontuação", labels: ["Pontuação", "Restante"], values: [filled, 100 - filled] }], {
    x,
    y,
    w: size,
    h: size,
    holeSize: 78,
    chartColors: [colors.fill, colors.track],
    showLegend: false,
    showTitle: false,
    showPercent: false,
    showValue: false,
    showLabel: false,
    dataBorder: { pt: 0, color: colors.track },
  });
  text(slide, value == null ? "–" : String(filled), x, y + size * 0.3, size, size * 0.3, {
    fontSize: Math.round(size * 15),
    bold: true,
    color: colors.number,
    align: "center",
    valign: "middle",
  });
  text(slide, value == null ? "sem base" : "de 100", x, y + size * 0.6, size, 0.3, {
    fontSize: 10,
    color: colors.caption,
    align: "center",
  });
}

type Context = { pptx: PptxGenJS; data: ReportData; page: number };

/** Slide de conteúdo, com fundo, logo, título e rodapé padrão. */
function contentSlide(context: Context, title: string, subtitle?: string): Slide {
  const slide = context.pptx.addSlide();
  context.page += 1;
  slide.background = { color: C.ground };
  slide.addImage({ data: LOGO_COLOR, x: M, y: 0.32, w: 0.95, h: 0.586 });
  text(slide, title, M + 1.2, 0.3, W - M * 2 - 1.2, 0.5, { fontSize: 24, bold: true, valign: "middle" });
  if (subtitle) text(slide, subtitle, M + 1.2, 0.8, W - M * 2 - 1.2, 0.3, { fontSize: 11, color: C.muted });
  text(slide, `${context.data.client.name} · rodada de ${shortDay(context.data.run.createdAt)}`, M, H - 0.36, 6, 0.22, {
    fontSize: 9,
    color: C.muted,
  });
  text(slide, `BrandVista by Wyse · ${context.page}`, W - M - 4, H - 0.36, 4, 0.22, { fontSize: 9, color: C.muted, align: "right" });
  return slide;
}

const TOP = 1.3;
const BODY_H = H - TOP - 0.55;

/** Cartão de indicador: nome, número grande e a base do número. */
function metric(slide: Slide, x: number, y: number, w: number, h: number, name: string, value: string, note: string, tone: "paper" | "ink" = "paper") {
  const dark = tone === "ink";
  card(slide, x, y, w, h, dark ? C.ink : C.paper);
  text(slide, name, x + 0.3, y + 0.25, w - 0.6, 0.3, { fontSize: 12, bold: true, color: dark ? C.paper : C.ink });
  text(slide, value, x + 0.3, y + 0.6, w - 0.6, 0.9, { fontSize: 44, bold: true, color: dark ? C.paper : C.ink, valign: "middle" });
  text(slide, clip(note, 150), x + 0.3, y + 1.55, w - 0.6, h - 1.75, { fontSize: 10, color: dark ? C.soft : C.muted });
}

function change(data: ReportData, name: string): string {
  const now = data.indicators[name]?.value;
  const before = data.previous?.[name];
  if (now == null || before == null) return "";
  const points = Math.round((now - before) * 100);
  if (points === 0) return "Igual à rodada anterior";
  return `${points > 0 ? "+" : "−"}${Math.abs(points)} ${Math.abs(points) === 1 ? "ponto" : "pontos"} contra a rodada anterior`;
}

/** Tabela simples sobre um cartão branco. `widths` em polegadas. */
function table(
  slide: Slide,
  x: number,
  y: number,
  widths: number[],
  header: string[],
  rows: string[][],
  rowH: number,
  boldFirstRowIf?: (row: string[], index: number) => boolean,
) {
  const w = widths.reduce((sum, value) => sum + value, 0);
  card(slide, x, y, w + 0.6, 0.55 + rows.length * rowH + 0.25, C.paper);
  let cx = x + 0.3;
  header.forEach((label, index) => {
    text(slide, label, cx, y + 0.2, widths[index] - 0.15, 0.3, { fontSize: 9, bold: true, color: C.muted, valign: "middle" });
    cx += widths[index];
  });
  rows.forEach((row, r) => {
    const ry = y + 0.55 + r * rowH;
    slide.addShape("line", { x: x + 0.3, y: ry, w, h: 0, line: { color: C.line, width: 0.75 } });
    let rx = x + 0.3;
    const strong = boldFirstRowIf?.(row, r) ?? false;
    row.forEach((cell, index) => {
      text(slide, cell, rx, ry + 0.06, widths[index] - 0.15, rowH - 0.12, { fontSize: 10, bold: strong, valign: "middle" });
      rx += widths[index];
    });
  });
}

/**
 * Monta o relatório em PowerPoint a partir dos dados guardados da rodada, da
 * auditoria do site e do diagnóstico. Devolve o arquivo .pptx em memória.
 */
export async function buildReportPptx(data: ReportData, audit: SiteAudit | null, content: ReportContent): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `Relatório BrandVista — ${data.client.name}`;
  pptx.company = "Wyse Brand Intelligence";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const context: Context = { pptx, data, page: 1 };
  const ind = (name: string) => data.indicators[name]?.value;
  const base = (name: string) => data.indicators[name];

  // 1. Capa
  {
    const slide = pptx.addSlide();
    slide.background = { color: C.ground };
    card(slide, M, M, 7.6, H - M * 2, C.brand);
    slide.addImage({ data: LOGO_ON_COLOR, x: M + 0.5, y: M + 0.5, w: 1.7, h: 0.995 });
    text(slide, "Relatório de Brand Legibility", M + 0.5, 2.5, 6.6, 0.5, { fontSize: 18, bold: true });
    text(slide, clip(data.client.name, 60), M + 0.5, 3.0, 6.6, 2.0, { fontSize: 48, bold: true, valign: "top" });
    text(slide, "Como as IAs enxergam a marca, e o que fazer a respeito.", M + 0.5, 5.6, 6.6, 0.4, { fontSize: 14 });
    text(slide, "by Wyse Brand Intelligence", M + 0.5, H - M - 0.7, 6.6, 0.3, { fontSize: 11, bold: true });

    card(slide, M + 7.8, M, W - M * 2 - 7.8, 3.15, C.ink);
    text(slide, "Rodada", M + 8.15, M + 0.35, 4, 0.3, { fontSize: 11, color: C.soft });
    text(slide, day(data.run.createdAt), M + 8.15, M + 0.7, 3.9, 0.9, { fontSize: 22, bold: true, color: C.paper });
    text(
      slide,
      `${data.run.kind === "teste" ? "Rodada de teste" : "Rodada completa"} · ${data.run.responses} respostas analisadas · ${data.run.engines.map(engineLabel).join(", ")}`,
      M + 8.15,
      M + 1.75,
      3.9,
      1.0,
      { fontSize: 11, color: C.soft },
    );
    card(slide, M + 7.8, M + 3.35, W - M * 2 - 7.8, H - M * 2 - 3.35, C.paper);
    text(slide, "Categoria", M + 8.15, M + 3.7, 4.3, 0.3, { fontSize: 11, color: C.muted });
    text(slide, clip(data.client.category ?? "Não informada", 110), M + 8.15, M + 4.05, 3.9, 1.3, { fontSize: 16, bold: true });
    text(slide, data.client.domain ?? "", M + 8.15, H - M - 0.7, 4.3, 0.3, { fontSize: 11, color: C.muted });
  }

  // 2. Resumo executivo
  {
    const slide = contentSlide(context, "Resumo executivo");
    card(slide, M, TOP, 3.9, BODY_H, C.ink);
    pill(slide, "BRAND LEGIBILITY", M + 0.3, TOP + 0.3, 1.9, C.brand, C.ink);
    text(slide, "Semantic Equity Index", M + 0.3, TOP + 0.7, 3.3, 0.3, { fontSize: 10, color: C.soft });
    ring(pptx, slide, ind("sei"), M + 0.75, TOP + 1.05, 2.4, { fill: C.brand, track: C.track, number: C.paper, caption: C.soft });
    text(slide, change(data, "sei"), M + 0.3, TOP + 3.55, 3.3, 0.3, { fontSize: 10, color: C.soft, align: "center" });
    text(slide, `Brand Visibility  ${score(ind("brand_visibility"))}`, M + 0.3, TOP + 4.1, 3.3, 0.3, { fontSize: 13, bold: true, color: C.paper });
    text(slide, change(data, "brand_visibility"), M + 0.3, TOP + 4.4, 3.3, 0.25, { fontSize: 9, color: C.soft });
    text(slide, `Brand Understanding  ${score(ind("brand_understanding"))}`, M + 0.3, TOP + 4.75, 3.3, 0.3, { fontSize: 13, bold: true, color: C.paper });
    text(slide, change(data, "brand_understanding"), M + 0.3, TOP + 5.05, 3.3, 0.25, { fontSize: 9, color: C.soft });

    const x = M + 4.1;
    const w = W - M - x;
    card(slide, x, TOP, w, 1.75, C.sun);
    text(slide, clip(content.headline, 230), x + 0.35, TOP + 0.25, w - 0.7, 1.25, { fontSize: 18, bold: true, valign: "middle" });
    card(slide, x, TOP + 1.95, w, BODY_H - 1.95, C.paper);
    bullets(slide, content.summary.map((item) => clip(item, 260)), x + 0.35, TOP + 2.25, w - 0.7, BODY_H - 2.5, { fontSize: 12.5 });
  }

  // 3. Brand Visibility
  {
    const slide = contentSlide(context, "Brand Visibility: a marca aparece?", "Medido só nas perguntas sobre o mercado, que não citam a marca.");
    card(slide, M, TOP, 3.4, BODY_H, C.brand);
    text(slide, "Brand Visibility", M + 0.3, TOP + 0.3, 2.8, 0.3, { fontSize: 13, bold: true });
    ring(pptx, slide, ind("brand_visibility"), M + 0.5, TOP + 0.9, 2.4, { fill: C.ink, track: "D95300", number: C.ink, caption: C.ink });
    text(slide, change(data, "brand_visibility"), M + 0.3, TOP + 3.5, 2.8, 0.5, { fontSize: 10, align: "center" });
    const x = M + 3.6;
    const w = (W - M - x - 0.2) / 2;
    const h = (BODY_H - 0.2) / 2;
    const presence = base("citation_presence");
    const erasure = base("erasure_rate");
    metric(slide, x, TOP, w, h, "Citation Presence", pct(presence?.value), presence ? `A marca aparece em ${presence.numerator} de ${presence.denominator} respostas.` : "Sem base nesta rodada.");
    metric(slide, x + w + 0.2, TOP, w, h, "Erasure Rate", pct(erasure?.value), erasure ? `${erasure.numerator} de ${erasure.denominator} respostas citam outras marcas, mas não a sua. Quanto menor, melhor.` : "Sem base nesta rodada.", "ink");
    metric(slide, x, TOP + h + 0.2, w, h, "Mention Position", ind("mean_position") == null ? "–" : `${decimal(ind("mean_position"))}ª`, "Posição média entre as marcas citadas, quando a marca aparece.");
    metric(
      slide,
      x + w + 0.2,
      TOP + h + 0.2,
      w,
      h,
      "Sentiment",
      ind("sentiment_positive") == null ? "–" : pct(ind("sentiment_positive")),
      ind("sentiment_positive") == null
        ? "Sem base nesta rodada."
        : `das respostas que citam a marca são positivas; ${pct(ind("sentiment_neutral"))} neutras e ${pct(ind("sentiment_negative"))} negativas.`,
    );
  }

  // 4. Brand Understanding
  {
    const slide = contentSlide(context, "Brand Understanding: a marca é entendida?", "Medido nas perguntas que citam a marca.");
    card(slide, M, TOP, 3.4, BODY_H, C.blue);
    text(slide, "Brand Understanding", M + 0.3, TOP + 0.3, 2.8, 0.3, { fontSize: 13, bold: true, color: C.paper });
    ring(pptx, slide, ind("brand_understanding"), M + 0.5, TOP + 0.9, 2.4, { fill: C.paper, track: "4D6EFF", number: C.paper, caption: C.paper });
    text(slide, change(data, "brand_understanding"), M + 0.3, TOP + 3.5, 2.8, 0.5, { fontSize: 10, align: "center", color: C.paper });
    const x = M + 3.6;
    const w = (W - M - x - 0.2) / 2;
    const h = (BODY_H - 0.2) / 2;
    const risk = base("hallucination_risk");
    metric(slide, x, TOP, w, h, "Reconhecimento de entidade", pct(ind("entity_recognition")), ind("entity_recognition") == null ? "Sem perguntas do tipo Reconhecimento." : "das respostas descrevem a marca corretamente, sem consultar a web.");
    metric(slide, x + w + 0.2, TOP, w, h, "Associação de atributos", pct(ind("attribute_association")), ind("attribute_association") == null ? "Sem perguntas do tipo Associação ou sem atributos cadastrados." : "do peso dos atributos desejados é associado à marca, sem consultar a web.");
    metric(slide, x, TOP + h + 0.2, w, h, "Brand Alignment", pct(ind("brand_alignment")), ind("brand_alignment") == null ? "Sem perguntas do tipo Sobre a marca ou sem atributos cadastrados." : "dos atributos desejados são reproduzidos quando a IA pode pesquisar.");
    metric(slide, x + w + 0.2, TOP + h + 0.2, w, h, "Hallucination Risk", pct(risk?.value), risk ? `${risk.numerator} de ${risk.denominator} afirmações conferidas contradizem um fato cadastrado. Quanto menor, melhor.` : "Nenhuma afirmação pôde ser conferida com os fatos cadastrados.", "ink");
  }

  // 5. Por motor
  if (data.engines.length > 0) {
    const slide = contentSlide(context, "Como cada IA trata a marca", "Cada motor é medido só com as próprias respostas. SEI, Visibility e Understanding vão de 0 a 100.");
    table(
      slide,
      M,
      TOP,
      [2.6, 1.4, 1.6, 2.0, 1.5, 1.4, 1.3],
      ["Motor", "SEI", "Visibility", "Understanding", "Presença", "Erasure", "Posição"],
      data.engines.map((item) => [
        engineLabel(item.engine),
        score(item.indicators.sei),
        score(item.indicators.brand_visibility),
        score(item.indicators.brand_understanding),
        pct(item.indicators.citation_presence),
        pct(item.indicators.erasure_rate),
        item.indicators.mean_position == null ? "–" : `${decimal(item.indicators.mean_position)}ª`,
      ]),
      0.55,
    );
  }

  // 6. Benchmark
  if (data.benchmark.openResponses > 0) {
    const slide = contentSlide(context, "Benchmark: a marca em relação ao mercado", `Presença em ${data.benchmark.openResponses} respostas a perguntas sobre o mercado.`);
    const entries = data.benchmark.entries.slice(0, 8);
    const rank = data.benchmark.entries.findIndex((entry) => entry.isBrand) + 1;
    card(slide, M, TOP, 7.4, BODY_H, C.paper);
    text(slide, "Presença nas respostas", M + 0.3, TOP + 0.25, 6.8, 0.3, { fontSize: 12, bold: true });
    // Do maior para o menor, de cima para baixo: o gráfico de barras lista de baixo para cima.
    const ordered = [...entries].reverse();
    slide.addChart(pptx.ChartType.bar, [{ name: "Presença", labels: ordered.map((entry) => clip(entry.name, 26)), values: ordered.map((entry) => Math.round((entry.presence ?? 0) * 100)) }], {
      x: M + 0.2,
      y: TOP + 0.6,
      w: 7.0,
      h: BODY_H - 0.8,
      barDir: "bar",
      chartColors: ordered.map((entry) => (entry.isBrand ? C.brand : C.ink)),
      chartColorsOpacity: 100,
      barGapWidthPct: 60,
      showLegend: false,
      showTitle: false,
      showValue: true,
      dataLabelFormatCode: '0"%"',
      dataLabelFontFace: FONT,
      dataLabelFontSize: 10,
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 10,
      valAxisHidden: true,
      valAxisMaxVal: 100,
      valAxisMinVal: 0,
      valGridLine: { style: "none" },
    });
    const x = M + 7.6;
    const w = W - M - x;
    card(slide, x, TOP, w, 2.2, C.ink);
    text(slide, entries.length > 1 ? `${rank}º` : "–", x + 0.3, TOP + 0.25, w - 0.6, 1.0, { fontSize: 54, bold: true, color: C.paper, valign: "middle" });
    text(slide, entries.length > 1 ? `lugar em presença entre ${data.benchmark.entries.length} marcas comparadas` : "Nenhum concorrente cadastrado para comparar", x + 0.3, TOP + 1.35, w - 0.6, 0.7, { fontSize: 12, color: C.soft });
    card(slide, x, TOP + 2.4, w, BODY_H - 2.4, C.paper);
    text(slide, "Outras marcas citadas pelas IAs", x + 0.3, TOP + 2.65, w - 0.6, 0.3, { fontSize: 12, bold: true });
    text(
      slide,
      data.benchmark.others.length === 0 ? "Nenhuma além das cadastradas." : clip(data.benchmark.others.map((other) => `${other.name} (${other.cited})`).join(" · "), 330),
      x + 0.3,
      TOP + 3.05,
      w - 0.6,
      BODY_H - 3.3,
      { fontSize: 11, color: C.muted },
    );
  }

  // 7. Evolução
  {
    const points = data.history.filter((point) => point.sei !== null || point.visibility !== null || point.understanding !== null);
    if (points.length >= 2) {
      const slide = contentSlide(context, "Evolução entre rodadas completas", "Pontuação de 0 a 100. Com menos de três rodadas ainda não dá para falar em tendência.");
      card(slide, M, TOP, W - M * 2, BODY_H, C.paper);
      const labels = points.map((point) => shortDay(point.date));
      const serie = (name: string, key: "sei" | "visibility" | "understanding") => ({
        name,
        labels,
        values: points.map((point) => (point[key] === null ? 0 : Math.round((point[key] as number) * 100))),
      });
      slide.addChart(pptx.ChartType.line, [serie("Brand Legibility", "sei"), serie("Brand Visibility", "visibility"), serie("Brand Understanding", "understanding")], {
        x: M + 0.2,
        y: TOP + 0.2,
        w: W - M * 2 - 0.4,
        h: BODY_H - 0.4,
        chartColors: [C.ink, C.brand, C.blue],
        lineSize: 2.5,
        lineDataSymbolSize: 8,
        showLegend: true,
        legendPos: "t",
        legendFontFace: FONT,
        legendFontSize: 11,
        showTitle: false,
        valAxisMaxVal: 100,
        valAxisMinVal: 0,
        valAxisLabelFontFace: FONT,
        valAxisLabelFontSize: 10,
        catAxisLabelFontFace: FONT,
        catAxisLabelFontSize: 10,
        valGridLine: { color: C.line, size: 0.75 },
      });
    }
  }

  // 8. Onde a marca some
  {
    const open = data.questions.filter((item) => !item.namesBrand).slice(0, 6);
    if (open.length > 0) {
      const slide = contentSlide(context, "Onde a marca some", "As perguntas sobre o mercado com menor presença, e quem apareceu no lugar.");
      table(
        slide,
        M,
        TOP,
        [5.6, 1.5, 1.7, 3.0],
        ["Pergunta", "Presença", "Respostas", "Quem apareceu no lugar"],
        open.map((item) => [
          clip(item.question, 120),
          pct(item.presence),
          `${item.cited} de ${item.responses}`,
          clip(item.instead.map((other) => other.name).join(", ") || "–", 70),
        ]),
        0.78,
      );
    }
  }

  // 9. Pontos fortes e fracos
  {
    const slide = contentSlide(context, "O que está funcionando e o que não está");
    const w = (W - M * 2 - 0.2) / 2;
    card(slide, M, TOP, w, BODY_H, C.paper);
    pill(slide, "PONTOS FORTES", M + 0.35, TOP + 0.35, 1.7, C.sun, C.ink);
    bullets(slide, content.strengths.map((item) => clip(item, 240)), M + 0.35, TOP + 0.9, w - 0.7, BODY_H - 1.2, { fontSize: 13 });
    card(slide, M + w + 0.2, TOP, w, BODY_H, C.ink);
    pill(slide, "PONTOS FRACOS", M + w + 0.55, TOP + 0.35, 1.7, C.brand, C.ink);
    bullets(slide, content.weaknesses.map((item) => clip(item, 240)), M + w + 0.55, TOP + 0.9, w - 0.7, BODY_H - 1.2, { fontSize: 13, color: C.paper });
  }

  // 10. Lacunas de conteúdo
  pages(content.content_gaps, 3).forEach((group, index, all) => {
    const slide = contentSlide(context, `Lacunas de conteúdo${all.length > 1 ? ` (${index + 1} de ${all.length})` : ""}`, "O que falta as IAs encontrarem sobre a marca, com a evidência da rodada.");
    const h = (BODY_H - 0.4) / 3;
    group.forEach((item, row) => {
      const y = TOP + row * (h + 0.2);
      card(slide, M, y, W - M * 2, h, C.paper);
      pill(slide, `PRIORIDADE ${PRIORITY_LABEL[item.priority].toUpperCase()}`, M + 0.3, y + 0.22, 1.9, item.priority === "alta" ? C.brand : item.priority === "media" ? C.sun : C.line, C.ink);
      text(slide, clip(item.kpi, 60), M + 2.35, y + 0.22, 4.5, 0.3, { fontSize: 9, color: C.muted, valign: "middle" });
      text(slide, clip(item.gap, 210), M + 0.3, y + 0.6, 5.6, h - 0.75, { fontSize: 13, bold: true });
      text(slide, "Evidência", M + 6.2, y + 0.22, 3, 0.3, { fontSize: 9, bold: true, color: C.muted, valign: "middle" });
      text(slide, clip(item.evidence, 330), M + 6.2, y + 0.6, W - M * 2 - 6.5, h - 0.75, { fontSize: 11, color: C.muted });
    });
  });

  // 11. Sugestões de conteúdo
  pages(content.content_ideas, 2).forEach((group, index, all) => {
    const slide = contentSlide(context, `Conteúdos a criar${all.length > 1 ? ` (${index + 1} de ${all.length})` : ""}`, "Artigos, guias e páginas que respondem às perguntas em que a marca some.");
    const w = (W - M * 2 - 0.2) / 2;
    group.forEach((item, column) => {
      const x = M + column * (w + 0.2);
      card(slide, x, TOP, w, BODY_H, C.paper);
      pill(slide, clip(item.format, 22).toUpperCase(), x + 0.35, TOP + 0.3, 2.2, C.blue, C.paper);
      text(slide, clip(item.title, 120), x + 0.35, TOP + 0.75, w - 0.7, 1.05, { fontSize: 17, bold: true });
      text(slide, "Responde à pergunta", x + 0.35, TOP + 1.9, w - 0.7, 0.25, { fontSize: 9, bold: true, color: C.muted });
      text(slide, clip(item.answers, 170), x + 0.35, TOP + 2.15, w - 0.7, 0.6, { fontSize: 11 });
      text(slide, "Roteiro", x + 0.35, TOP + 2.85, w - 0.7, 0.25, { fontSize: 9, bold: true, color: C.muted });
      bullets(slide, item.outline.map((line) => clip(line, 130)), x + 0.35, TOP + 3.1, w - 0.7, BODY_H - 3.85, { fontSize: 11 });
      text(slide, clip(`Indicador que melhora: ${item.kpi}`, 90), x + 0.35, TOP + BODY_H - 0.55, w - 0.7, 0.3, { fontSize: 9, color: C.muted });
    });
  });

  // 12. Erros e correções
  pages(content.corrections, 3).forEach((group, index, all) => {
    const slide = contentSlide(context, `Erros nas respostas e como corrigir${all.length > 1 ? ` (${index + 1} de ${all.length})` : ""}`, `${data.incorrect.length} ${data.incorrect.length === 1 ? "afirmação contradiz" : "afirmações contradizem"} os fatos cadastrados nesta rodada.`);
    const h = (BODY_H - 0.4) / 3;
    const w = (W - M * 2 - 0.2) / 2;
    group.forEach((item, row) => {
      const y = TOP + row * (h + 0.2);
      card(slide, M, y, w, h, C.ink);
      text(slide, "O que as IAs disseram", M + 0.3, y + 0.2, w - 0.6, 0.25, { fontSize: 9, bold: true, color: C.soft });
      text(slide, clip(item.issue, 260), M + 0.3, y + 0.5, w - 0.6, h - 0.65, { fontSize: 12, color: C.paper });
      card(slide, M + w + 0.2, y, w, h, C.paper);
      text(slide, "O que fazer", M + w + 0.5, y + 0.2, w - 0.6, 0.25, { fontSize: 9, bold: true, color: C.muted });
      text(slide, clip(item.action, 260), M + w + 0.5, y + 0.5, w - 0.6, h - 0.65, { fontSize: 12 });
    });
  });

  // 13. Auditoria técnica do site
  {
    const slide = contentSlide(context, "Auditoria técnica do site", audit?.domain ? `O que as IAs encontram ao visitar ${audit.domain}.` : "Domínio não cadastrado em Marca.");
    const w = 5.4;
    card(slide, M, TOP, w, BODY_H, C.paper);
    if (!audit || !audit.domain || !audit.reachable) {
      text(slide, !audit?.domain ? "Cadastre o domínio da marca para que a auditoria seja feita na próxima rodada." : `O site ${audit.domain} não respondeu no momento da auditoria. Os itens não puderam ser conferidos.`, M + 0.35, TOP + 0.35, w - 0.7, 2, { fontSize: 13 });
    } else {
      const blocked = audit.bots.filter((bot) => !bot.allowed).map((bot) => bot.agent);
      const hasOrg = audit.home.schemaTypes.some((type) => /Organization|Corporation|LocalBusiness/i.test(type));
      const checks: [boolean, string, string][] = [
        [audit.llmsTxt, "llms.txt", audit.llmsTxt ? "Publicado" : "Não encontrado"],
        [blocked.length === 0, "Robôs de IA no robots.txt", blocked.length === 0 ? "Todos liberados" : clip(`Bloqueados: ${blocked.join(", ")}`, 60)],
        [audit.sitemap, "Sitemap", audit.sitemap ? "Encontrado" : "Não encontrado"],
        [hasOrg, "Dados estruturados da organização", hasOrg ? clip(audit.home.schemaTypes.join(", "), 60) : audit.home.schemaTypes.length > 0 ? clip(`Só: ${audit.home.schemaTypes.join(", ")}`, 60) : "Nenhum na página inicial"],
        [Boolean(audit.home.title), "Título da página inicial", clip(audit.home.title ?? "Sem título", 60)],
        [Boolean(audit.home.description), "Descrição da página inicial", clip(audit.home.description ?? "Sem descrição", 60)],
        [Boolean(audit.home.lang), "Idioma declarado", audit.home.lang ?? "Não declarado"],
      ];
      const rowH = (BODY_H - 0.5) / checks.length;
      checks.forEach(([ok, name, detail], index) => {
        const y = TOP + 0.25 + index * rowH;
        pill(slide, ok ? "OK" : "FALTA", M + 0.3, y + 0.08, 0.75, ok ? C.sun : C.brand, C.ink);
        text(slide, name, M + 1.2, y, w - 1.5, 0.3, { fontSize: 12, bold: true, valign: "middle" });
        text(slide, detail, M + 1.2, y + 0.3, w - 1.5, rowH - 0.35, { fontSize: 9.5, color: C.muted });
      });
    }
    const x = M + w + 0.2;
    const rw = W - M - x;
    card(slide, x, TOP, rw, BODY_H, C.ink);
    text(slide, "Ações técnicas recomendadas", x + 0.35, TOP + 0.3, rw - 0.7, 0.3, { fontSize: 13, bold: true, color: C.paper });
    const actions = content.technical_actions.slice(0, 5);
    if (actions.length === 0) {
      text(slide, "Nenhuma ação técnica necessária a partir desta auditoria.", x + 0.35, TOP + 0.8, rw - 0.7, 1, { fontSize: 12, color: C.soft });
    }
    const rowH = (BODY_H - 0.9) / Math.max(actions.length, 3);
    actions.forEach((item, index) => {
      const y = TOP + 0.8 + index * rowH;
      text(slide, clip(item.action, 110), x + 0.35, y, rw - 0.7, 0.5, { fontSize: 12, bold: true, color: C.paper });
      text(slide, clip(item.why, 170), x + 0.35, y + 0.5, rw - 0.7, rowH - 0.55, { fontSize: 10, color: C.soft });
    });
  }

  // 14. Fontes e mídia conquistada
  {
    const slide = contentSlide(context, "Onde as IAs buscam informação", `${data.sources.ownDomainResponses} de ${data.sources.withSources} respostas com fontes citam o site da marca.`);
    const domains = data.sources.domains.slice(0, 9);
    table(
      slide,
      M,
      TOP,
      [3.4, 1.2],
      ["Sites mais citados", "Respostas"],
      domains.map((entry) => [clip(`${entry.domain}${entry.owner === "marca" ? " (site da marca)" : entry.owner === "concorrente" ? " (concorrente)" : ""}`, 44), String(entry.responses)]),
      (BODY_H - 0.85) / Math.max(domains.length, 6),
      (row) => row[0].includes("(site da marca)"),
    );
    const x = M + 5.4;
    const w = W - M - x;
    card(slide, x, TOP, w, BODY_H, C.paper);
    text(slide, "Onde buscar presença", x + 0.35, TOP + 0.3, w - 0.7, 0.3, { fontSize: 13, bold: true });
    const targets = content.earned_media.slice(0, 4);
    const rowH = (BODY_H - 0.9) / Math.max(targets.length, 3);
    targets.forEach((item, index) => {
      const y = TOP + 0.8 + index * rowH;
      text(slide, clip(item.target, 60), x + 0.35, y, w - 0.7, 0.3, { fontSize: 12, bold: true });
      text(slide, clip(`${item.action} ${item.why}`, 300), x + 0.35, y + 0.32, w - 0.7, rowH - 0.4, { fontSize: 10.5, color: C.muted });
    });
  }

  // 15. Plano dos próximos 30 dias
  if (content.plan.length > 0) {
    const slide = contentSlide(context, "Plano para os próximos 30 dias", "As ações mais importantes, ligadas aos três pilares da metodologia: Entender, Estruturar e Amplificar.");
    const plan = content.plan.slice(0, 7);
    table(
      slide,
      M,
      TOP,
      [0.6, 7.1, 1.7, 1.2, 1.2],
      ["Nº", "Ação", "Pilar", "Impacto", "Esforço"],
      plan.map((item, index) => [String(index + 1), clip(item.action, 170), item.pillar, PRIORITY_LABEL[item.impact], PRIORITY_LABEL[item.effort]]),
      (BODY_H - 0.85) / Math.max(plan.length, 5),
    );
  }

  // 16. Como ler este relatório
  {
    const slide = contentSlide(context, "Como ler este relatório");
    const w = (W - M * 2 - 0.4) / 3;
    const blocks: [string, string, string][] = [
      [
        "Como medimos",
        C.paper,
        `Cada pergunta foi feita ${data.run.repetitions === 1 ? "uma vez" : `${data.run.repetitions} vezes`} a cada IA, exatamente como um usuário a digitaria, sem nenhuma instrução adicional. Todas as respostas ficam guardadas e cada número pode ser conferido na resposta que o gerou. Cada IA é medida só com as próprias respostas.`,
      ],
      [
        "O que os números dizem",
        C.paper,
        "Brand Visibility mostra o quanto a marca aparece nas respostas das IAs. Brand Legibility vai além: considera também se a marca é compreendida corretamente. Perguntas que citam a marca não contam para a visibilidade, porque a IA quase sempre cita de volta quem foi citado.",
      ],
      [
        "Limites",
        C.sun,
        "As respostas das IAs variam de uma consulta para outra, então pequenas diferenças entre rodadas podem não significar nada. As fórmulas e os pesos são uma proposta da Wyse, ainda sem validação empírica. Os erros apontados dependem dos fatos cadastrados: o que não está cadastrado não pode ser conferido. As recomendações foram escritas com apoio de IA a partir dos dados desta rodada.",
      ],
    ];
    blocks.forEach(([title, color, body], index) => {
      const x = M + index * (w + 0.2);
      card(slide, x, TOP, w, BODY_H, color);
      text(slide, title, x + 0.35, TOP + 0.35, w - 0.7, 0.4, { fontSize: 16, bold: true });
      text(slide, body, x + 0.35, TOP + 0.95, w - 0.7, BODY_H - 1.3, { fontSize: 12, lineSpacingMultiple: 1.15 });
    });
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
