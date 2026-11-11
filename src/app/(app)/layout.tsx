import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

const sections = [
  { href: "/", label: "Painel" },
  { href: "/respostas", label: "Respostas" },
  { href: "/perguntas", label: "Perguntas" },
  { href: "/marca", label: "Marca" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = getSupabaseEnv() !== null;
  let email: string | null = null;

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase!.auth.getUser();
    if (!data.user) redirect("/login");
    email = data.user.email ?? null;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 px-1 pb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[26px] font-bold tracking-tight">BrandVista</span>
          <span className="text-[13px] font-medium text-muted">by Wyse</span>
        </div>
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
        {email ? (
          <form action={logout} className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-muted">{email}</span>
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-full border-[1.5px] border-ink px-5 text-sm font-medium"
            >
              Sair
            </button>
          </form>
        ) : null}
      </header>
      {children}
    </div>
  );
}
