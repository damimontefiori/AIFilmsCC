import { NextResponse } from "next/server";
import { listAccounts, createAccount } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listAccounts());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "Falta la etiqueta" }, { status: 400 });
  }
  await createAccount({
    label: body.label,
    email: body.email,
    dailyQuota: typeof body.dailyQuota === "number" ? body.dailyQuota : undefined,
  });
  return NextResponse.json(await listAccounts(), { status: 201 });
}
