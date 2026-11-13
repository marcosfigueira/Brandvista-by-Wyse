import { Pill } from "@/components/ui";
import type { Analysis } from "@/lib/analysis/types";

const SENTIMENT_LABEL = { positivo: "Tom positivo", neutro: "Tom neutro", negativo: "Tom negativo" } as const;
const RECOGNITION_LABEL = {
  sim: "Reconhece a marca",
  parcial: "Reconhece em parte",
  nao: "Não reconhece a marca",
} as const;
const VERDICT_LABEL = { correta: "Correta", incorreta: "Incorreta", nao_verificavel: "Sem fato para conferir" } as const;

/** O que o analisador extraiu de uma resposta, para conferência à mão. */
export function AnalysisBlock({ analysis, model }: { analysis: Analysis; model: string | null }) {
  const cited = analysis.brand_in_text || analysis.brand_mentioned;
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#e3e5e8] px-5 py-4">
      <span className="text-xs text-muted">Análise{model ? ` · ${model}` : ""}</span>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={cited ? "sun" : "line"}>{cited ? "Marca citada" : "Marca não citada"}</Pill>
        {analysis.brand_position ? <Pill tone="line">Posição {analysis.brand_position}</Pill> : null}
        {analysis.sentiment ? <Pill tone="line">{SENTIMENT_LABEL[analysis.sentiment]}</Pill> : null}
        {analysis.recognition ? <Pill tone="line">{RECOGNITION_LABEL[analysis.recognition]}</Pill> : null}
        {analysis.own_domain_cited ? <Pill tone="line">Site da marca nas fontes</Pill> : null}
        {analysis.question_names_brand ? <Pill tone="ink">Pergunta cita a marca</Pill> : null}
        {analysis.mention_divergence ? <Pill tone="brand">Conferir citação</Pill> : null}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        {analysis.question_names_brand
          ? "Como a pergunta cita a marca, esta resposta não entra em presença, erasure e posição."
          : "A pergunta não cita a marca: esta resposta entra em presença, erasure e posição."}
        {analysis.mention_divergence
          ? " A regra de texto e o analisador discordam sobre a marca ter sido citada."
          : ""}
      </p>
      <dl className="flex flex-col gap-2 text-sm">
        {analysis.brands_in_order.length > 0 ? (
          <div>
            <dt className="text-xs text-muted">Marcas citadas, na ordem</dt>
            <dd>{analysis.brands_in_order.join(" · ")}</dd>
          </div>
        ) : null}
        {analysis.competitors_mentioned.length > 0 ? (
          <div>
            <dt className="text-xs text-muted">Concorrentes cadastrados que aparecem</dt>
            <dd>{analysis.competitors_mentioned.join(" · ")}</dd>
          </div>
        ) : null}
        {analysis.attributes_associated.length > 0 ? (
          <div>
            <dt className="text-xs text-muted">Atributos desejados associados à marca</dt>
            <dd>{analysis.attributes_associated.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
      {analysis.claims.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Afirmações sobre a marca</span>
          <ul className="flex flex-col gap-1.5 text-sm">
            {analysis.claims.map((claim, index) => (
              <li key={index} className="flex flex-col">
                <span>
                  <span className={`font-semibold ${claim.verdict === "incorreta" ? "text-[#b00020]" : ""}`}>
                    {VERDICT_LABEL[claim.verdict]}:
                  </span>{" "}
                  {claim.claim}
                </span>
                {claim.fact ? <span className="text-[13px] text-muted">Fato cadastrado: {claim.fact}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
