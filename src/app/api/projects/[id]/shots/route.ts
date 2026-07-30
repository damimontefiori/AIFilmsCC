import { NextResponse } from "next/server";
import { getScenesWithShots } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await getScenesWithShots(id));
}
