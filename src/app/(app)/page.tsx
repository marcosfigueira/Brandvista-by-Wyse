import { getSupabaseEnv } from "@/lib/supabase/env";

const steps = [
  { n: "0", name: "Setup", note: "Projeto, login e tabelas" },
  { n: "1", name: "Cadastros", note: "Marca, fatos, atributos, concorrentes e perguntas" },
  { n: "2", name: "Coleta com um motor", note: "Perplexity e tela de respostas brutas" },
  { n: "3", name: "Quatro motores e fila", note: "Demais motores, Inngest e repetições" },
  { n: "4", name: "Analisador", note: "Extração estruturada e conjunto de validação" },
  { n: "5", name: "Indicadores e painel", note: "Cálculo, SEI e painel por cliente" },
  { n: "6", name: "Relatório e agenda", note: "Relatório mensal e rodadas agendadas" },
];

export default function HomePage() {
  const configured = getSupabaseEnv() !== null;

  return (
    <main className="flex flex-wrap gap-4">
      <section className="flex min-w-0 flex-[4_1_320px] flex-col gap-5 rounded-card bg-ink p-7 text-paper">
        <span className="inline-flex min-h-[30px] items-center self-start rounded-full bg-brand px-3.5 text-xs font-semibold tracking-wider text-ink uppercase">
          Etapa 0
        </span>
        <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight">
          {configured ? "A base está no ar." : "Configuração pendente."}
        </h1>
        <p className="text-[15px] leading-relaxed text-[#e3e5e8]">
          {configured
            ? "Login e banco de dados estão ligados. O painel com os indicadores entra na etapa 5."
            : "A aplicação foi publicada, mas ainda não encontrou as variáveis do Supabase. Cadastre NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e publique de novo."}
        </p>
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
              <span className="text-sm text-muted">{step.note}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
