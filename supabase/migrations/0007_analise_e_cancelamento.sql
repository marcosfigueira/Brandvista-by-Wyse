-- BrandVista v1: análise das respostas e cancelamento de rodadas.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0006.

-- Novo estado de rodada: cancelada pela Wyse.
alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check
  check (status in ('pendente', 'coletando', 'analisando', 'concluida', 'falhou', 'cancelada'));
