# BrandVista

Ferramenta interna da Wyse que mede como os motores de IA (ChatGPT, Gemini,
Claude e Perplexity) tratam uma marca. Esta é a v1, construída do zero.

## Estado atual: etapa 1

O que já existe:

- Login por e-mail e senha pelo Supabase. Páginas internas exigem login.
- Dois tipos de usuário: equipe Wyse (vê e edita tudo) e cliente (só lê os
  dados da própria empresa). A visão do cliente entra na etapa 5.
- **Controle:** cadastro de empresas e, por cliente, o limite de perguntas
  ativas, a frequência de tracking e se o tracking está ativo.
- **Marca:** Documento-Fonte, fatos verificáveis, atributos e concorrentes.
- **Perguntas:** biblioteca com tipo, persona, etapa, versão e pausa.

O que ainda não existe: coleta, análise, indicadores e relatório. A ordem de
construção aparece na página inicial da aplicação.

## Banco de dados

Os arquivos em `supabase/migrations/` devem ser executados em ordem, uma vez
cada, no SQL Editor do Supabase:

| Arquivo | O que faz |
| --- | --- |
| `0001_init.sql` | Cria as tabelas |
| `0002_papeis_e_limites.sql` | Papéis de usuário, limites por cliente e regras de acesso |

Depois do `0002`, os usuários que já existiam são equipe Wyse. Todo usuário
criado depois nasce como cliente, sem acesso a nenhuma empresa. Para tornar
alguém equipe Wyse, altere `role` para `wyse` na tabela `profiles`. Para dar
a um cliente acesso a uma empresa, inclua uma linha em `client_members`.

## Como colocar no ar

1. **Supabase.** Crie um projeto (região São Paulo). No SQL Editor, execute
   os arquivos de `supabase/migrations/`, em ordem.
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
| `src/app/(app)/controle/` | Empresas e limites, só para a Wyse |
| `src/app/(app)/marca/` | Documento-Fonte, fatos, atributos, concorrentes |
| `src/app/(app)/perguntas/` | Biblioteca de perguntas |
| `src/lib/session.ts` | Quem está logado e com qual papel |
| `src/app/login/` | Tela e ações de login |
| `src/lib/supabase/` | Conexão com o Supabase |
| `src/proxy.ts` | Renova a sessão e protege as páginas |
| `supabase/migrations/` | Estrutura do banco, em ordem de aplicação |

## Segurança

Nenhuma chave fica no código. Os valores reais ficam apenas nas variáveis de
ambiente da Vercel e em `.env.local`, que o Git ignora.
