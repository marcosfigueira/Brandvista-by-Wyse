import Link from "next/link";
import { Flash, Notice, Pill, firstParam } from "@/components/ui";
import { getCurrentClient } from "@/lib/current-client";
import { ENGINES, engineLabel } from "@/lib/engines";
import type { EngineSource } from "@/lib/engines/types";
import { requireWyse } from "@/lib/session";
import { PROMPT_KINDS, labelOf } from "@/lib/types";

export const metadata = { title: "Respostas · BrandVista" };

type Run = {
  id: string;
  kind: string;
  status: string;
  engines: string[];
  created_at: string;
};

type ResponseRow = {
  id: string;
  engine: string;
  model: string;
  repetition: number;
  search_enabled: boolean;
  search_executed: boolean | null;
  status: string;
  error_message: string | null;
  raw_text: string | null;
  sources: EngineSource[] | null;
  latency_ms: number | null;
  prompts: { text: string; kind: string; version: number } | null;
};

const RUN_STATUS: Record<string, string> = {
  pendente: "Pendente",
  coletando: "Coletando",
  analisando: "Analisando",
  concluida: "Concluída",
  falhou: "Falhou",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function RespostasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireWyse();
  const params = await searchParams;
  const erro = firstParam(params.erro);
  const { current } = await getCurrentClient();

  if (!current) {
    return (
      <Notice tag="Respostas" title="Nenhuma empresa cadastrada.">
        <p>
          Cadastre a primeira empresa em{" "}
          <Link href="/controle" className="font-semibold text-ink underline">
            Controle
          </Link>
          .
        </p>
      </Notice>
    );
  }

  const { data: runsData } = await supabase
    .from("runs")
    .select("id, kind, status, engines, created_at")
    .eq("client_id", current.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const runs = (runsData ?? []) as Run[];

  if (runs.length === 0) {
    return (
      <Notice tag="Respostas" title="Nenhuma rodada ainda.">
        <p>
          Em{" "}
          <Link href="/perguntas" className="font-semibold text-ink underline">
            Perguntas
          </Link>
          , marque até 5 perguntas e use o botão de teste. As respostas brutas do
          motor aparecem aqui, com as fontes citadas.
        </p>
      </Notice>
    );
  }

  const selected = runs.find((run) => run.id === firstParam(params.rodada)) ?? runs[0];

  const { data: responsesData } = await supabase
    .from("responses")
    .select(
      "id, engine, model, repetition, search_enabled, search_executed, status, error_message, raw_text, sources, latency_ms, prompts(text, kind, version)",
    )
    .eq("run_id", selected.id)
    .order("created_at");
  // Agrupa por pergunta e, dentro dela, na ordem fixa dos motores, para
  // comparar lado a lado o que cada motor respondeu à mesma pergunta.
  const engineOrder = new Map<string, number>(ENGINES.map((engine, index) => [engine.id, index]));
  const responses = ((responsesData ?? []) as unknown as ResponseRow[]).sort(
    (a, b) =>
      (a.prompts?.text ?? "").localeCompare(b.prompts?.text ?? "", "pt-BR") ||
      (engineOrder.get(a.engine) ?? 99) - (engineOrder.get(b.engine) ?? 99) ||
      a.repetition - b.repetition,
  );
  const failed = responses.filter((response) => response.status === "erro").length;

  return (
    <main className="flex flex-col gap-4">
      <Flash message={erro} />
      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[3_1_260px] flex-col gap-3 rounded-card bg-ink p-7 text-paper">
          <h1 className="text-xl font-semibold">Rodadas</h1>
          <p className="text-[13px] leading-relaxed text-[#cfd1d3]">
            As 20 mais recentes de {current.name}.
          </p>
          <ul className="flex flex-col">
            {runs.map((run) => {
              const isSelected = run.id === selected.id;
              return (
                <li key={run.id} className="border-t border-[#3b3b3b] first:border-t-0">
                  <Link
                    href={`/respostas?rodada=${run.id}`}
                    aria-current={isSelected ? "true" : undefined}
                    className={`flex min-h-12 flex-wrap items-center justify-between gap-2 py-2.5 text-sm ${
                      isSelected ? "font-semibold text-sun" : "font-medium"
                    }`}
                  >
                    <span>{dateFormat.format(new Date(run.created_at))}</span>
                    <span className="text-[13px]">
                      {run.kind === "teste" ? "Teste" : "Completa"} · {RUN_STATUS[run.status] ?? run.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex min-w-0 flex-[8_1_520px] flex-col gap-4">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-sun p-7 text-ink">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">
                {selected.kind === "teste" ? "Rodada de teste" : "Rodada completa"}
              </h2>
              <span className="text-sm font-medium">
                {dateFormat.format(new Date(selected.created_at))} ·{" "}
                {selected.engines.map(engineLabel).join(", ")}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[40px] leading-none font-semibold tracking-tight">{responses.length}</span>
              <span className="text-[13px] font-medium">
                {responses.length === 1 ? "resposta" : "respostas"}
                {failed > 0 ? `, ${failed} com erro` : ""}
              </span>
            </div>
          </section>

          {responses.length === 0 ? (
            <section className="rounded-card bg-paper p-7 text-[15px] text-muted">
              Esta rodada não tem respostas gravadas.
            </section>
          ) : null}

          {responses.map((response) => {
            // Só viram link as fontes com endereço http ou https.
            const sources = (Array.isArray(response.sources) ? response.sources : []).filter(
              (source) => typeof source?.url === "string" && /^https?:\/\//i.test(source.url),
            );
            const isError = response.status === "erro";
            return (
              <article key={response.id} className="flex flex-col gap-4 rounded-card bg-paper p-7">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Pill tone="ink">{engineLabel(response.engine)}</Pill>
                  {response.prompts ? (
                    <Pill tone="line">{labelOf(PROMPT_KINDS, response.prompts.kind)}</Pill>
                  ) : null}
                  {isError ? (
                    <Pill tone="brand">Erro</Pill>
                  ) : response.search_executed ? (
                    <Pill tone="sun">Busca executada</Pill>
                  ) : (
                    <Pill tone="line">
                      {response.search_enabled ? "Respondeu sem buscar" : "Sem busca, por definição"}
                    </Pill>
                  )}
                  <span className="text-muted">
                    {response.model}
                    {response.latency_ms ? ` · ${(response.latency_ms / 1000).toFixed(1).replace(".", ",")} s` : ""}
                    {response.prompts ? ` · pergunta v${response.prompts.version}` : ""}
                  </span>
                </div>

                <h3 className="text-[17px] leading-snug font-semibold">
                  {response.prompts?.text ?? "Pergunta não encontrada"}
                </h3>

                {isError ? (
                  <p role="alert" className="rounded-[16px] border-2 border-[#b00020] px-4 py-3 text-sm text-[#b00020]">
                    {response.error_message ?? "O motor não respondeu."}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted">Resposta bruta, como o motor devolveu</span>
                    <div className="rounded-[16px] bg-ground px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap">
                      {response.raw_text}
                    </div>
                  </div>
                )}

                {sources.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted">Fontes citadas pelo motor: {sources.length}</span>
                    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                      {sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline"
                          >
                            {source.title ?? source.domain ?? hostOf(source.url)}
                          </a>
                          <span className="text-muted">
                            {" "}
                            · {source.domain ?? hostOf(source.url)}
                            {source.date ? ` · ${source.date}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
