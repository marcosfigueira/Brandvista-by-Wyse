import Link from "next/link";
import { redirect } from "next/navigation";
import { ClientSwitcher } from "@/components/client-switcher";
import { Notice } from "@/components/ui";
import { getCurrentClient } from "@/lib/current-client";
import { getSession } from "@/lib/session";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { logout } from "../login/actions";
import { selectClient } from "./actions";

export const dynamic = "force-dynamic";

const sections = [
  { href: "/", label: "Painel" },
  { href: "/respostas", label: "Respostas" },
  { href: "/perguntas", label: "Perguntas" },
  { href: "/marca", label: "Marca" },
  { href: "/controle", label: "Controle" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = getSupabaseEnv() !== null;
  const session = configured ? await getSession() : null;
  if (configured && !session) redirect("/login");

  const isWyse = session?.role === "wyse";
  const { clients, current } = session
    ? await getCurrentClient()
    : { clients: [], current: null };

  let body = children;
  if (session?.needsMigration) {
    body = (
      <Notice tag="Banco de dados" title="Falta atualizar o banco.">
        <p>
          Esta versão precisa das tabelas de papéis e limites. No SQL Editor do
          Supabase, cole o conteúdo do arquivo{" "}
          <code>supabase/migrations/0002_papeis_e_limites.sql</code> e execute.
          Depois, recarregue esta página.
        </p>
      </Notice>
    );
  } else if (session && !isWyse) {
    body = (
      <Notice tag="Em preparação" title="O acesso de cliente ainda não foi aberto.">
        <p>
          O seu login está ativo, mas o painel para clientes entra em uma
          próxima etapa. A equipe da Wyse avisa quando estiver disponível.
        </p>
      </Notice>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 px-1 pb-3">
        <Link href="/" className="flex items-end gap-2.5" aria-label="BrandVista by Wyse: ir para o Painel">
          {/* eslint-disable-next-line @next/next/no-img-element -- arquivo local pequeno, sem otimização */}
          <img src="/brandvista-logo.png" alt="BrandVista" width={120} height={74} />
          <span className="pb-1 text-[13px] font-medium text-muted">by Wyse</span>
        </Link>
        {isWyse ? (
          <nav aria-label="Seções" className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="inline-flex min-h-11 items-center rounded-full bg-paper px-5 text-sm font-medium"
              >
                {section.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {session ? (
          <div className="flex flex-wrap items-center gap-3">
            {isWyse ? (
              <ClientSwitcher
                key={current?.id ?? "nenhuma"}
                clients={clients}
                currentId={current?.id ?? null}
                action={selectClient}
              />
            ) : null}
            <form action={logout} className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-muted">{session.user.email}</span>
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-full border-[1.5px] border-ink px-5 text-sm font-medium"
              >
                Sair
              </button>
            </form>
          </div>
        ) : null}
      </header>
      {body}
    </div>
  );
}
