import Link from "next/link";
import { getCurrentClient } from "@/lib/current-client";
import { getSession } from "@/lib/session";
import { getSupabaseEnv } from "@/lib/supabase/env";

const steps = [
  { n: "0", name: "Setup", note: "Projeto, login e tabelas", done: true },
  { n: "1", name: "Cadastros", note: "Empresas, limites, marca e perguntas", done: true },
  { n: "2", name: "Coleta com um motor", note: "Perplexity e tela de respostas brutas", done: true },
  { n: "3", name: "Quatro motores e fila", note: "Demais motores, Inngest e repetições", done: false },
  { n: "4", name: "Analisador", note: "Extração estruturada e conjunto de validação", done: false },
  { n: "5", name: "Indicadores e painel", note: "Cálculo, SEI, painel e acesso do cliente", done: false },
  { n: "6", name: "Relatório e agenda", note: "Relatório com recomendações e rodadas agendadas", done: false },
];

export default async function HomePage() {
  const configured = getSupabaseEnv() !== null;
  const session = configured ? await getSession() : null;
  const { current } = session ? await getCurrentClient() : { current: null };

  let counts: { label: string; value: number; href: string }[] = [];
  if (session && current) {
    const table = (name: string) =>
      session.supabase.from(name).select("id", { count: "exact", head: true }).eq("client_id", current.id);
    const [facts, attributes, competitors, prompts] = await Promise.all([
      table("brand_facts"),
      table("brand_attributes"),
      table("competitors"),
      table("prompts").eq("active", true),
    ]);
    counts = [
      { label: "Fatos verificáveis", value: facts.count ?? 0, href: "/marca" },
      { label: "Atributos desejados", value: attributes.count ?? 0, href: "/marca" },
      { label: "Concorrentes", value: competitors.count ?? 0, href: "/marca" },
      { label: "Perguntas ativas", value: prompts.count ?? 0, href: "/perguntas" },
    ];
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[4_1_320px] flex-col gap-5 rounded-card bg-ink p-7 text-paper">
          <span className="inline-flex min-h-[30px] items-center self-start rounded-full bg-brand px-3.5 text-xs font-semibold tracking-wider text-ink uppercase">
            Etapa 2
          </span>
          <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight">
            {!configured
              ? "Configuração pendente."
              : current
                ? current.name
                : "Cadastre a primeira empresa."}
          </h1>
          <p className="text-[15px] leading-relaxed text-[#e3e5e8]">
            {!configured
              ? "A aplicação foi publicada, mas ainda não encontrou as variáveis do Supabase. Cadastre NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e publique de novo."
              : current
                ? "Os cadastros desta empresa estão abaixo. Já é possível rodar um teste no Perplexity a partir de Perguntas. O painel com os indicadores entra na etapa 5."
                : "Ainda não há empresas. O cadastro fica em Controle, junto com os limites de perguntas e de frequência."}
          </p>
          {configured && !current ? (
            <Link
              href="/controle"
              className="mt-auto inline-flex min-h-12 items-center justify-center self-start rounded-full bg-paper px-6 text-sm font-semibold text-ink"
            >
              Abrir Controle
            </Link>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-[8_1_480px] flex-col gap-4 rounded-card bg-paper p-7">
          <h2 className="text-xl font-semibold">Ordem de construção</h2>
          <ol className="flex flex-col">
            {steps.map((step) => (
              <li
                key={step.n}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[#e3e5e8] py-3 first:border-t-0"
              >
                <span className="w-6 text-sm font-semibold">{step.n}</span>
                <span className="min-w-[180px] text-[15px] font-medium">{step.name}</span>
                <span className="min-w-0 flex-1 text-sm text-muted">{step.note}</span>
                {step.done ? <span className="text-[13px] font-semibold">Concluída</span> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {counts.length > 0 ? (
        <div className="flex flex-wrap gap-4">
          {counts.map((item, index) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex min-w-0 flex-[1_1_220px] flex-col gap-1 rounded-card p-7 ${
                ["bg-brand text-ink", "bg-blue text-paper", "bg-sun text-ink", "bg-navy text-paper"][index]
              }`}
            >
              <span className="text-[64px] leading-none font-semibold tracking-tight">{item.value}</span>
              <span className="text-[15px] font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </main>
  );
}
