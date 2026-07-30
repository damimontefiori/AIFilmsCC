import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getShot, toShotDTO } from "@/lib/shots";
import { incrementUsage, decrementUsage, listAccounts } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sid: string }> };

// Marca un plano como generado y contabiliza la cuota de la cuenta usada.
export async function POST(req: Request, { params }: Ctx) {
  const { sid } = await params;
  const body = await req.json().catch(() => ({}));
  const shot = await getShot(sid);
  if (!shot) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const wasGenerated = shot.status === "generated";
  const oldAccount = shot.assignedAccountId;
  const newAccount: string | null = body.accountId ?? oldAccount ?? null;

  if (wasGenerated && oldAccount && oldAccount !== newAccount) {
    await decrementUsage(oldAccount);
  }
  if (newAccount && (!wasGenerated || oldAccount !== newAccount)) {
    await incrementUsage(newAccount);
  }

  const updated = await prisma.shot.update({
    where: { id: sid },
    data: { status: "generated", assignedAccountId: newAccount },
  });
  return NextResponse.json({ shot: toShotDTO(updated), accounts: await listAccounts() });
}

// Deshace la marca de generado (revierte la cuota).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { sid } = await params;
  const shot = await getShot(sid);
  if (!shot) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (shot.status === "generated" && shot.assignedAccountId) {
    await decrementUsage(shot.assignedAccountId);
  }
  const updated = await prisma.shot.update({
    where: { id: sid },
    data: { status: shot.keyframePath ? "package_ready" : "planned" },
  });
  return NextResponse.json({ shot: toShotDTO(updated), accounts: await listAccounts() });
}
