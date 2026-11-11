-- BrandVista v1: distingue rodadas de teste das rodadas completas.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0002.
--
-- Uma rodada de teste roda poucas perguntas, em um motor, para conferir as
-- respostas. Ela não entra no histórico de indicadores nem gera relatório.

alter table public.runs
  add column kind text not null default 'completa'
  check (kind in ('teste', 'completa'));
