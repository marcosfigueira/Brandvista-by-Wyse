# BrandVista

Ferramenta interna da Wyse que mede como os motores de IA (ChatGPT, Gemini,
Claude e Perplexity) tratam uma marca. Esta é a v1, construída do zero.

## Estado atual: etapa 0

O que já existe:

- Aplicação Next.js com a identidade visual do painel.
- Login por e-mail e senha pelo Supabase. Páginas internas exigem login.
- Estrutura do banco em `supabase/migrations/0001_init.sql`.

O que ainda não existe: cadastros, coleta, análise e indicadores. A ordem de
construção aparece na página inicial da aplicação.

## Como colocar no ar

1. **Supabase.** Crie um projeto (região São Paulo). No SQL Editor, cole o
   conteúdo de `supabase/migrations/0001_init.sql` e execute.
2. **Usuário.** Em Authentication > Users, crie o seu usuário com e-mail e
   senha. Desative o cadastro público em Authentication > Sign In / Providers.
3. **Vercel.** Em "Add New Project", importe este repositório.
4. **Variáveis.** Na Vercel, em Settings > Environment Variables, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Publicar.** Dispare um novo deploy na Vercel para as variáveis valerem.

Sem as variáveis, a aplicação abre e mostra "Configuração pendente" em vez de
quebrar. As demais variáveis de `.env.example` só são usadas a partir da
etapa 2.

## Rodar no computador

```bash
npm install
cp .env.example .env.local   # preencha os valores
npm run dev
```

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `src/app/(app)/` | Páginas internas, que exigem login |
| `src/app/login/` | Tela e ações de login |
| `src/lib/supabase/` | Conexão com o Supabase |
| `src/proxy.ts` | Renova a sessão e protege as páginas |
| `supabase/migrations/` | Estrutura do banco, em ordem de aplicação |

## Segurança

Nenhuma chave fica no código. Os valores reais ficam apenas nas variáveis de
ambiente da Vercel e em `.env.local`, que o Git ignora.
