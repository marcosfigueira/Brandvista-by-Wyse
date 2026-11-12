"use server";

import { revalidatePath } from "next/cache";
import { getCurrentClient } from "@/lib/current-client";
import { dbMessage, fail, field, list, optional } from "@/lib/forms";
import { requireWyse } from "@/lib/session";
import { COUNTRIES, FACT_KINDS } from "@/lib/types";

const PATH = "/marca";

/** Sessão da Wyse mais a empresa selecionada no topo. */
async function context() {
  const { supabase } = await requireWyse();
  const { current } = await getCurrentClient();
  if (!current) fail(PATH, "Selecione ou cadastre uma empresa primeiro.");
  return { supabase, clientId: current.id };
}

/** Salva o Documento-Fonte. A versão sobe quando a descrição muda. */
export async function saveBrand(formData: FormData) {
  const { supabase, clientId } = await context();
  const name = field(formData, "name");
  if (!name) fail(PATH, "Informe o nome da marca.");

  const description = optional(formData, "canonical_description");
  const country = field(formData, "country");
  if (!COUNTRIES.some((item) => item.value === country)) fail(PATH, "País inválido.");

  const { data: before } = await supabase
    .from("clients")
    .select("canonical_description, source_version")
    .eq("id", clientId)
    .single();

  const changed = (before?.canonical_description ?? null) !== description;

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      name_variants: list(formData, "name_variants"),
      domain: optional(formData, "domain"),
      category: optional(formData, "category"),
      country,
      canonical_description: description,
      source_version: (before?.source_version ?? 1) + (changed ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (error) {
    fail(
      PATH,
      dbMessage(
        error,
        "Não foi possível salvar a marca. Confira se o arquivo 0005_pais_da_marca.sql foi executado no Supabase.",
      ),
    );
  }
  revalidatePath("/", "layout");
}

export async function addFact(formData: FormData) {
  const { supabase, clientId } = await context();
  const statement = field(formData, "statement");
  const kind = field(formData, "kind");
  if (!statement) fail(PATH, "Escreva o fato.");
  if (!FACT_KINDS.some((item) => item.value === kind)) fail(PATH, "Tipo de fato inválido.");

  const { error } = await supabase
    .from("brand_facts")
    .insert({ client_id: clientId, kind, statement });
  if (error) fail(PATH, dbMessage(error, "Não foi possível adicionar o fato."));
  revalidatePath(PATH);
}

export async function addAttribute(formData: FormData) {
  const { supabase, clientId } = await context();
  const name = field(formData, "name");
  const weight = Number.parseInt(field(formData, "weight"), 10);
  if (!name) fail(PATH, "Informe o atributo.");
  if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
    fail(PATH, "O peso deve ficar entre 1 e 5.");
  }

  const { error } = await supabase
    .from("brand_attributes")
    .insert({ client_id: clientId, name, weight });
  if (error) fail(PATH, dbMessage(error, "Não foi possível adicionar o atributo."));
  revalidatePath(PATH);
}

export async function addCompetitor(formData: FormData) {
  const { supabase, clientId } = await context();
  const name = field(formData, "name");
  if (!name) fail(PATH, "Informe o nome do concorrente.");

  const { error } = await supabase.from("competitors").insert({
    client_id: clientId,
    name,
    name_variants: list(formData, "name_variants"),
    domain: optional(formData, "domain"),
  });
  if (error) fail(PATH, dbMessage(error, "Não foi possível adicionar o concorrente."));
  revalidatePath(PATH);
}

const REMOVABLE = {
  fact: "brand_facts",
  attribute: "brand_attributes",
  competitor: "competitors",
} as const;

/** Remove um fato, atributo ou concorrente da empresa selecionada. */
export async function removeItem(formData: FormData) {
  const { supabase, clientId } = await context();
  const type = field(formData, "type") as keyof typeof REMOVABLE;
  const id = field(formData, "id");
  const table = REMOVABLE[type];
  if (!table || !id) fail(PATH, "Item não identificado.");

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("client_id", clientId);
  if (error) fail(PATH, dbMessage(error, "Não foi possível remover."));
  revalidatePath(PATH);
}
