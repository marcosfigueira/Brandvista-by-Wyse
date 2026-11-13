import { TrendChart } from "@/components/trend-chart";
import { firstParam } from "@/components/ui";
import { getPainel, loadHistory, painelDay } from "@/lib/painel";
import { PainelEmpty, PainelHeader } from "../shared";

export const metadata = { title: "Evolução · BrandVista" };

export default async function EvolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const painel = await getPainel(firstParam((await searchParams).rodada));
  if (painel.state !== "ok") return <PainelEmpty painel={painel} />;

  const history = await loadHistory(painel);
  const labels = history.map((point) => painelDay.format(new Date(point.run.created_at)));
  const changed = history.map((point, index) => {
    const now = point.value("library_fingerprint");
    const before = index > 0 ? history[index - 1].value("library_fingerprint") : null;
    return now !== null && before !== null && now !== before;
  });
  /** Série de um indicador, multiplicada pela escala da tela (100 para pontos e percentuais). */
  const series = (name: string, label: string, color: string, scale = 100) => ({
    name: label,
    color,
    values: history.map((point) => {
      const value = point.value(name);
      return value === null ? null : value * scale;
    }),
    spreads: history.map((point) => {
      const value = point.value(`${name}:spread`);
      return value === null ? null : value * scale;
    }),
  });

  const positions = history.map((point) => point.value("mean_position")).filter((value): value is number => value !== null);
  const worst = Math.max(5, Math.ceil(Math.max(0, ...positions)));

  return (
    <main className="flex flex-col gap-4">
      <PainelHeader
        clientName={painel.current.name}
        runs={painel.runs}
        selected={painel.selected}
        section="/painel/evolucao"
        showRuns={false}
      />

      <section className="flex flex-col gap-2 rounded-card bg-ink p-7 text-paper">
        <h2 className="text-xl font-semibold">Evolução entre rodadas completas</h2>
        <p className="max-w-[80ch] text-[15px] leading-relaxed text-[#e3e5e8]">
          {history.length === 0
            ? "Ainda não há rodadas completas concluídas. Os gráficos aparecem a partir da primeira."
            : history.length < 3
              ? `Há ${history.length === 1 ? "1 rodada completa" : "2 rodadas completas"} até agora. Com menos de três, os gráficos mostram os pontos, mas ainda não dá para falar em tendência.`
              : `${history.length} rodadas completas. A faixa clara em volta de cada linha é a oscilação normal entre repetições da mesma rodada: uma mudança dentro dela pode não significar nada.`}{" "}
          Uma linha tracejada marca a rodada em que as perguntas mudaram; a partir dela, a comparação com as rodadas
          anteriores deixa de ser direta.
        </p>
      </section>

      {history.length > 0 ? (
        <>
          <section className="rounded-card bg-paper p-7">
            <TrendChart
              title="Brand Legibility (Semantic Equity Index), de 0 a 100"
              labels={labels}
              changed={changed}
              format="pontos"
              series={[series("sei", "Brand Legibility", "#ff6200")]}
            />
          </section>

          <section className="rounded-card bg-paper p-7">
            <TrendChart
              title="Os dois blocos do índice, de 0 a 100"
              note="Visibility: a marca aparece. Understanding: a marca é entendida."
              labels={labels}
              changed={changed}
              format="pontos"
              series={[
                series("brand_visibility", "Brand Visibility", "#ff6200"),
                series("brand_understanding", "Brand Understanding", "#0131ff"),
              ]}
            />
          </section>

          <div className="flex flex-wrap gap-4">
            <section className="min-w-0 flex-[1_1_360px] rounded-card bg-paper p-7">
              <TrendChart
                title="Citation Presence"
                note="Em quantas respostas a marca aparece. Quanto maior, melhor."
                labels={labels}
                changed={changed}
                format="percentual"
                series={[series("citation_presence", "Citation Presence", "#ff6200")]}
              />
            </section>
            <section className="min-w-0 flex-[1_1_360px] rounded-card bg-paper p-7">
              <TrendChart
                title="Erasure Rate"
                note="Respostas que citam outras marcas, mas não a sua. Quanto menor, melhor."
                labels={labels}
                changed={changed}
                format="percentual"
                series={[series("erasure_rate", "Erasure Rate", "#000000")]}
              />
            </section>
            <section className="min-w-0 flex-[1_1_360px] rounded-card bg-paper p-7">
              <TrendChart
                title="Mention Position"
                note="Posição média da marca quando é citada. A 1ª fica no topo: quanto mais alto, melhor."
                labels={labels}
                changed={changed}
                format="posicao"
                min={1}
                max={worst}
                inverted
                series={[series("mean_position", "Posição média", "#ff6200", 1)]}
              />
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
