import { inputClass, labelClass } from "@/components/ui";
import { JOURNEY_STAGES, PROMPT_KINDS, type Prompt } from "@/lib/types";

/** Campos de uma pergunta, usados no cadastro e na edição. */
export function PromptFields({ prompt }: { prompt?: Prompt }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="p-text" className={labelClass}>
          Pergunta, como o usuário a faria à IA
        </label>
        <textarea
          id="p-text"
          name="text"
          rows={2}
          required
          defaultValue={prompt?.text ?? ""}
          className={`${inputClass} py-3 leading-relaxed`}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
          <label htmlFor="p-kind" className={labelClass}>
            Tipo
          </label>
          <select
            id="p-kind"
            name="kind"
            defaultValue={prompt?.kind ?? "categoria"}
            aria-describedby="p-kind-help"
            className={inputClass}
          >
            {PROMPT_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
                {item.search ? "" : " (sem busca)"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
          <label htmlFor="p-persona" className={labelClass}>
            Persona
          </label>
          <input id="p-persona" name="persona" defaultValue={prompt?.persona ?? ""} className={inputClass} />
        </div>
        <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
          <label htmlFor="p-stage" className={labelClass}>
            Etapa da jornada
          </label>
          <select id="p-stage" name="journey_stage" defaultValue={prompt?.journey_stage ?? ""} className={inputClass}>
            <option value="">Não definida</option>
            {JOURNEY_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p id="p-kind-help" className="text-xs leading-relaxed text-muted">
        O tipo define se a pergunta é feita com busca na web. Reconhecimento e
        Associação rodam sem busca, para medir o que o modelo já sabe da marca.
      </p>
    </>
  );
}
