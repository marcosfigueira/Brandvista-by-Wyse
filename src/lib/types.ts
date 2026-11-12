export type Role = "wyse" | "cliente";

export type ClientSummary = { id: string; name: string };

export type Client = {
  id: string;
  name: string;
  name_variants: string[];
  domain: string | null;
  category: string | null;
  canonical_description: string | null;
  source_version: number;
  /** País (mercado) da marca, em duas letras. Ausente antes da migração 0005. */
  country?: string;
};

export type ClientLimits = {
  client_id: string;
  active: boolean;
  max_prompts: number;
  tracking_frequency: "semanal" | "quinzenal" | "mensal";
  /** Vezes que cada pergunta é feita a cada motor em uma rodada completa. */
  repetitions?: number;
};

export type Fact = { id: string; kind: string; statement: string };
export type Attribute = { id: string; name: string; weight: number };
export type Competitor = {
  id: string;
  name: string;
  name_variants: string[];
  domain: string | null;
};

export type Prompt = {
  id: string;
  prompt_key: string;
  version: number;
  text: string;
  kind: string;
  persona: string | null;
  journey_stage: string | null;
  search_enabled: boolean;
  active: boolean;
};

/** Tipos de pergunta. `search` diz se a pergunta é feita com busca na web. */
export const PROMPT_KINDS = [
  { value: "categoria", label: "Categoria", search: true },
  { value: "comparativa", label: "Comparativa", search: true },
  { value: "sobre_a_marca", label: "Sobre a marca", search: true },
  { value: "reconhecimento", label: "Reconhecimento", search: false },
  { value: "associacao", label: "Associação", search: false },
] as const;

export const FACT_KINDS = [
  { value: "preco", label: "Preço" },
  { value: "produto", label: "Produto" },
  { value: "institucional", label: "Institucional" },
  { value: "outro", label: "Outro" },
] as const;

export const JOURNEY_STAGES = ["Descoberta", "Consideração", "Decisão"] as const;

/** Mercados oferecidos no cadastro da marca. O valor é o código ISO de duas letras. */
export const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "PT", label: "Portugal" },
  { value: "US", label: "Estados Unidos" },
  { value: "MX", label: "México" },
  { value: "AR", label: "Argentina" },
  { value: "CL", label: "Chile" },
  { value: "CO", label: "Colômbia" },
  { value: "PE", label: "Peru" },
  { value: "UY", label: "Uruguai" },
  { value: "ES", label: "Espanha" },
  { value: "GB", label: "Reino Unido" },
  { value: "FR", label: "França" },
  { value: "DE", label: "Alemanha" },
  { value: "IT", label: "Itália" },
  { value: "CA", label: "Canadá" },
] as const;

export const FREQUENCIES = [
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
] as const;

export function labelOf(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
