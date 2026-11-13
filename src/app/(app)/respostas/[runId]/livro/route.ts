import { NextResponse } from "next/server";
import { ANALYZER_VERSION, type Analysis } from "@/lib/analysis/types";
import { buildResponsesBook, type BookResponse } from "@/lib/report/book";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "marca"
  );
}

type Row = {
  engine: string;
  model: string;
  repetition: number;
  created_at: string;
  search_enabled: boolean;
  search_executed: boolean | null;
  status: string;
  error_message: string | null;
  raw_text: string | null;
  sources: BookResponse["sources"] | null;
  prompt_id: string;
  prompts: { text: string; kind: string; version: number } | null;
  analyses: { analyzer_version: string; result: Analysis }[] | null;
};

/** Baixa todas as respostas de uma rodada em um único arquivo HTML, organizado como um livro. */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Entre no sistema para baixar as respostas.", { status: 401 });
  const { runId } = await params;

  const { data: run } = await session.supabase
    .from("runs")
    .select("id, kind, created_at, clients(name)")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return new NextResponse("Rodada não encontrada.", { status: 404 });

  const { data, error } = await session.supabase
    .from("responses")
    .select(
      "engine, model, repetition, created_at, search_enabled, search_executed, status, error_message, raw_text, sources, prompt_id, prompts(text, kind, version), analyses(analyzer_version, result)",
    )
    .eq("run_id", runId)
    .order("created_at")
    .limit(5000);
  if (error) {
    console.error("Erro ao carregar as respostas:", error.message);
    return new NextResponse("Não foi possível carregar as respostas.", { status: 500 });
  }

  const responses: BookResponse[] = ((data ?? []) as unknown as Row[])
    .filter((row) => row.prompts)
    .map((row) => ({
      engine: row.engine,
      repetition: row.repetition,
      model: row.model,
      createdAt: row.created_at,
      searchEnabled: row.search_enabled,
      searchExecuted: row.search_executed,
      ok: row.status === "ok",
      errorMessage: row.error_message,
      text: row.raw_text,
      sources: Array.isArray(row.sources) ? row.sources : [],
      promptId: row.prompt_id,
      question: row.prompts!.text,
      kind: row.prompts!.kind,
      version: row.prompts!.version,
      analysis: (row.analyses ?? []).find((item) => item.analyzer_version === ANALYZER_VERSION)?.result ?? null,
    }));
  if (responses.length === 0) return new NextResponse("Esta rodada não tem respostas gravadas.", { status: 404 });

  const clientName = (run.clients as unknown as { name: string } | null)?.name ?? "Marca";
  const html = buildResponsesBook({
    clientName,
    runDate: run.created_at as string,
    runKind: run.kind as string,
    responses,
  });
  const name = `BrandVista-respostas-${slug(clientName)}-${(run.created_at as string).slice(0, 10)}.html`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
