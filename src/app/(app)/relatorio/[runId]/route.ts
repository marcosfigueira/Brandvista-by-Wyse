import { NextResponse } from "next/server";
import type { SiteAudit } from "@/lib/report/audit";
import { buildReportPptx } from "@/lib/report/pptx";
import type { ReportContent, ReportData } from "@/lib/report/types";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

/** Nome de arquivo sem acentos nem caracteres que atrapalhem o download. */
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

/** Baixa o relatório de uma rodada em PowerPoint. As regras de acesso do banco decidem quem pode ler. */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Entre no sistema para baixar o relatório.", { status: 401 });

  const { runId } = await params;
  const { data: row } = await session.supabase
    .from("reports")
    .select("status, data, audit, content")
    .eq("run_id", runId)
    .maybeSingle();
  if (!row || row.status !== "pronto" || !row.data || !row.content) {
    return new NextResponse("O relatório desta rodada ainda não está pronto.", { status: 404 });
  }

  const data = row.data as ReportData;
  try {
    const buffer = await buildReportPptx(data, (row.audit as SiteAudit | null) ?? null, row.content as ReportContent);
    const name = `BrandVista-${slug(data.client.name)}-${data.run.createdAt.slice(0, 10)}.pptx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao montar o PowerPoint:", error instanceof Error ? error.message : error);
    return new NextResponse("Não foi possível montar o arquivo do relatório.", { status: 500 });
  }
}
