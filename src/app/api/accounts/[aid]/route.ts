import { NextResponse } from "next/server";
import { updateAccount, deleteAccount, listAccounts } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ aid: string }> };

const EDITABLE = new Set(["label", "email", "dailyQuota", "active"]);

export async function PATCH(req: Request, { params }: Ctx) {
  const { aid } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) data[k] = v;
  }
  await updateAccount(aid, data);
  return NextResponse.json(await listAccounts());
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { aid } = await params;
  await deleteAccount(aid);
  return NextResponse.json(await listAccounts());
}
