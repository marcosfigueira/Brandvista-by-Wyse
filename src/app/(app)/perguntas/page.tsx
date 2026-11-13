import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Flash, Notice, Pill, btnDark, firstParam } from "@/components/ui";
import { getCurrentClient } from "@/lib/current-client";
import { ENGINES } from "@/lib/engines";
import { requireWyse } from "@/lib/session";
import { PROMPT_KINDS, labelOf, type Prompt } from "@/lib/types";
import { createPrompt, startFullRun, startTestRun, togglePrompt } from "./actions";
import { PromptFields } from "./prompt-fields";

export const metadata = { title: "Perguntas · BrandVista" };

// A rodada de teste consulta o motor e pode levar mais que o padrão.
export const maxDuration = 300;

export default async function PerguntasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireWyse();
  const params = await searchParams;
  const erro = firstParam(params.erro);
  const tipo = firstParam(params.tipo);
  const { current } = await getCurrentClient();

  if (!current) {
    return (
      <Notice tag="Perguntas" title="Nenhuma empresa cadastrada.">
        <p>
          Cadastre a primeira empresa em{" "}
          <Link href="/controle" className="font-semibold text-ink underline">
            Controle
          </Link>
          . Depois, a biblioteca de perguntas dela aparece aqui.
        </p>
      </Notice>
    );
  }

  const [promptsResult, limitResult] = await Promise.all([
    supabase
      .from("prompts")
      .select("id, prompt_key, version, text, kind, persona, journey_stage, search_enabled, active")
      .eq("client_id", current.id)
      .order("created_at"),
    supabase.from("client_limits").select("*").eq("client_id", current.id).maybeSingle(),
  ]);

  // Cada pergunta pode ter várias versões; a lista mostra só a mais recente.
  const latest = new Map<string, Prompt>();
  for (const prompt of (promptsResult.data ?? []) as Prompt[]) {
    const known = latest.get(prompt.prompt_key);
    if (!known || prompt.version > known.version) latest.set(prompt.prompt_key, prompt);
  }
  const all = [...latest.values()];
  const activeCount = all.filter((prompt) => prompt.active).length;
  const max = limitResult.data?.max_prompts ?? 50;
  const visible = tipo ? all.filter((prompt) => prompt.kind === tipo) : all;
  const atLimit = activeCount >= max;
  const repetitions = (limitResult.data as { repetitions?: number } | null)?.repetitions ?? 3;
  const fullCalls = activeCount * ENGINES.length * repetitions;

  const filters = [
    { href: "/perguntas", label: `Todas: ${all.length}`, selected: !tipo },
    ...PROMPT_KINDS.map((kind) => ({
      href: `/perguntas?tipo=${kind.value}`,
      label: `${kind.label}: ${all.filter((prompt) => prompt.kind === kind.value).length}`,
      selected: tipo === kind.value,
    })),
  ];

  return (
    <main className="flex flex-col gap-4">
      <Flash message={erro} />
      <div className="flex flex-wrap items-stretch gap-4">
        <section className="flex min-w-0 flex-[8_1_520px] flex-col gap-4 rounded-card bg-paper p-7">
          <h1 className="text-xl font-semibold">Nova pergunta</h1>
          {atLimit ? (
            <p className="text-[15px] leading-relaxed text-muted">
              O limite de {max} perguntas ativas foi atingido. Pause uma pergunta
              ou aumente o limite em Controle para cadastrar outra.
            </p>
          ) : (
            <form action={createPrompt} className="flex flex-col gap-4">
              <PromptFields />
              <button type="submit" className={`${btnDark} min-h-12 self-start px-6`}>
                Cadastrar pergunta
              </button>
            </form>
          )}
        </section>

        <section className="flex min-w-0 flex-[3_1_260px] flex-col gap-3 rounded-card bg-sun p-7 text-ink">
          <h2 className="text-xl font-semibold">Uso do limite</h2>
          <div className="flex flex-col gap-0.5">
            <span className="text-[64px] leading-none font-semibold tracking-tight">{activeCount}</span>
            <span className="text-sm font-medium">de {max} perguntas ativas</span>
          </div>
          <p className="mt-auto text-[13px] leading-relaxed">
            O limite é definido pela Wyse em Controle e vale para {current.name}.
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <h2 className="text-xl font-semibold">Biblioteca de perguntas</h2>
        <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              key={filter.href}
              href={filter.href}
              aria-current={filter.selected ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4.5 text-[13px] ${
                filter.selected
                  ? "border-ink bg-ink font-semibold text-paper"
                  : "border-[#b3b3b3] bg-paper font-medium text-ink"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <p className="text-[15px] text-muted">
            {all.length === 0
              ? "Nenhuma pergunta cadastrada ainda."
              : "Nenhuma pergunta deste tipo."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Teste</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Pergunta</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Persona</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Etapa</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Busca</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Versão</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Estado</th>
                  <th scope="col" className="py-2.5 pl-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((prompt) => (
                  <tr key={prompt.id} className="border-t border-[#e3e5e8] align-middle">
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        name="prompt"
                        value={prompt.id}
                        form="test-run"
                        disabled={!prompt.active}
                        aria-label={`Incluir no teste: ${prompt.text}`}
                        className="size-5 cursor-pointer accent-[#000000] disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-3 font-medium">{prompt.text}</td>
                    <td className="px-3 py-3">{labelOf(PROMPT_KINDS, prompt.kind)}</td>
                    <td className="px-3 py-3">{prompt.persona ?? ""}</td>
                    <td className="px-3 py-3">{prompt.journey_stage ?? ""}</td>
                    <td className="px-3 py-3">{prompt.search_enabled ? "Ligada" : "Desligada"}</td>
                    <td className="px-3 py-3">v{prompt.version}</td>
                    <td className="px-3 py-3">
                      <Pill tone={prompt.active ? "ink" : "line"}>{prompt.active ? "Ativa" : "Pausada"}</Pill>
                    </td>
                    <td className="py-3 pl-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/perguntas/${prompt.id}`}
                          className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold underline"
                        >
                          Editar
                        </Link>
                        <form action={togglePrompt}>
                          <input type="hidden" name="id" value={prompt.id} />
                          <input type="hidden" name="activate" value={prompt.active ? "false" : "true"} />
                          <button
                            type="submit"
                            className="inline-flex min-h-11 cursor-pointer items-center px-2 text-[13px] font-semibold underline"
                          >
                            {prompt.active ? "Pausar" : "Ativar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {all.some((prompt) => prompt.active) ? (
          <form
            id="test-run"
            action={startTestRun}
            className="flex flex-col gap-3 rounded-[20px] bg-ground px-5 py-4"
          >
            <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <legend className="mb-2 text-[13px] font-semibold">Motores do teste</legend>
              {ENGINES.map((engine) => (
                <label key={engine.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="engine"
                    value={engine.id}
                    defaultChecked
                    className="size-5 cursor-pointer accent-[#000000]"
                  />
                  {engine.label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SubmitButton pendingLabel="Consultando os motores, aguarde…" className={`${btnDark} min-h-12 px-6`}>
                Rodar teste
              </SubmitButton>
              <span className="min-w-0 flex-[1_1_260px] text-[13px] leading-relaxed text-muted">
                Marque até 5 perguntas ativas na coluna Teste. Cada uma é feita uma vez a
                cada motor marcado, e as respostas aparecem em Respostas. Pode levar
                alguns minutos; não feche a página.
              </span>
            </div>
          </form>
        ) : null}
        {activeCount > 0 ? (
          <form action={startFullRun} className="flex flex-col gap-3 rounded-[20px] bg-ink px-5 py-4 text-paper">
            <h3 className="text-[17px] font-semibold">Rodada completa</h3>
            <p className="text-[13px] leading-relaxed text-[#e3e5e8]">
              {activeCount} {activeCount === 1 ? "pergunta ativa" : "perguntas ativas"} × {ENGINES.length} motores ×{" "}
              {repetitions} {repetitions === 1 ? "repetição" : "repetições"} = {fullCalls} consultas pagas aos
              motores. A coleta roda em segundo plano e pode levar de minutos a algumas horas; você pode fechar a
              página e acompanhar em Respostas. As repetições são definidas em Controle.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="confirm" required className="size-5 cursor-pointer accent-[#fd4b23]" />
              Confirmo rodar {fullCalls} consultas para {current.name}.
            </label>
            <SubmitButton
              pendingLabel="Enviando para a fila…"
              className="inline-flex min-h-12 cursor-pointer items-center self-start rounded-full bg-brand px-6 text-sm font-semibold text-ink"
            >
              Rodar agora
            </SubmitButton>
          </form>
        ) : null}
        <p className="text-[13px] leading-relaxed text-muted">
          Editar o texto de uma pergunta cria uma nova versão. A série histórica
          continua comparando a mesma versão entre rodadas.
        </p>
      </section>
    </main>
  );
}
