import Link from "next/link";
import { Notice, Pill, firstParam } from "@/components/ui";
import { BLOCK_WEIGHTS } from "@/lib/analysis/indicators";
import { getCurrentClient } from "@/lib/current-client";
import { ENGINES } from "@/lib/engines";
import { getSession } from "@/lib/session";
import { saveSnapshots, type Snapshot } from "@/lib/snapshots";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata = { title: "Painel · BrandVista" };

type Run = { id: string; kind: string; status: string; created_at: string };

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** Abaixo deste número de respostas, o indicador é mostrado com aviso de amostra pequena. */
const SMALL_SAMPLE = 20;

const pct = (value: number) => `${Math.round(value * 100)}%`;
const score = (value: number) => String(Math.round(value * 100));
const decimal = (value: number) => value.toFixed(1).replace(".", ",");

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div aria-hidden="true" className="h-2 rounded-full bg-[#e3e5e8]">
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` }} />
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
  if (getSupabaseEnv() === null) {
    return (
      <Notice tag="Configuração" title="Configuração pendente.">
        <p>
          A aplicação foi publicada, mas ainda não encontrou as variáveis do Supabase. Cadastre
          NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e publique de novo.
        </p>
      </Notice>
    );
  }

  const session = await getSession();
  const { current } = session ? await getCurrentClient() : { current: null };
  if (!session || !current) {
    return (
      <Notice tag="Painel" title="Cadastre a primeira empresa.">
        <p>
          Ainda não há empresas. O cadastro fica em{" "}
          <Link href="/controle" className="font-semibold text-ink underline">
            Controle
          </Link>
          , junto com os limites de perguntas e de frequência.
        </p>
      </Notice>
    );
  }

  const { supabase, role } = session;
  const { data: runsData } = await supabase
    .from("runs")
    .select("id, kind, status, created_at")
    .eq("client_id", current.id)
    .eq("status", "concluida")
    .order("created_at", { ascending: false })
    .limit(12);
  const runs = (runsData ?? []) as Run[];

  // Por padrão, a rodada completa mais recente; sem nenhuma, a rodada mais recente.
  const requested = firstParam((await searchParams).rodada);
  const selected =
    runs.find((run) => run.id === requested) ?? runs.find((run) => run.kind === "completa") ?? runs[0] ?? null;

  let snapshots: Snapshot[] = [];
  if (selected) {
    const { data } = await supabase
      .from("kpi_snapshots")
      .select("engine, indicator, value, numerator, denominator")
      .eq("run_id", selected.id);
    snapshots = ((data ?? []) as Snapshot[]).map((item) => ({ ...item, value: Number(item.value) }));
    // Rodada analisada antes de o cálculo existir: calcula agora, uma vez.
    if (snapshots.length === 0 && role === "wyse") {
      try {
        snapshots = await saveSnapshots(supabase, selected.id);
      } catch (error) {
        console.error("Erro ao calcular os indicadores:", error instanceof Error ? error.message : error);
      }
    }
  }

  if (!selected || snapshots.length === 0) {
    return (
      <Notice tag="Painel" title={`${current.name}: ainda não há rodada analisada.`}>
        <p>
          O painel aparece depois da primeira rodada concluída e analisada. Em{" "}
          <Link href="/perguntas" className="font-semibold text-ink underline">
            Perguntas
          </Link>
          , use &quot;Rodar agora&quot;; a análise começa sozinha ao fim da coleta. Para uma rodada antiga, abra{" "}
          <Link href="/respostas" className="font-semibold text-ink underline">
            Respostas
          </Link>{" "}
          e use &quot;Analisar respostas&quot;.
        </p>
      </Notice>
    );
  }

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
  const ring = 2 * Math.PI * 98;
  const engines = ENGINES.filter((engine) => snapshots.some((item) => item.engine === engine.id));
  const cell = (engine: string, name: string, format: (value: number) => string) => {
    const item = of(engine, name);
    return item ? format(item.value) : "sem base";
  };

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">{current.name}</h1>
          <span className="text-[13px] text-muted">
            {selected.kind === "teste" ? "Rodada de teste" : "Rodada completa"} de{" "}
            {dateFormat.format(new Date(selected.created_at))} · {analyzed} respostas analisadas
          </span>
        </div>
        <nav aria-label="Escolher rodada" className="flex flex-wrap gap-2">
          {runs.slice(0, 6).map((run) => (
            <Link
              key={run.id}
              href={`/?rodada=${run.id}`}
              aria-current={run.id === selected.id ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-[13px] ${
                run.id === selected.id
                  ? "border-ink bg-ink font-semibold text-paper"
                  : "border-[#b3b3b3] bg-paper font-medium text-ink"
              }`}
            >
              {dateFormat.format(new Date(run.created_at))}
              {run.kind === "teste" ? " · teste" : ""}
            </Link>
          ))}
        </nav>
      </div>

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
            <span className="text-[13px] text-[#cfd1d3]">Índice SEI</span>
          </div>
          <div className="relative size-[240px] self-center">
            <svg
              viewBox="0 0 240 240"
              width="240"
              height="240"
              role="img"
              aria-label={sei ? `SEI de ${score(sei.value)} em uma escala de 0 a 100` : "SEI sem base nesta rodada"}
            >
              <circle cx="120" cy="120" r="98" fill="none" stroke="#262626" strokeWidth="20" />
              {sei ? (
                <circle
                  cx="120"
                  cy="120"
                  r="98"
                  fill="none"
                  stroke="#ff6200"
                  strokeWidth="20"
                  strokeLinecap="round"
                  strokeDasharray={`${(ring * sei.value).toFixed(1)} ${(ring * (1 - sei.value)).toFixed(1)}`}
                  transform="rotate(-90 120 120)"
                />
              ) : null}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[72px] leading-none font-semibold tracking-tight">{sei ? score(sei.value) : "–"}</span>
              <span className="mt-1.5 text-[13px] text-[#cfd1d3]">{sei ? "de 100" : "sem base"}</span>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed text-[#e3e5e8]">
            {sei
              ? "O índice combina os dois blocos: se a marca aparece e se é entendida."
              : "O índice precisa dos dois blocos. Falta base em um deles nesta rodada; veja os cartões ao lado."}
          </p>
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
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-2 rounded-card bg-brand p-7 text-ink"
            >
              <span className="text-[15px] font-semibold">Brand Visibility</span>
              <span className="mt-2 text-[96px] leading-none font-semibold tracking-tighter">
                {visibility ? score(visibility.value) : "–"}
              </span>
              <span className="text-[15px] font-medium">
                {visibility ? "de 100. A marca aparece?" : "Sem perguntas que não citam a marca nesta rodada."}
              </span>
            </section>
            <section
              aria-label="Brand Understanding"
              className="flex min-w-0 flex-[1_1_280px] flex-col gap-2 rounded-card bg-blue p-7 text-paper"
            >
              <span className="text-[15px] font-semibold">Brand Understanding</span>
              <span className="mt-2 text-[96px] leading-none font-semibold tracking-tighter">
                {understanding ? score(understanding.value) : "–"}
              </span>
              <span className="text-[15px] font-medium">
                {understanding
                  ? "de 100. A marca é entendida?"
                  : "Sem perguntas de reconhecimento, associação ou sobre a marca nesta rodada."}
              </span>
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
                    ? `${presence.numerator} de ${sample(presence.denominator, "respostas a perguntas que não citam a marca")}`
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
                    ? `${erasure.numerator} de ${sample(erasure.denominator, "respostas que citam outras marcas")}. Quanto menor, melhor`
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

      <p className="flex flex-wrap items-center gap-2 px-1 text-[13px] leading-relaxed text-muted">
        <Pill tone="line">Como ler</Pill>
        As fórmulas e os pesos são uma proposta da Wyse, ainda sem validação empírica. Os indicadores são calculados
        uma vez, ao fim da análise de cada rodada.
      </p>
    </main>
  );
}
