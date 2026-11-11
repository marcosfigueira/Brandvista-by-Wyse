-- BrandVista v1: estrutura inicial do banco.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Pode ser executado uma única vez em um projeto novo.

create extension if not exists pgcrypto;

-- A marca medida.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_variants text[] not null default '{}',
  domain text,
  category text,
  canonical_description text,
  source_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fatos verificáveis do Documento-Fonte: o gabarito para detectar erros.
create table public.brand_facts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('preco', 'produto', 'institucional', 'outro')),
  statement text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Atributos que a marca quer ter associados a si, com peso.
create table public.brand_attributes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  weight integer not null default 1 check (weight between 1 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  name_variants text[] not null default '{}',
  domain text,
  created_at timestamptz not null default now()
);

-- Biblioteca de perguntas. Editar o texto cria uma nova linha com version + 1
-- e o mesmo prompt_key, para a série histórica comparar a mesma versão.
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  prompt_key uuid not null default gen_random_uuid(),
  version integer not null default 1,
  text text not null,
  kind text not null check (
    kind in ('categoria', 'comparativa', 'sobre_a_marca', 'reconhecimento', 'associacao')
  ),
  persona text,
  journey_stage text,
  search_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (prompt_key, version)
);

-- Uma rodada de medição.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status text not null default 'pendente' check (
    status in ('pendente', 'coletando', 'analisando', 'concluida', 'falhou')
  ),
  engines text[] not null,
  repetitions integer not null default 3 check (repetitions between 1 and 5),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Uma linha por resposta de um motor. O texto bruto e o retorno completo da
-- API ficam guardados para que qualquer número possa ser auditado.
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  prompt_id uuid not null references public.prompts (id),
  engine text not null check (engine in ('chatgpt', 'gemini', 'claude', 'perplexity')),
  model text not null,
  repetition integer not null,
  search_enabled boolean not null,
  search_executed boolean,
  status text not null default 'ok' check (status in ('ok', 'erro')),
  error_message text,
  raw_text text,
  sources jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (run_id, prompt_id, engine, repetition)
);

-- O que o analisador extraiu de cada resposta. Pode haver mais de uma análise
-- por resposta, uma para cada versão do analisador.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  analyzer_version text not null,
  analyzer_model text,
  result jsonb not null,
  flagged_incorrect boolean not null default false,
  created_at timestamptz not null default now(),
  unique (response_id, analyzer_version)
);

-- Valor de cada indicador por rodada. engine nulo = agregado dos motores.
create table public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  engine text,
  indicator text not null,
  value numeric not null,
  numerator integer,
  denominator integer,
  created_at timestamptz not null default now()
);

create unique index kpi_snapshots_unique
  on public.kpi_snapshots (run_id, coalesce(engine, ''), indicator);

create index brand_facts_client on public.brand_facts (client_id);
create index brand_attributes_client on public.brand_attributes (client_id);
create index competitors_client on public.competitors (client_id);
create index prompts_client on public.prompts (client_id);
create index runs_client on public.runs (client_id, created_at desc);
create index responses_run on public.responses (run_id);
create index responses_prompt on public.responses (prompt_id);
create index analyses_response on public.analyses (response_id);

-- Segurança: uso interno. Só quem está logado lê e grava; visitantes anônimos
-- não têm acesso a nada. Os usuários são criados manualmente no painel do
-- Supabase (Authentication > Users); desative o cadastro público em
-- Authentication > Sign In / Providers.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'brand_facts', 'brand_attributes', 'competitors', 'prompts',
    'runs', 'responses', 'analyses', 'kpi_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "equipe autenticada" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
