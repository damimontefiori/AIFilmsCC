import { NextResponse } from "next/server";
import { testTarget } from "@/lib/model-runner";
import { targetById } from "@/lib/provider-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ping a un proveedor concreto. Para imagen genera 1 imagen simple (consume cuota).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const target = String(body?.target || "");
  if (!targetById(target)) {
    return NextResponse.json({ error: "Objetivo inválido" }, { status: 400 });
  }
  const res = await testTarget(target);
  return NextResponse.json(res);
}
