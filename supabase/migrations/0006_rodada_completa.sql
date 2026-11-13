-- BrandVista v1: rodadas completas em segundo plano (fila do Inngest).
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0005.

-- Quantas respostas a rodada deve coletar (perguntas x motores x repetições).
-- Serve para mostrar o andamento: "120 de 360".
alter table public.runs
  add column expected_responses integer check (expected_responses >= 0);

-- A fila roda sem usuário logado e grava com a chave de serviço do Supabase.
-- Essa chave fica só no servidor e nunca chega ao navegador.
grant select, insert, update, delete on all tables in schema public to service_role;
