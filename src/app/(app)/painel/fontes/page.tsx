import { Pill, firstParam } from "@/components/ui";
import { summarizeSources } from "@/lib/analysis/breakdowns";
import { getPainel, loadDetailRows } from "@/lib/painel";
import { PainelEmpty, PainelHeader, pct } from "../shared";

export const metadata = { title: "Fontes · BrandVista" };

export default async function FontesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const painel = await getPainel(firstParam((await searchParams).rodada));
  if (painel.state !== "ok") return <PainelEmpty painel={painel} />;
  const { supabase, current, selected } = painel;

  const [rows, client, competitors] = await Promise.all([
    loadDetailRows(supabase, selected.id),
    supabase.from("clients").select("domain").eq("id", current.id).maybeSingle(),
    supabase.from("competitors").select("name, domain").eq("client_id", current.id),
  ]);
  const brandDomain = (client.data?.domain as string | null) ?? null;
  const summary = summarizeSources(
    rows,
    brandDomain,
    (competitors.data ?? []) as { name: string; domain: string | null }[],
  );
  const most = summary.domains[0]?.responses ?? 1;

  return (
    <main className="flex flex-col gap-4">
      <PainelHeader clientName={current.name} runs={painel.runs} selected={selected} section="/painel/fontes" analyzed={rows.length} />

      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 rounded-card bg-brand p-7 text-ink">
          <span className="text-[64px] leading-none font-semibold tracking-tight">
            {summary.withSources > 0 ? pct(summary.ownDomainResponses / summary.withSources) : "–"}
          </span>
          <span className="text-[15px] font-medium">das respostas com fontes citam o site da marca</span>
          <span className="text-[13px]">
            {brandDomain
              ? `${summary.ownDomainResponses} de ${summary.withSources} respostas`
              : "Cadastre o domínio em Marca para medir"}
          </span>
        </section>
        <section className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 rounded-card bg-ink p-7 text-paper">
          <span className="text-[64px] leading-none font-semibold tracking-tight">{summary.withSources}</span>
          <span className="text-[15px] font-medium">respostas citaram ao menos uma fonte</span>
          <span className="text-[13px] text-[#cfd1d3]">
            de {summary.total} analisadas. Perguntas feitas sem busca na web não trazem fontes
          </span>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Sites que as IAs mais citam</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            São os sites que formam as respostas sobre a sua categoria. Aparecer neles, ou ter o próprio site entre eles,
            é o caminho para ser citado.
          </p>
        </div>
        {summary.domains.length === 0 ? (
          <p className="text-[15px] text-muted">Nenhuma fonte foi citada nesta rodada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="w-10 py-2.5 pr-3 font-semibold">Nº</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Site</th>
                  <th scope="col" className="w-[36%] px-3 py-2.5 font-semibold">Respostas que citaram</th>
                  <th scope="col" className="py-2.5 pl-3 font-semibold">Parte das respostas com fontes</th>
                </tr>
              </thead>
              <tbody>
                {summary.domains.map((entry, index) => (
                  <tr key={entry.domain} className={`border-t border-[#e3e5e8] ${entry.owner === "marca" ? "font-semibold" : ""}`}>
                    <td className="py-3 pr-3">{index + 1}</td>
                    <th scope="row" className="px-3 py-3 text-left font-[inherit]">
                      {entry.domain}
                      {entry.owner === "marca" ? (
                        <span className="ml-2 inline-flex align-middle text-xs">
                          <Pill tone="brand">Site da marca</Pill>
                        </span>
                      ) : null}
                      {entry.owner === "concorrente" ? (
                        <span className="ml-2 inline-flex align-middle text-xs">
                          <Pill tone="line">Concorrente: {entry.ownerName}</Pill>
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-[#e3e5e8]">
                          <div
                            className={`h-2 rounded-full ${entry.owner === "marca" ? "bg-brand" : "bg-ink"}`}
                            style={{ width: `${Math.round((entry.responses / most) * 100)}%` }}
                          />
                        </div>
                        <span className="w-9 text-right">{entry.responses}</span>
                      </div>
                    </td>
                    <td className="py-3 pl-3">{pct(entry.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          Alguns motores devolvem links de redirecionamento em vez do endereço final; nesses casos o site pode aparecer
          com o nome do redirecionador. O site de um concorrente só é marcado se o domínio dele estiver cadastrado em
          Marca.
        </p>
      </section>

      {summary.pages.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
          <h2 className="text-xl font-semibold">Páginas mais citadas</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {summary.pages.map((page) => (
              <li key={page.url}>
                <a href={page.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  {page.title ?? page.url}
                </a>
                <span className="text-muted">
                  {" "}
                  · {page.domain} · {page.responses} {page.responses === 1 ? "resposta" : "respostas"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
