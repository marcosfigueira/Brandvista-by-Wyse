export function Placeholder({
  title,
  stage,
  text,
}: {
  title: string;
  stage: string;
  text: string;
}) {
  return (
    <main className="flex flex-col gap-4 rounded-card bg-paper p-7">
      <span className="inline-flex min-h-[30px] items-center self-start rounded-full bg-sun px-3.5 text-xs font-semibold tracking-wider uppercase">
        {stage}
      </span>
      <h1 className="text-[32px] font-semibold tracking-tight">{title}</h1>
      <p className="max-w-[60ch] text-[15px] leading-relaxed text-muted">{text}</p>
    </main>
  );
}
