-- BrandVista v1: marca as respostas que a IA interrompeu por limite de tamanho.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0008 e ANTES de publicar o código que o usa.

alter table public.responses
  add column truncated boolean not null default false;
