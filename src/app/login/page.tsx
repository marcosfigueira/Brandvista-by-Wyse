import { getSupabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · BrandVista" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = getSupabaseEnv() !== null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-wrap items-stretch gap-4 p-8">
      <section className="flex min-w-0 flex-[1_1_320px] flex-col justify-between gap-10 rounded-card bg-brand p-10">
        <div className="flex items-end gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- arquivo local pequeno, sem otimização */}
          <img src="/brandvista-logo-login.png" alt="BrandVista" width={120} height={70} />
          <span className="pb-1 text-[13px] font-medium">by Wyse</span>
        </div>
        <p className="text-[40px] leading-[1.1] font-semibold tracking-tight">
          Como as IAs enxergam a sua marca.
        </p>
      </section>
      <section className="flex min-w-0 flex-[1_1_320px] flex-col justify-center gap-6 rounded-card bg-paper p-10">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        {configured ? (
          <LoginForm />
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            O Supabase ainda não foi configurado neste ambiente. Cadastre as
            variáveis listadas no README e publique de novo.
          </p>
        )}
      </section>
    </main>
  );
}
