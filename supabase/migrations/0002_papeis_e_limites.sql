-- BrandVista v1: papéis de usuário, limites por cliente e novas regras de acesso.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0001_init.sql.
--
-- O que muda:
--   * Dois tipos de usuário: equipe Wyse (vê e edita tudo) e cliente (só lê os
--     dados da própria empresa).
--   * Limites por cliente (perguntas e frequência), visíveis só para a Wyse.
--   * Os usuários que já existem neste momento passam a ser equipe Wyse.
--     Todo usuário criado depois nasce como cliente, sem acesso a nenhuma
--     empresa, até a Wyse vinculá-lo.

begin;

-- Funções auxiliares ficam em um schema que a API não expõe.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tabelas novas
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'cliente' check (role in ('wyse', 'cliente')),
  created_at timestamptz not null default now()
);

-- Quais empresas um usuário cliente pode ver.
create table public.client_members (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create index client_members_user on public.client_members (user_id);

-- Limites definidos pela Wyse. Ficam fora de `clients` para o cliente não
-- conseguir ler essa configuração.
create table public.client_limits (
  client_id uuid primary key references public.clients (id) on delete cascade,
  active boolean not null default true,
  max_prompts integer not null default 50 check (max_prompts between 1 and 500),
  tracking_frequency text not null default 'mensal' check (
    tracking_frequency in ('semanal', 'quinzenal', 'mensal')
  ),
  updated_at timestamptz not null default now()
);

-- Só uma versão ativa por pergunta.
create unique index prompts_one_active_version
  on public.prompts (prompt_key)
  where active;

-- ---------------------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------------------

insert into public.profiles (user_id, role)
select id, 'wyse' from auth.users
on conflict (user_id) do nothing;

insert into public.client_limits (client_id)
select id from public.clients
on conflict (client_id) do nothing;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- O usuário logado é da equipe Wyse?
create function private.is_wyse()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid()) and role = 'wyse'
  );
$$;

-- Todo usuário novo nasce como cliente, sem vínculo com empresa alguma.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Toda empresa nova recebe a linha de limites com os valores padrão.
create function private.handle_new_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.client_limits (client_id) values (new.id)
  on conflict (client_id) do nothing;
  return new;
end;
$$;

create trigger on_client_created
  after insert on public.clients
  for each row execute function private.handle_new_client();

-- Recusa ativar uma pergunta além do limite do cliente.
create function private.enforce_prompt_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_active integer;
begin
  if not new.active then
    return new;
  end if;

  select max_prompts into v_limit
  from public.client_limits
  where client_id = new.client_id;

  v_limit := coalesce(v_limit, 50);

  select count(*) into v_active
  from public.prompts p
  where p.client_id = new.client_id
    and p.active
    and p.prompt_key <> new.prompt_key;

  if v_active >= v_limit then
    raise exception 'Limite de % perguntas ativas atingido para este cliente.', v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger prompts_enforce_limit
  before insert or update of active on public.prompts
  for each row execute function private.enforce_prompt_limit();

-- Edita uma pergunta. Se o texto muda, cria uma nova versão e desativa a
-- anterior, na mesma transação; se só muda a classificação, atualiza no lugar.
-- Roda com as permissões de quem chama, então só a equipe Wyse consegue usar.
create function public.revise_prompt(
  p_prompt_id uuid,
  p_text text,
  p_kind text,
  p_persona text,
  p_journey_stage text,
  p_search_enabled boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.prompts;
  v_new_id uuid;
begin
  select * into v_old from public.prompts where id = p_prompt_id;
  if not found then
    raise exception 'Pergunta não encontrada.' using errcode = 'P0002';
  end if;

  if v_old.text = p_text then
    update public.prompts
    set kind = p_kind,
        persona = p_persona,
        journey_stage = p_journey_stage,
        search_enabled = p_search_enabled
    where id = p_prompt_id;
    return p_prompt_id;
  end if;

  update public.prompts set active = false where id = p_prompt_id;

  insert into public.prompts (
    client_id, prompt_key, version, text, kind, persona, journey_stage,
    search_enabled, active
  )
  values (
    v_old.client_id,
    v_old.prompt_key,
    (select max(version) + 1 from public.prompts where prompt_key = v_old.prompt_key),
    p_text, p_kind, p_persona, p_journey_stage, p_search_enabled,
    v_old.active
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_wyse() to authenticated;

revoke execute on function public.revise_prompt(uuid, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.revise_prompt(uuid, text, text, text, text, boolean)
  to authenticated;

-- Visitantes anônimos não acessam tabela alguma. Usuários logados passam
-- pelas regras de linha abaixo.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Regras de acesso por linha
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.client_members enable row level security;
alter table public.client_limits enable row level security;

-- Remove a regra antiga, que liberava tudo a qualquer usuário logado.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'brand_facts', 'brand_attributes', 'competitors', 'prompts',
    'runs', 'responses', 'analyses', 'kpi_snapshots'
  ]
  loop
    execute format('drop policy if exists "equipe autenticada" on public.%I', t);
  end loop;
end $$;

-- Equipe Wyse: lê e grava em todas as tabelas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'brand_facts', 'brand_attributes', 'competitors', 'prompts',
    'runs', 'responses', 'analyses', 'kpi_snapshots',
    'profiles', 'client_members', 'client_limits'
  ]
  loop
    execute format(
      'create policy "wyse: acesso total" on public.%I for all to authenticated '
      'using ((select private.is_wyse())) with check ((select private.is_wyse()))',
      t
    );
  end loop;
end $$;

-- Cliente: lê o próprio perfil e os próprios vínculos.
create policy "cliente: le o proprio perfil" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "cliente: le os proprios vinculos" on public.client_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Cliente: lê a própria empresa.
create policy "cliente: le a propria empresa" on public.clients
  for select to authenticated
  using (
    id in (
      select m.client_id from public.client_members m
      where m.user_id = (select auth.uid())
    )
  );

-- Cliente: lê os cadastros e as rodadas da própria empresa.
do $$
declare
  t text;
begin
  foreach t in array array[
    'brand_facts', 'brand_attributes', 'competitors', 'prompts', 'runs'
  ]
  loop
    execute format(
      'create policy "cliente: le dados da propria empresa" on public.%I '
      'for select to authenticated using ('
      'client_id in (select m.client_id from public.client_members m '
      'where m.user_id = (select auth.uid())))',
      t
    );
  end loop;
end $$;

-- Cliente: lê respostas, análises e indicadores das rodadas que pode ver.
-- A subconsulta em `runs` já passa pela regra de `runs`.
create policy "cliente: le respostas das proprias rodadas" on public.responses
  for select to authenticated
  using (run_id in (select r.id from public.runs r));

create policy "cliente: le indicadores das proprias rodadas" on public.kpi_snapshots
  for select to authenticated
  using (run_id in (select r.id from public.runs r));

create policy "cliente: le analises das proprias respostas" on public.analyses
  for select to authenticated
  using (response_id in (select x.id from public.responses x));

-- `client_limits` não tem regra para cliente: só a Wyse lê e altera.

commit;
