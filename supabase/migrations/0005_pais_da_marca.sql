-- BrandVista v1: país (mercado) de cada marca.
-- Como aplicar: cole este arquivo inteiro no SQL Editor do Supabase e execute,
-- uma única vez, depois do 0004.
--
-- O país é enviado aos motores como localização do usuário, do mesmo jeito
-- que o aplicativo faz com quem acessa daquele país. O texto da pergunta não
-- é alterado. As marcas já cadastradas ficam como Brasil.

alter table public.clients
  add column country text not null default 'BR'
  check (country ~ '^[A-Z]{2}$');
