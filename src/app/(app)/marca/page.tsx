import Link from "next/link";
import {
  Flash,
  Notice,
  Pill,
  btnDark,
  btnLight,
  firstParam,
  inputClass,
  labelClass,
} from "@/components/ui";
import { getCurrentClient } from "@/lib/current-client";
import { requireWyse } from "@/lib/session";
import {
  COUNTRIES,
  FACT_KINDS,
  labelOf,
  type Attribute,
  type Client,
  type Competitor,
  type Fact,
} from "@/lib/types";
import { addAttribute, addCompetitor, addFact, removeItem, saveBrand } from "./actions";

export const metadata = { title: "Marca · BrandVista" };

function RemoveButton({ type, id, label, light }: { type: string; id: string; label: string; light?: boolean }) {
  return (
    <form action={removeItem}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Remover ${label}`}
        className={`inline-flex min-h-11 cursor-pointer items-center px-2 text-[13px] font-semibold underline ${light ? "text-paper" : "text-ink"}`}
      >
        Remover
      </button>
    </form>
  );
}

export default async function MarcaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireWyse();
  const erro = firstParam((await searchParams).erro);
  const { current } = await getCurrentClient();

  if (!current) {
    return (
      <Notice tag="Marca" title="Nenhuma empresa cadastrada.">
        <p>
          Cadastre a primeira empresa em{" "}
          <Link href="/controle" className="font-semibold text-ink underline">
            Controle
          </Link>
          . Depois, o Documento-Fonte dela aparece aqui.
        </p>
      </Notice>
    );
  }

  const [clientResult, factsResult, attributesResult, competitorsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("id", current.id)
      .single(),
    supabase.from("brand_facts").select("id, kind, statement").eq("client_id", current.id).order("created_at"),
    supabase.from("brand_attributes").select("id, name, weight").eq("client_id", current.id).order("weight", { ascending: false }),
    supabase.from("competitors").select("id, name, name_variants, domain").eq("client_id", current.id).order("name"),
  ]);

  const client = clientResult.data as Client | null;
  const facts = (factsResult.data ?? []) as Fact[];
  const attributes = (attributesResult.data ?? []) as Attribute[];
  const competitors = (competitorsResult.data ?? []) as Competitor[];

  if (!client) {
    return (
      <Notice tag="Marca" title="Não foi possível carregar a empresa.">
        <p>Recarregue a página. Se o problema continuar, selecione a empresa de novo no topo.</p>
      </Notice>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <Flash message={erro} />
      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[5_1_380px] flex-col gap-4 rounded-card bg-paper p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Documento-Fonte da Marca</h1>
            <span className="text-[13px] text-muted">Versão {client.source_version}</span>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            É o gabarito da medição. O que a IA diz sobre a marca é comparado com
            o que está aqui.
          </p>
          <form action={saveBrand} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b-name" className={labelClass}>
                Nome da marca
              </label>
              <input id="b-name" name="name" required defaultValue={client.name} className={inputClass} />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5">
                <label htmlFor="b-domain" className={labelClass}>
                  Domínio
                </label>
                <input id="b-domain" name="domain" defaultValue={client.domain ?? ""} placeholder="empresa.com.br" className={inputClass} />
              </div>
              <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5">
                <label htmlFor="b-category" className={labelClass}>
                  Categoria
                </label>
                <input id="b-category" name="category" defaultValue={client.category ?? ""} className={inputClass} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b-country" className={labelClass}>
                País (mercado)
              </label>
              <select
                id="b-country"
                name="country"
                defaultValue={client.country ?? "BR"}
                aria-describedby="b-country-help"
                className={inputClass}
              >
                {COUNTRIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span id="b-country-help" className="text-xs text-muted">
                Enviado aos motores como localização do usuário. O texto das perguntas
                não é alterado. O Gemini não aceita esse parâmetro.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b-variants" className={labelClass}>
                Variações do nome
              </label>
              <input
                id="b-variants"
                name="name_variants"
                defaultValue={client.name_variants.join(", ")}
                aria-describedby="b-variants-help"
                className={inputClass}
              />
              <span id="b-variants-help" className="text-xs text-muted">
                Separe por vírgula. Usadas para encontrar menções à marca nas respostas.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b-description" className={labelClass}>
                Descrição canônica
              </label>
              <textarea
                id="b-description"
                name="canonical_description"
                rows={6}
                defaultValue={client.canonical_description ?? ""}
                className={`${inputClass} py-3.5 leading-relaxed`}
              />
            </div>
            <button type="submit" className={`${btnDark} min-h-12 self-start px-6`}>
              Salvar
            </button>
          </form>
        </section>

        <div className="flex min-w-0 flex-[7_1_480px] flex-col gap-4">
          <section className="flex flex-col gap-3.5 rounded-card bg-ink p-7 text-paper">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Fatos verificáveis</h2>
              <Pill tone="brand">{facts.length}</Pill>
            </div>
            <p className="text-sm leading-relaxed text-[#e3e5e8]">
              Cada afirmação da IA sobre a marca é conferida contra esta lista. É a
              base do Hallucination Risk.
            </p>
            {facts.map((fact) => (
              <div key={fact.id} className="flex flex-wrap items-center gap-3 border-t border-[#3b3b3b] pt-3">
                <Pill>{labelOf(FACT_KINDS, fact.kind)}</Pill>
                <span className="min-w-0 flex-[1_1_200px] text-sm">{fact.statement}</span>
                <RemoveButton type="fact" id={fact.id} label={fact.statement} light />
              </div>
            ))}
            <form action={addFact} className="flex flex-wrap items-end gap-3 border-t border-[#3b3b3b] pt-4">
              <div className="flex w-[170px] flex-col gap-1.5">
                <label htmlFor="f-kind" className={labelClass}>
                  Tipo
                </label>
                <select id="f-kind" name="kind" className={inputClass}>
                  {FACT_KINDS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
                <label htmlFor="f-statement" className={labelClass}>
                  Fato
                </label>
                <input id="f-statement" name="statement" required className={inputClass} />
              </div>
              <button type="submit" className={`${btnLight} min-h-12`}>
                Adicionar fato
              </button>
            </form>
          </section>

          <div className="flex flex-wrap gap-4">
            <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-3 rounded-card bg-blue p-7 text-paper">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Atributos desejados</h2>
                <span className="text-[32px] leading-none font-semibold">{attributes.length}</span>
              </div>
              {attributes.map((attribute) => (
                <div key={attribute.id} className="flex items-center justify-between gap-3 border-t border-[#5c7bff] pt-2.5 text-sm">
                  <span className="min-w-0 flex-1">{attribute.name}</span>
                  <span className="font-semibold">Peso {attribute.weight}</span>
                  <RemoveButton type="attribute" id={attribute.id} label={attribute.name} light />
                </div>
              ))}
              <form action={addAttribute} className="mt-auto flex flex-wrap items-end gap-3 border-t border-[#5c7bff] pt-4">
                <div className="flex min-w-0 flex-[1_1_150px] flex-col gap-1.5">
                  <label htmlFor="a-name" className={labelClass}>
                    Atributo
                  </label>
                  <input id="a-name" name="name" required className={inputClass} />
                </div>
                <div className="flex w-[84px] flex-col gap-1.5">
                  <label htmlFor="a-weight" className={labelClass}>
                    Peso
                  </label>
                  <input id="a-weight" name="weight" type="number" min={1} max={5} defaultValue={1} required className={inputClass} />
                </div>
                <button type="submit" className={`${btnLight} min-h-12`}>
                  Adicionar
                </button>
              </form>
            </section>

            <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-3 rounded-card bg-brand p-7 text-ink">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Concorrentes</h2>
                <span className="text-[32px] leading-none font-semibold">{competitors.length}</span>
              </div>
              {competitors.map((competitor) => (
                <div key={competitor.id} className="flex items-center justify-between gap-3 border-t border-ink pt-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-semibold">{competitor.name}</span>
                  <span>{competitor.domain ?? ""}</span>
                  <RemoveButton type="competitor" id={competitor.id} label={competitor.name} />
                </div>
              ))}
              <form action={addCompetitor} className="mt-auto flex flex-col gap-3 border-t border-ink pt-4">
                <div className="flex flex-wrap gap-3">
                  <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5">
                    <label htmlFor="c-name" className={labelClass}>
                      Nome
                    </label>
                    <input id="c-name" name="name" required className={inputClass} />
                  </div>
                  <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5">
                    <label htmlFor="c-domain" className={labelClass}>
                      Domínio
                    </label>
                    <input id="c-domain" name="domain" className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="c-variants" className={labelClass}>
                    Variações do nome, separadas por vírgula
                  </label>
                  <input id="c-variants" name="name_variants" className={inputClass} />
                </div>
                <button type="submit" className={`${btnDark} min-h-12 self-start`}>
                  Adicionar concorrente
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
