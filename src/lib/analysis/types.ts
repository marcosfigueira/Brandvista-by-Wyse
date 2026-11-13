/** Versão do analisador. Mudar o roteiro ou os campos exige subir a versão. */
export const ANALYZER_VERSION = "v1";

export const SENTIMENTS = ["positivo", "neutro", "negativo"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const RECOGNITIONS = ["sim", "parcial", "nao"] as const;
export type Recognition = (typeof RECOGNITIONS)[number];

export const VERDICTS = ["correta", "incorreta", "nao_verificavel"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Claim = { claim: string; verdict: Verdict; fact: string | null };

/** O que o modelo analisador devolve, já validado. */
export type Judgement = {
  brand_mentioned: boolean;
  brands_in_order: string[];
  sentiment: Sentiment | null;
  recognition: Recognition | null;
  attributes_associated: string[];
  claims: Claim[];
};

/** O que a marca informou em Marca, usado como gabarito. */
export type BrandContext = {
  name: string;
  variants: string[];
  domain: string | null;
  category: string | null;
  description: string | null;
  facts: string[];
  attributes: string[];
  competitors: { name: string; variants: string[] }[];
};

/**
 * Análise de uma resposta, gravada em `analyses.result`.
 * Campos "por regra" vêm de comparação de texto e podem ser conferidos à mão;
 * campos "por modelo" são o julgamento do analisador.
 */
export type Analysis = {
  /** Por regra: a pergunta cita a marca. Se sim, a resposta não conta para visibilidade. */
  question_names_brand: boolean;
  /** Por regra: o nome da marca aparece no texto da resposta. */
  brand_in_text: boolean;
  /** Por modelo: a resposta cita a marca (pega grafias que a regra não pega). */
  brand_mentioned: boolean;
  /** Regra e modelo discordam: vale conferir à mão. */
  mention_divergence: boolean;
  /** Por modelo: marcas e empresas citadas, na ordem em que aparecem. */
  brands_in_order: string[];
  /** Posição da marca nessa lista, começando em 1; nulo se não aparece. */
  brand_position: number | null;
  /** Por regra: concorrentes cadastrados que aparecem no texto. */
  competitors_mentioned: string[];
  /** Por regra: o site da marca está entre as fontes citadas. */
  own_domain_cited: boolean;
  /** Por modelo: tom da resposta em relação à marca; nulo se não é citada. */
  sentiment: Sentiment | null;
  /** Por modelo: a resposta mostra saber quem é a marca; nulo se não é citada. */
  recognition: Recognition | null;
  /** Por modelo: atributos desejados que a resposta associa à marca. */
  attributes_associated: string[];
  /** Por modelo: afirmações verificáveis sobre a marca, conferidas com os fatos cadastrados. */
  claims: Claim[];
};
