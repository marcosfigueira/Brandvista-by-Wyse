import Link from "next/link";
import { Notice } from "@/components/ui";
import { painelDate, type Painel, type PainelRun } from "@/lib/painel";

const SECTIONS = [
  { href: "/", label: "Resumo" },
  { href: "/painel/evolucao", label: "Evolução" },
  { href: "/painel/perguntas", label: "Por pergunta" },
  { href: "/painel/erros", label: "Erros" },
  { href: "/painel/fontes", label: "Fontes" },
] as const;

/** Telas de aviso quando ainda não há o que mostrar no Painel. */
export function PainelEmpty({ painel }: { painel: Exclude<Painel, { state: "ok" }> }) {
  if (painel.state === "sem-config") {
    return (
      <Notice tag="Configuração" title="Configuração pendente.">
        <p>
          A aplicação foi publicada, mas ainda não encontrou as variáveis do Supabase. Cadastre
          NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e publique de novo.
        </p>
      </Notice>
    );
  }
  if (painel.state === "sem-empresa") {
    return (
      <Notice tag="Painel" title="Cadastre a primeira empresa.">
        <p>
          Ainda não há empresas. O cadastro fica em{" "}
          <Link href="/controle" className="font-semibold text-ink underline">
            Controle
          </Link>
          , junto com os limites de perguntas e de frequência.
        </p>
      </Notice>
    );
  }
  return (
    <Notice tag="Painel" title={`${painel.current.name}: ainda não há rodada analisada.`}>
      <p>
        O painel aparece depois da primeira rodada concluída e analisada. Em{" "}
        <Link href="/perguntas" className="font-semibold text-ink underline">
          Perguntas
        </Link>
        , use &quot;Rodar agora&quot;; a análise começa sozinha ao fim da coleta. Para uma rodada antiga, abra{" "}
        <Link href="/respostas" className="font-semibold text-ink underline">
          Respostas
        </Link>{" "}
        e use &quot;Analisar respostas&quot;.
      </p>
    </Notice>
  );
}

const pill = (selected: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-[13px] ${
    selected ? "border-ink bg-ink font-semibold text-paper" : "border-[#b3b3b3] bg-paper font-medium text-ink"
  }`;

/** Cabeçalho comum das telas do Painel: empresa, rodada, seções e escolha de rodada. */
export function PainelHeader({
  clientName,
  runs,
  selected,
  section,
  analyzed,
  showRuns = true,
}: {
  clientName: string;
  runs: PainelRun[];
  selected: PainelRun;
  section: (typeof SECTIONS)[number]["href"];
  analyzed?: number;
  showRuns?: boolean;
}) {
  const query = `?rodada=${selected.id}`;
  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">{clientName}</h1>
          <span className="text-[13px] text-muted">
            {selected.kind === "teste" ? "Rodada de teste" : "Rodada completa"} de{" "}
            {painelDate.format(new Date(selected.created_at))}
            {analyzed === undefined ? "" : ` · ${analyzed} respostas analisadas`}
          </span>
        </div>
        <nav aria-label="Seções do Painel" className="flex flex-wrap gap-2">
          {SECTIONS.map((item) => (
            <Link
              key={item.href}
              href={`${item.href}${query}`}
              aria-current={item.href === section ? "page" : undefined}
              className={pill(item.href === section)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {showRuns && runs.length > 1 ? (
        <nav aria-label="Escolher rodada" className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Rodada:</span>
          {runs.slice(0, 6).map((run) => (
            <Link
              key={run.id}
              href={`${section}?rodada=${run.id}`}
              aria-current={run.id === selected.id ? "true" : undefined}
              className={pill(run.id === selected.id)}
            >
              {painelDate.format(new Date(run.created_at))}
              {run.kind === "teste" ? " · teste" : ""}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const score = (value: number) => String(Math.round(value * 100));
export const decimal = (value: number) => value.toFixed(1).replace(".", ",");
