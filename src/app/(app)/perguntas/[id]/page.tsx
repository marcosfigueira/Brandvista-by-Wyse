import Link from "next/link";
import { Flash, Notice, btnDark, btnOutline, firstParam } from "@/components/ui";
import { requireWyse } from "@/lib/session";
import type { Prompt } from "@/lib/types";
import { revisePrompt } from "../actions";
import { PromptFields } from "../prompt-fields";

export const metadata = { title: "Editar pergunta · BrandVista" };

export default async function EditPromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireWyse();
  const { id } = await params;
  const erro = firstParam((await searchParams).erro);

  const { data } = await supabase
    .from("prompts")
    .select("id, prompt_key, version, text, kind, persona, journey_stage, search_enabled, active")
    .eq("id", id)
    .maybeSingle();
  const prompt = data as Prompt | null;

  if (!prompt) {
    return (
      <Notice tag="Perguntas" title="Pergunta não encontrada.">
        <p>
          Ela pode ter sido substituída por uma versão mais nova.{" "}
          <Link href="/perguntas" className="font-semibold text-ink underline">
            Voltar à biblioteca
          </Link>
          .
        </p>
      </Notice>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <Flash message={erro} />
      <section className="flex max-w-[860px] flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Editar pergunta</h1>
          <span className="text-[13px] text-muted">Versão atual: v{prompt.version}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Se o texto mudar, esta versão é arquivada e uma nova é criada. Mudar só o
          tipo, a persona ou a etapa não cria versão.
        </p>
        <form action={revisePrompt} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={prompt.id} />
          <PromptFields prompt={prompt} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={`${btnDark} min-h-12 px-6`}>
              Salvar
            </button>
            <Link href="/perguntas" className={`${btnOutline} min-h-12 px-6`}>
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
