import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { applyProposal } from "@/lib/agent/apply";
import { normalizeProposal } from "@/lib/agent/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Aplica UNA propuesta del copiloto (tras la confirmación del usuario en la UI).
// Revalida la propuesta contra la whitelist antes de persistir.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const proposal = normalizeProposal(body?.proposal);
  if (!proposal) return NextResponse.json({ error: "Propuesta inválida" }, { status: 400 });
  try {
    await applyProposal(id, proposal);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
