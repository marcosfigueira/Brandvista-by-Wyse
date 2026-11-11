"use client";

import type { ClientSummary } from "@/lib/types";

/** Seletor de empresa do topo. Envia o formulário ao trocar a opção. */
export function ClientSwitcher({
  clients,
  currentId,
  action,
}: {
  clients: ClientSummary[];
  currentId: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  if (clients.length === 0) return null;

  return (
    <form action={action}>
      <label htmlFor="client-switcher" className="sr-only">
        Empresa
      </label>
      <select
        id="client-switcher"
        name="client"
        defaultValue={currentId ?? undefined}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="min-h-11 max-w-[220px] cursor-pointer rounded-full border-[1.5px] border-ink bg-transparent px-4 text-sm font-medium"
      >
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </form>
  );
}
