-- BrandVista v1: número de repetições por rodada, definido pela Wyse por cliente.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0003.
--
-- Cada pergunta é feita esse número de vezes a cada motor em uma rodada
-- completa. O padrão é 3; o protocolo aceita de 1 a 5.

alter table public.client_limits
  add column repetitions integer not null default 3
  check (repetitions between 1 and 5);
