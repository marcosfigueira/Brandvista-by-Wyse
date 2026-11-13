import Link from "next/link";
import { Flash, Pill, firstParam } from "@/components/ui";
import { computeBenchmark, type BenchmarkRow } from "@/lib/analysis/benchmark";
import { BLOCK_WEIGHTS } from "@/lib/analysis/indicators";
import { ANALYZER_VERSION, type Analysis } from "@/lib/analysis/types";
import { ENGINES } from "@/lib/engines";
import { getPainel, loadHistory, painelDay } from "@/lib/painel";
import { TrendChart } from "@/components/trend-chart";
import { SubmitButton } from "@/components/submit-button";
import type { ReportContent } from "@/lib/report/types";
import { AutoRefresh } from "./respostas/auto-refresh";
import { requestReport } from "./painel/actions";
import { PainelEmpty, PainelHeader, decimal, pct, score } from "./painel/shared";

export const metadata = { title: "Painel · BrandVista" };

/** Abaixo deste número de respostas, o indicador é mostrado com aviso de amostra pequena. */
const SMALL_SAMPLE = 20;

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div aria-hidden="true" className="h-2 rounded-full bg-[#e3e5e8]">
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` }} />
    </div>
  );
}

/**
 * Anel de pontuação de 0 a 100, com o número no centro. Sem valor, mostra o
 * anel vazio e um traço. As cores vêm de fora para o anel servir em cartões
 * de fundos diferentes.
 */
function Ring({
  value,
  label,
  size,
  track,
  stroke,
  numberClass,
  captionClass,
}: {
  value: number | null;
  label: string;
  size: number;
  track: string;
  stroke: string;
  numberClass: string;
  captionClass: string;
}) {
  const length = 2 * Math.PI * 98;
  const filled = value === null ? 0 : Math.min(Math.max(value, 0), 1);
  return (
    <div className="relative self-center" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 240 240"
        width={size}
        height={size}
        role="img"
        aria-label={value === null ? `${label} sem base nesta rodada` : `${label}: ${score(value)} em uma escala de 0 a 100`}
      >
        <circle cx="120" cy="120" r="98" fill="none" stroke={track} strokeWidth="20" />
        {filled > 0 ? (
          <circle
            cx="120"
            cy="120"
            r="98"
            fill="none"
            stroke={stroke}
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray={`${(length * filled).toFixed(1)} ${(length * (1 - filled)).toFixed(1)}`}
            transform="rotate(-90 120 120)"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`leading-none font-semibold tracking-tight ${numberClass}`}>
          {value === null ? "–" : score(value)}
        </span>
        <span className={`mt-1.5 text-[13px] ${captionClass}`}>{value === null ? "sem base" : "de 100"}</span>
      </div>
    </div>
  );
}

function Metric({
  name,
  display,
  bar,
  tone,
  note,
}: {
  name: string;
  display: string;
  bar: number | null;
  tone: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium">{name}</span>
        <span className="font-semibold">{display}</span>
      </div>
      {bar === null ? null : <Bar value={bar} tone={tone} />}
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const painel = await getPainel(firstParam(query.rodada));
  if (painel.state !== "ok") return <PainelEmpty painel={painel} />;
  const { supabase, role, current, runs, selected, snapshots } = painel;

  // Relatório da rodada. Antes da migração 0008 a consulta falha e nada é mostrado.
  const reportResult = await supabase
    .from("reports")
    .select("status, content, error_message, updated_at")
    .eq("run_id", selected.id)
    .maybeSingle();
  const reportsReady = !reportResult.error;
  const report = reportResult.data as {
    status: "gerando" | "pronto" | "falhou";
    content: ReportContent | null;
    error_message: string | null;
    updated_at: string;
  } | null;

  // Rodadas completas, para a variação e o gráfico de evolução.
  const history = await loadHistory(painel);
  const at = history.findIndex((point) => point.run.id === selected.id);
  const previous = at > 0 ? history[at - 1] : null;
  /** Variação de um indicador contra a rodada completa anterior, em pontos. */
  const change = (name: string) => {
    const now = history[at]?.value(name) ?? null;
    const before = previous?.value(name) ?? null;
    if (now === null || before === null) return null;
    const noise = Math.max(history[at].value(`${name}:spread`) ?? 0, previous?.value(`${name}:spread`) ?? 0);
    const points = Math.round((now - before) * 100);
    return {
      points,
      label: `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points)}`,
      // Sem repetições não há como estimar a oscilação normal.
      beyondNoise: noise > 0 ? Math.abs(now - before) > noise : null,
    };
  };
  const changeNote = (name: string) => {
    const delta = change(name);
    if (!delta) return null;
    if (delta.points === 0) return "Igual à rodada anterior";
    const size = `${delta.label} ${Math.abs(delta.points) === 1 ? "ponto" : "pontos"} contra a rodada anterior`;
    if (delta.beyondNoise === null) return size;
    return delta.beyondNoise ? `${size}, acima da oscilação normal` : `${size}, dentro da oscilação normal`;
  };

  // Benchmark: a marca e os concorrentes nas mesmas respostas da rodada.
  const [benchResponses, clientResult, competitorsResult] = await Promise.all([
    supabase
      .from("responses")
      .select("prompts(text), analyses(analyzer_version, result)")
      .eq("run_id", selected.id)
      .eq("status", "ok"),
    supabase.from("clients").select("name, name_variants").eq("id", current.id).maybeSingle(),
    supabase.from("competitors").select("name, name_variants").eq("client_id", current.id),
  ]);
  const benchRows: BenchmarkRow[] = [];
  for (const row of (benchResponses.data ?? []) as unknown as {
    prompts: { text: string } | null;
    analyses: { analyzer_version: string; result: Analysis }[] | null;
  }[]) {
    const analysis = (row.analyses ?? []).find((item) => item.analyzer_version === ANALYZER_VERSION);
    if (analysis && row.prompts) benchRows.push({ question: row.prompts.text, analysis: analysis.result });
  }
  const benchmark = computeBenchmark(
    benchRows,
    {
      name: clientResult.data?.name ?? current.name,
      variants: (clientResult.data?.name_variants as string[] | null) ?? [],
    },
    ((competitorsResult.data ?? []) as { name: string; name_variants: string[] | null }[]).map((item) => ({
      name: item.name,
      variants: item.name_variants ?? [],
    })),
  );
  const brandRank = benchmark.entries.findIndex((entry) => entry.isBrand) + 1;

  const of = (engine: string | null, name: string) =>
    snapshots.find((item) => item.engine === engine && item.indicator === name) ?? null;
  const all = (name: string) => of(null, name);

  const sei = all("sei");
  const visibility = all("brand_visibility");
  const understanding = all("brand_understanding");
  const presence = all("citation_presence");
  const erasure = all("erasure_rate");
  const meanPosition = all("mean_position");
  const positionScore = all("mention_position");
  const sentiment = all("sentiment");
  const recognition = all("entity_recognition");
  const association = all("attribute_association");
  const alignment = all("brand_alignment");
  const risk = all("hallucination_risk");
  const analyzed = all("responses_analyzed")?.denominator ?? 0;

  const noBase = "Sem base nesta rodada";
  const sample = (count: number | null | undefined, unit: string) =>
    `${count ?? 0} ${unit}${(count ?? 0) < SMALL_SAMPLE ? ". Amostra pequena: leia com cautela" : ""}`;
  const engines = ENGINES.filter((engine) => snapshots.some((item) => item.engine === engine.id));
  const cell = (engine: string, name: string, format: (value: number) => string) => {
    const item = of(engine, name);
    return item ? format(item.value) : "sem base";
  };

  return (
    <main className="flex flex-col gap-4">
      <PainelHeader clientName={current.name} runs={runs} selected={selected} section="/" analyzed={analyzed} />

      <Flash message={firstParam(query.erro)} />

      {reportsReady && (report || role === "wyse") ? (
        <section aria-label="Relatório" className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-sun p-7 text-ink">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
            <h2 className="text-xl font-semibold">Relatório da rodada</h2>
            <p className="text-[15px] leading-relaxed">
              {report?.status === "pronto"
                ? (report.content?.headline ?? "O relatório está pronto.")
                : report?.status === "gerando"
                  ? "O relatório está sendo escrito: auditoria do site, diagnóstico e recomendações. Leva alguns minutos; esta página se atualiza sozinha."
                  : report?.status === "falhou"
                    ? `Não foi possível gerar o relatório. ${report.error_message ?? ""}`
                    : "Diagnóstico, lacunas de conteúdo, sugestões de artigos, auditoria técnica do site e plano de ação, em PowerPoint."}
            </p>
            {report?.status === "gerando" ? <AutoRefresh seconds={20} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {report?.status === "pronto" ? (
              <a
                href={`/relatorio/${selected.id}`}
                className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-paper"
              >
                Baixar relatório (.pptx)
              </a>
            ) : null}
            {role === "wyse" && report?.status !== "gerando" ? (
              <form action={requestReport}>
                <input type="hidden" name="run_id" value={selected.id} />
                <SubmitButton
                  pendingLabel="Enviando para a fila…"
                  className={
                    report?.status === "pronto"
                      ? "inline-flex min-h-12 cursor-pointer items-center rounded-full border-[1.5px] border-ink px-6 text-sm font-semibold"
                      : "inline-flex min-h-12 cursor-pointer items-center rounded-full bg-ink px-6 text-sm font-semibold text-paper"
                  }
                >
                  {report?.status === "pronto" ? "Gerar de novo" : report?.status === "falhou" ? "Tentar de novo" : "Gerar relatório"}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {selected.kind === "teste" ? (
        <p className="rounded-[20px] bg-sun px-5 py-4 text-sm font-medium">
          Esta é uma rodada de teste, com poucas perguntas. Os números servem para conferir o cálculo, não para tirar
          conclusões sobre a marca.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <section
          aria-label="Brand Legibility"
          className="flex min-w-0 flex-[4_1_320px] flex-col gap-5 rounded-card bg-ink p-7 text-paper"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex min-h-[30px] items-center rounded-full bg-brand px-3.5 text-xs font-semibold tracking-wider text-ink uppercase">
              Brand Legibility
            </span>
            <span className="text-[13px] text-[#cfd1d3]">Semantic Equity Index</span>
          </div>
          <Ring
            value={sei?.value ?? null}
            label="SEI"
            size={240}
            track="#262626"
            stroke="#ff6200"
            numberClass="text-[72px]"
            captionClass="text-[#cfd1d3]"
          />
          {changeNote("sei") ? (
            <p className="text-center text-[13px] font-medium text-[#cfd1d3]">{changeNote("sei")}</p>
          ) : null}
          <p className="text-[15px] leading-relaxed text-[#e3e5e8]">
            Brand Visibility mostra o quanto a marca aparece nas respostas das IAs. Brand Legibility vai além:
            considera também se a marca é compreendida corretamente.
          </p>
          {sei ? null : (
            <p className="text-[13px] leading-relaxed text-[#cfd1d3]">
              O índice precisa dos dois blocos, e um deles está sem base nesta rodada.
            </p>
          )}
          <div className="mt-auto flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-full bg-brand" />
                Brand Visibility
              </span>
              <span className="font-semibold">{visibility ? score(visibility.value) : "sem base"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden="true" className="inline-block size-3 rounded-full bg-paper" />
                Brand Understanding
              </span>
              <span className="font-semibold">{understanding ? score(understanding.value) : "sem base"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#3b3b3b] pt-3 text-[13px] text-[#cfd1d3]">
              <span>Peso de cada bloco</span>
              <span>
                {decimal(BLOCK_WEIGHTS.visibility)} e {decimal(BLOCK_WEIGHTS.understanding)}
              </span>
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-[8_1_560px] flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <section
              aria-label="Brand Visibility"
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-card bg-brand p-7 text-ink"
            >
              <span className="text-[15px] font-semibold">Brand Visibility</span>
              <Ring
                value={visibility?.value ?? null}
                label="Brand Visibility"
                size={200}
                track="rgba(0, 0, 0, 0.18)"
                stroke="#000000"
                numberClass="text-[64px]"
                captionClass="text-ink"
              />
              <span className="text-center text-[15px] font-medium">
                {visibility ? "A marca aparece?" : "Sem perguntas que não citam a marca nesta rodada."}
              </span>
              {changeNote("brand_visibility") ? (
                <span className="text-center text-[13px] font-medium">{changeNote("brand_visibility")}</span>
              ) : null}
            </section>
            <section
              aria-label="Brand Understanding"
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-card bg-blue p-7 text-paper"
            >
              <span className="text-[15px] font-semibold">Brand Understanding</span>
              <Ring
                value={understanding?.value ?? null}
                label="Brand Understanding"
                size={200}
                track="rgba(255, 255, 255, 0.28)"
                stroke="#ffffff"
                numberClass="text-[64px]"
                captionClass="text-paper"
              />
              <span className="text-center text-[15px] font-medium">
                {understanding
                  ? "A marca é entendida?"
                  : "Sem perguntas de reconhecimento, associação ou sobre a marca nesta rodada."}
              </span>
              {changeNote("brand_understanding") ? (
                <span className="text-center text-[13px] font-medium">{changeNote("brand_understanding")}</span>
              ) : null}
            </section>
          </div>

          <div className="flex flex-wrap gap-4">
            <section
              aria-label="Indicadores de visibilidade"
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-[18px] rounded-card bg-paper p-7"
            >
              <Metric
                name="Citation Presence"
                display={presence ? pct(presence.value) : "–"}
                bar={presence?.value ?? null}
                tone="bg-brand"
                note={
                  presence
                    ? `${presence.numerator} de ${sample(presence.denominator, "respostas")}`
                    : noBase
                }
              />
              <Metric
                name="Erasure Rate"
                display={erasure ? pct(erasure.value) : "–"}
                bar={erasure?.value ?? null}
                tone="bg-ink"
                note={
                  erasure
                    ? `${erasure.numerator} de ${erasure.denominator} respostas citam outras marcas, mas não a sua. Quanto menor, melhor${(erasure.denominator ?? 0) < SMALL_SAMPLE ? ". Amostra pequena: leia com cautela" : ""}`
                    : noBase
                }
              />
              <Metric
                name="Mention Position"
                display={meanPosition ? `${decimal(meanPosition.value)}ª` : "–"}
                bar={positionScore?.value ?? null}
                tone="bg-brand"
                note={
                  meanPosition
                    ? `Posição média quando citada, em ${sample(meanPosition.denominator, "respostas")}`
                    : "A marca não foi citada em perguntas abertas"
                }
              />
              <Metric
                name="Sentiment"
                display={sentiment ? `${pct(all("sentiment_positive")?.value ?? 0)} positivas` : "–"}
                bar={sentiment?.value ?? null}
                tone="bg-brand"
                note={
                  sentiment
                    ? `${pct(all("sentiment_neutral")?.value ?? 0)} neutras, ${pct(all("sentiment_negative")?.value ?? 0)} negativas, em ${sample(sentiment.denominator, "respostas que citam a marca")}`
                    : noBase
                }
              />
            </section>

            <section
              aria-label="Indicadores de entendimento"
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-[18px] rounded-card bg-paper p-7"
            >
              <Metric
                name="Reconhecimento de entidade"
                display={recognition ? pct(recognition.value) : "–"}
                bar={recognition?.value ?? null}
                tone="bg-blue"
                note={
                  recognition
                    ? `${recognition.numerator} reconhecimentos completos em ${sample(recognition.denominator, "respostas a perguntas de reconhecimento")}`
                    : "Sem perguntas do tipo Reconhecimento"
                }
              />
              <Metric
                name="Associação de atributos"
                display={association ? pct(association.value) : "–"}
                bar={association?.value ?? null}
                tone="bg-blue"
                note={
                  association
                    ? `Peso dos atributos desejados associados, em ${sample(association.denominator, "respostas a perguntas de associação")}`
                    : "Sem perguntas do tipo Associação ou sem atributos cadastrados"
                }
              />
              <Metric
                name="Brand Alignment"
                display={alignment ? pct(alignment.value) : "–"}
                bar={alignment?.value ?? null}
                tone="bg-blue"
                note={
                  alignment
                    ? `Atributos desejados reproduzidos, em ${sample(alignment.denominator, "respostas a perguntas sobre a marca")}`
                    : "Sem perguntas do tipo Sobre a marca ou sem atributos cadastrados"
                }
              />
              <Metric
                name="Hallucination Risk"
                display={risk ? pct(risk.value) : "–"}
                bar={risk?.value ?? null}
                tone="bg-ink"
                note={
                  risk
                    ? `${risk.numerator} de ${risk.denominator} afirmações conferidas contradizem um fato cadastrado. Quanto menor, melhor`
                    : "Nenhuma afirmação pôde ser conferida com os fatos cadastrados em Marca"
                }
              />
            </section>
          </div>
        </div>
      </div>

      {history.length > 0 ? (
        <section aria-label="Evolução" className="flex flex-col gap-4 rounded-card bg-paper p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Evolução do Brand Legibility</h2>
            <Link href={`/painel/evolucao?rodada=${selected.id}`} className="text-[13px] font-semibold underline">
              Ver a evolução de todos os indicadores
            </Link>
          </div>
          <TrendChart
            title="Semantic Equity Index, de 0 a 100, por rodada completa"
            note={
              history.length < 3
                ? "Com menos de três rodadas completas ainda não dá para falar em tendência."
                : "A faixa clara é a oscilação normal entre repetições: mudanças dentro dela podem não significar nada."
            }
            labels={history.map((point) => painelDay.format(new Date(point.run.created_at)))}
            format="pontos"
            series={[
              {
                name: "Brand Legibility",
                color: "#ff6200",
                values: history.map((point) => {
                  const value = point.value("sei");
                  return value === null ? null : value * 100;
                }),
                spreads: history.map((point) => {
                  const value = point.value("sei:spread");
                  return value === null ? null : value * 100;
                }),
              },
            ]}
            changed={history.map((point, index) => {
              const now = point.value("library_fingerprint");
              const before = index > 0 ? history[index - 1].value("library_fingerprint") : null;
              return now !== null && before !== null && now !== before;
            })}
          />
        </section>
      ) : null}

      <section aria-label="Benchmark" className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Benchmark: a marca em relação ao mercado</h2>
          <Link href="/marca" className="text-[13px] font-semibold underline">
            Cadastrar concorrentes em Marca
          </Link>
        </div>
        {benchmark.openResponses === 0 ? (
          <p className="text-[15px] text-muted">
            Sem base nesta rodada: nenhuma pergunta aberta sobre o mercado foi respondida.
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed">
              {benchmark.entries.length > 1
                ? `${current.name} está em ${brandRank}º lugar em presença entre ${benchmark.entries.length} marcas comparadas, em ${benchmark.openResponses} respostas.`
                : "Nenhum concorrente cadastrado. Cadastre os concorrentes em Marca para compará-los; as marcas que as IAs mais citaram estão listadas abaixo."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="w-10 py-2.5 pr-3 font-semibold">Nº</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Marca</th>
                    <th scope="col" className="w-[38%] px-3 py-2.5 font-semibold">Presença nas respostas</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Citada em</th>
                    <th scope="col" className="py-2.5 pl-3 font-semibold">Posição média</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.entries.map((entry, index) => (
                    <tr key={entry.name} className={`border-t border-[#e3e5e8] ${entry.isBrand ? "font-semibold" : ""}`}>
                      <td className="py-3 pr-3">{index + 1}</td>
                      <th scope="row" className="px-3 py-3 text-left font-[inherit]">
                        {entry.name}
                        {entry.isBrand ? (
                          <span className="ml-2 inline-flex align-middle text-xs">
                            <Pill tone="brand">Sua marca</Pill>
                          </span>
                        ) : null}
                      </th>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <Bar value={entry.presence ?? 0} tone={entry.isBrand ? "bg-brand" : "bg-ink"} />
                          </div>
                          <span className="w-11 text-right">{entry.presence === null ? "–" : pct(entry.presence)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {entry.cited} de {entry.total}
                      </td>
                      <td className="py-3 pl-3">{entry.meanPosition === null ? "–" : `${decimal(entry.meanPosition)}ª`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {benchmark.others.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">Outras marcas citadas pelas IAs, ainda não cadastradas</h3>
                <ul className="flex flex-wrap gap-2 text-[13px]">
                  {benchmark.others.map((other) => (
                    <li key={other.name} className="inline-flex min-h-[30px] items-center rounded-full bg-[#e3e5e8] px-3 font-medium">
                      {other.name} · {other.cited}
                    </li>
                  ))}
                </ul>
                <span className="text-xs text-muted">
                  O número é em quantas respostas a marca apareceu. Se alguma for concorrente direta, cadastre em Marca
                  para ela entrar na comparação.
                </span>
              </div>
            ) : null}
            <p className="text-[13px] leading-relaxed text-muted">
              Presença é em quantas respostas a marca aparece. Posição média é a ordem em que ela é citada quando
              aparece: 1ª é a primeira da lista.{benchmark.openResponses < SMALL_SAMPLE ? " Amostra pequena: leia com cautela." : ""}
            </p>
          </>
        )}
      </section>

      {engines.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Por motor</h2>
            <Link href={`/respostas?rodada=${selected.id}`} className="text-[13px] font-semibold underline">
              Ver as respostas e as análises desta rodada
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Motor</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">SEI</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Visibility</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Understanding</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Presença</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Erasure</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Posição média</th>
                  <th scope="col" className="py-2.5 pl-3 font-semibold">Respostas</th>
                </tr>
              </thead>
              <tbody>
                {engines.map((engine) => (
                  <tr key={engine.id} className="border-t border-[#e3e5e8]">
                    <th scope="row" className="py-3 pr-3 text-left font-semibold">{engine.label}</th>
                    <td className="px-3 py-3">{cell(engine.id, "sei", score)}</td>
                    <td className="px-3 py-3">{cell(engine.id, "brand_visibility", score)}</td>
                    <td className="px-3 py-3">{cell(engine.id, "brand_understanding", score)}</td>
                    <td className="px-3 py-3">{cell(engine.id, "citation_presence", pct)}</td>
                    <td className="px-3 py-3">{cell(engine.id, "erasure_rate", pct)}</td>
                    <td className="px-3 py-3">{cell(engine.id, "mean_position", (value) => `${decimal(value)}ª`)}</td>
                    <td className="py-3 pl-3">{of(engine.id, "responses_analyzed")?.denominator ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            Cada motor é medido só com as próprias respostas. SEI, Visibility e Understanding vão de 0 a 100; presença
            e erasure são percentuais das respostas a perguntas que não citam a marca.
          </p>
        </section>
      ) : null}
    </main>
  );
}
