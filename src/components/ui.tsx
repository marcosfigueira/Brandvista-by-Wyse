/** Classes compartilhadas, para os formulários terem a mesma aparência. */
export const inputClass =
  "min-h-12 w-full rounded-[14px] border-[1.5px] border-[#b3b3b3] bg-paper px-4 text-[15px] text-ink";

export const labelClass = "text-[13px] font-semibold";

export const btnDark =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-paper";

export const btnLight =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-paper px-5 text-sm font-semibold text-ink";

export const btnOutline =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-ink px-5 text-sm font-medium text-ink";

export const btnOutlineLight =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-paper px-5 text-sm font-medium text-paper";

export function Pill({
  children,
  tone = "sun",
}: {
  children: React.ReactNode;
  tone?: "sun" | "brand" | "ink" | "line";
}) {
  const tones = {
    sun: "bg-sun text-ink",
    brand: "bg-brand text-ink",
    ink: "bg-ink text-paper",
    line: "bg-[#e3e5e8] text-ink",
  };
  return (
    <span
      className={`inline-flex min-h-[26px] items-center rounded-full px-2.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Mensagem de erro vinda da URL (?erro=...). */
export function Flash({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[20px] border-2 border-[#b00020] bg-paper px-5 py-4 text-sm font-medium text-[#b00020]"
    >
      {message}
    </p>
  );
}

/** Aviso em cartão inteiro, para estados vazios. */
export function Notice({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-col gap-4 rounded-card bg-paper p-7">
      <span className="inline-flex min-h-[30px] items-center self-start rounded-full bg-sun px-3.5 text-xs font-semibold tracking-wider uppercase">
        {tag}
      </span>
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">
        {title}
      </h1>
      <div className="max-w-[62ch] text-[15px] leading-relaxed text-muted">
        {children}
      </div>
    </main>
  );
}

export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
