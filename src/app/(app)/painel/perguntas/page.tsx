import { Pill, firstParam } from "@/components/ui";
import { summarizeQuestions } from "@/lib/analysis/breakdowns";
import { getPainel, loadDetailRows } from "@/lib/painel";
import { PROMPT_KINDS, labelOf } from "@/lib/types";
import { PainelEmpty, PainelHeader, decimal, pct } from "../shared";

export const metadata = { title: "Por pergunta · BrandVista" };

export default async function PorPerguntaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const painel = await getPainel(firstParam((await searchParams).rodada));
  if (painel.state !== "ok") return <PainelEmpty painel={painel} />;
  const { supabase, current, selected } = painel;

  const [rows, client] = await Promise.all([
    loadDetailRows(supabase, selected.id),
    supabase.from("clients").select("name, name_variants").eq("id", current.id).maybeSingle(),
  ]);
  const questions = summarizeQuestions(rows, {
    name: client.data?.name ?? current.name,
    variants: (client.data?.name_variants as string[] | null) ?? [],
  });
  const open = questions.filter((item) => !item.namesBrand);
  const branded = questions.filter((item) => item.namesBrand);
  const erased = open.filter((item) => item.cited === 0).length;

  return (
    <main className="flex flex-col gap-4">
      <PainelHeader clientName={current.name} runs={painel.runs} selected={selected} section="/painel/perguntas" analyzed={rows.length} />

      <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Perguntas sobre o mercado: onde a marca aparece e onde some</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            {open.length === 0
              ? "Nenhuma pergunta aberta nesta rodada."
              : `${open.length} ${open.length === 1 ? "pergunta" : "perguntas"}, da menor para a maior presença. Em ${erased} delas a marca não apareceu em nenhuma resposta.`}
          </p>
        </div>
        {open.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Pergunta</th>
                  <th scope="col" className="w-[20%] px-3 py-2.5 font-semibold">Presença</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Posição média</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Consistência por motor</th>
                  <th scope="col" className="py-2.5 pl-3 font-semibold">Quem apareceu no lugar</th>
                </tr>
              </thead>
              <tbody>
                {open.map((item) => (
                  <tr key={item.promptId} className="border-t border-[#e3e5e8] align-top">
                    <th scope="row" className="py-3 pr-3 text-left font-medium">
                      {item.question}
                      <span className="mt-1 block text-xs font-normal text-muted">{labelOf(PROMPT_KINDS, item.kind)}</span>
                    </th>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-[#e3e5e8]">
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round(item.presence * 100)}%` }} />
                        </div>
                        <span className="w-11 text-right font-semibold">{pct(item.presence)}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {item.cited} de {item.responses} respostas
                      </span>
                    </td>
                    <td className="px-3 py-3">{item.meanPosition === null ? "–" : `${decimal(item.meanPosition)}ª`}</td>
                    <td className="px-3 py-3 text-[13px]">
                      {[
                        item.consistency.always > 0 ? `sempre: ${item.consistency.always}` : null,
                        item.consistency.sometimes > 0 ? `às vezes: ${item.consistency.sometimes}` : null,
                        item.consistency.never > 0 ? `nunca: ${item.consistency.never}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td className="py-3 pl-3 text-[13px]">
                      {item.instead.length === 0
                        ? "–"
                        : item.instead.map((other) => `${other.name} (${other.count})`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="text-[13px] leading-relaxed text-muted">
          Consistência por motor: em quantos motores a marca apareceu em todas as repetições da pergunta, só em algumas
          ou em nenhuma. &quot;Quem apareceu no lugar&quot; lista as marcas mais citadas nas respostas em que a sua não
          apareceu, com o número de respostas.
        </p>
      </section>

      {branded.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Perguntas que citam a marca: tom e erros</h2>
            <p className="text-[15px] leading-relaxed text-muted">
              Nestas perguntas a marca é citada quase sempre; o que importa é o que as IAs dizem dela.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Pergunta</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Respostas</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Tom</th>
                  <th scope="col" className="py-2.5 pl-3 font-semibold">Afirmações incorretas</th>
                </tr>
              </thead>
              <tbody>
                {branded.map((item) => (
                  <tr key={item.promptId} className="border-t border-[#e3e5e8] align-top">
                    <th scope="row" className="py-3 pr-3 text-left font-medium">
                      {item.question}
                      <span className="mt-1 block text-xs font-normal text-muted">{labelOf(PROMPT_KINDS, item.kind)}</span>
                    </th>
                    <td className="px-3 py-3">{item.responses}</td>
                    <td className="px-3 py-3 text-[13px]">
                      {item.tone.positivo} positivas · {item.tone.neutro} neutras · {item.tone.negativo} negativas
                    </td>
                    <td className="py-3 pl-3">
                      {item.incorrectClaims > 0 ? <Pill tone="brand">{item.incorrectClaims}</Pill> : "Nenhuma"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
