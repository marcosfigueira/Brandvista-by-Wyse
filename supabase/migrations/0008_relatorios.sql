-- BrandVista v1: relatório de cada rodada.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0007.
--
-- O relatório é gerado uma vez, ao fim da análise da rodada, e fica guardado:
-- quem baixar hoje ou daqui a um mês recebe o mesmo conteúdo.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  status text not null default 'gerando' check (status in ('gerando', 'pronto', 'falhou')),
  -- Números e listas da rodada no momento da geração (indicadores, benchmark,
  -- perguntas, erros, fontes, evolução).
  data jsonb,
  -- Auditoria técnica do site da marca (llms.txt, robots.txt, sitemap, dados estruturados).
  audit jsonb,
  -- Diagnóstico e recomendações escritos pelo modelo.
  content jsonb,
  model text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "wyse: acesso total" on public.reports for all to authenticated
  using ((select private.is_wyse())) with check ((select private.is_wyse()));

-- Cliente: lê o relatório das rodadas que pode ver, depois de pronto.
create policy "cliente: le relatorios das proprias rodadas" on public.reports
  for select to authenticated
  using (status = 'pronto' and run_id in (select r.id from public.runs r));

revoke all on public.reports from anon;
grant select, insert, update, delete on public.reports to authenticated, service_role;
