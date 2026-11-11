import { Flash, btnDark, btnOutline, firstParam, inputClass, labelClass } from "@/components/ui";
import { requireWyse } from "@/lib/session";
import { FREQUENCIES, type ClientLimits } from "@/lib/types";
import { createClientRecord, updateLimits } from "./actions";

export const metadata = { title: "Controle · BrandVista" };

type Row = { id: string; name: string; domain: string | null; category: string | null };

export default async function ControlePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireWyse();
  const erro = firstParam((await searchParams).erro);

  const [clientsResult, limitsResult, promptsResult] = await Promise.all([
    supabase.from("clients").select("id, name, domain, category").order("name"),
    supabase.from("client_limits").select("*"),
    supabase.from("prompts").select("client_id").eq("active", true),
  ]);

  const clients = (clientsResult.data ?? []) as Row[];
  const limits = new Map(
    ((limitsResult.data ?? []) as ClientLimits[]).map((item) => [item.client_id, item]),
  );
  const activePrompts = new Map<string, number>();
  for (const row of (promptsResult.data ?? []) as { client_id: string }[]) {
    activePrompts.set(row.client_id, (activePrompts.get(row.client_id) ?? 0) + 1);
  }

  return (
    <main className="flex flex-col gap-4">
      <Flash message={erro} />
      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-0 flex-[4_1_320px] flex-col gap-4 rounded-card bg-ink p-7 text-paper">
          <span className="inline-flex min-h-[30px] items-center self-start rounded-full bg-brand px-3.5 text-xs font-semibold tracking-wider text-ink uppercase">
            Só para a Wyse
          </span>
          <h1 className="text-[32px] leading-tight font-semibold tracking-tight">
            Painel de controle
          </h1>
          <p className="text-[15px] leading-relaxed text-[#e3e5e8]">
            Aqui a Wyse define, para cada cliente, quantas perguntas podem ficar
            ativas, com que frequência o tracking roda e quantas vezes cada
            pergunta é repetida por rodada. O cliente não vê nem altera esta
            configuração.
          </p>
        </section>

        <section className="flex min-w-0 flex-[8_1_480px] flex-col gap-4 rounded-card bg-paper p-7">
          <h2 className="text-xl font-semibold">Nova empresa</h2>
          <form action={createClientRecord} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-[2_1_220px] flex-col gap-1.5">
              <label htmlFor="new-name" className={labelClass}>
                Nome
              </label>
              <input id="new-name" name="name" required className={inputClass} />
            </div>
            <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
              <label htmlFor="new-domain" className={labelClass}>
                Domínio
              </label>
              <input id="new-domain" name="domain" placeholder="empresa.com.br" className={inputClass} />
            </div>
            <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
              <label htmlFor="new-category" className={labelClass}>
                Categoria
              </label>
              <input id="new-category" name="category" className={inputClass} />
            </div>
            <button type="submit" className={`${btnDark} min-h-12`}>
              Cadastrar
            </button>
          </form>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-card bg-paper p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Clientes e limites</h2>
          <span className="text-[13px] text-muted">
            {clients.length === 1 ? "1 empresa" : `${clients.length} empresas`}
          </span>
        </div>

        {clients.length === 0 ? (
          <p className="text-[15px] text-muted">
            Nenhuma empresa cadastrada ainda. Use o formulário acima para criar a
            primeira.
          </p>
        ) : (
          <ul className="flex flex-col">
            {clients.map((client) => {
              const limit = limits.get(client.id);
              const used = activePrompts.get(client.id) ?? 0;
              const max = limit?.max_prompts ?? 50;
              return (
                <li
                  key={client.id}
                  className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-[#e3e5e8] py-4 first:border-t-0"
                >
                  <div className="flex min-w-0 flex-[2_1_220px] flex-col gap-1">
                    <span className="text-[17px] font-semibold">{client.name}</span>
                    <span className="text-[13px] text-muted">
                      {[client.domain, client.category].filter(Boolean).join(" · ") ||
                        "Sem domínio e categoria"}
                    </span>
                    <span className="text-[13px] text-muted">
                      {used} de {max} perguntas ativas
                    </span>
                    <span className="text-[13px] text-muted">
                      Rodada completa: {used * 4 * (limit?.repetitions ?? 3)} chamadas de coleta
                    </span>
                  </div>
                  <form
                    action={updateLimits}
                    className="flex min-w-0 flex-[3_1_560px] flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="client_id" value={client.id} />
                    <div className="flex w-[130px] flex-col gap-1.5">
                      <label htmlFor={`max-${client.id}`} className={labelClass}>
                        Máx. de perguntas
                      </label>
                      <input
                        id={`max-${client.id}`}
                        name="max_prompts"
                        type="number"
                        min={1}
                        max={500}
                        defaultValue={max}
                        required
                        className={inputClass}
                      />
                    </div>
                    <div className="flex w-[160px] flex-col gap-1.5">
                      <label htmlFor={`freq-${client.id}`} className={labelClass}>
                        Frequência
                      </label>
                      <select
                        id={`freq-${client.id}`}
                        name="tracking_frequency"
                        defaultValue={limit?.tracking_frequency ?? "mensal"}
                        className={inputClass}
                      >
                        {FREQUENCIES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex w-[120px] flex-col gap-1.5">
                      <label htmlFor={`rep-${client.id}`} className={labelClass}>
                        Repetições
                      </label>
                      <input
                        id={`rep-${client.id}`}
                        name="repetitions"
                        type="number"
                        min={1}
                        max={5}
                        defaultValue={limit?.repetitions ?? 3}
                        required
                        className={inputClass}
                      />
                    </div>
                    <label className="flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={limit?.active ?? true}
                        className="size-5 cursor-pointer accent-[#000000]"
                      />
                      Tracking ativo
                    </label>
                    <button type="submit" className={`${btnOutline} min-h-12`}>
                      Salvar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
