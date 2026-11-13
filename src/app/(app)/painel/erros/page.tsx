import Link from "next/link";
import { firstParam } from "@/components/ui";
import { listClaims, type ClaimEntry } from "@/lib/analysis/breakdowns";
import { engineLabel } from "@/lib/engines";
import { getPainel, loadDetailRows } from "@/lib/painel";
import { PainelEmpty, PainelHeader } from "../shared";

export const metadata = { title: "Erros · BrandVista" };

/** Quantas afirmações sem fato são listadas, para a tela não ficar longa demais. */
const UNVERIFIED_LIMIT = 40;

function ClaimList({ claims, showFact }: { claims: ClaimEntry[]; showFact: boolean }) {
  return (
    <ul className="flex flex-col">
      {claims.map((claim, index) => (
        <li key={`${claim.responseId}-${index}`} className="flex flex-col gap-1 border-t border-[#e3e5e8] py-3 first:border-t-0">
          <span className="text-[15px] font-medium">{claim.claim}</span>
          {showFact && claim.fact ? <span className="text-sm">Fato cadastrado: {claim.fact}</span> : null}
          <span className="text-[13px] text-muted">
            {engineLabel(claim.engine)} · Pergunta: {claim.question}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function ErrosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const painel = await getPainel(firstParam((await searchParams).rodada));
  if (painel.state !== "ok") return <PainelEmpty painel={painel} />;
  const { supabase, current, selected } = painel;

  const rows = await loadDetailRows(supabase, selected.id);
  const incorrect = listClaims(rows, "incorreta");
  const unverified = listClaims(rows, "nao_verificavel");
  const correct = listClaims(rows, "correta").length;
  const checked = incorrect.length + correct;

  return (
    <main className="flex flex-col gap-4">
      <PainelHeader clientName={current.name} runs={painel.runs} selected={selected} section="/painel/erros" analyzed={rows.length} />

      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 rounded-card bg-ink p-7 text-paper">
          <span className="text-[64px] leading-none font-semibold tracking-tight">{incorrect.length}</span>
          <span className="text-[15px] font-medium">
            {incorrect.length === 1 ? "afirmação incorreta" : "afirmações incorretas"}
          </span>
          <span className="text-[13px] text-[#cfd1d3]">
            {checked === 0 ? "Nenhuma afirmação pôde ser conferida" : `em ${checked} conferidas com os fatos cadastrados`}
          </span>
        </section>
        <section className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 rounded-card bg-sun p-7 text-ink">
          <span className="text-[64px] leading-none font-semibold tracking-tight">{unverified.length}</span>
          <span className="text-[15px] font-medium">sem fato para conferir</span>
          <span className="text-[13px]">Afirmações sobre assuntos que não estão nos fatos cadastrados em Marca</span>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">O que as IAs disseram de errado</h2>
          <Link href={`/respostas?rodada=${selected.id}`} className="text-[13px] font-semibold underline">
            Ver as respostas completas
          </Link>
        </div>
        {incorrect.length === 0 ? (
          <p className="text-[15px] text-muted">
            Nenhuma afirmação contradiz os fatos cadastrados nesta rodada.
            {checked === 0 ? " Atenção: sem fatos cadastrados em Marca, nenhum erro pode ser apontado." : ""}
          </p>
        ) : (
          <ClaimList claims={incorrect} showFact />
        )}
      </section>

      {unverified.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Afirmações sem fato para conferir</h2>
            <Link href="/marca" className="text-[13px] font-semibold underline">
              Cadastrar fatos em Marca
            </Link>
          </div>
          <p className="text-[15px] leading-relaxed text-muted">
            As IAs afirmaram isto sobre a marca e não há fato cadastrado que confirme ou contradiga. As que se repetem
            indicam quais fatos vale cadastrar.
            {unverified.length > UNVERIFIED_LIMIT ? ` Mostrando as primeiras ${UNVERIFIED_LIMIT} de ${unverified.length}.` : ""}
          </p>
          <ClaimList claims={unverified.slice(0, UNVERIFIED_LIMIT)} showFact={false} />
        </section>
      ) : null}
    </main>
  );
}
