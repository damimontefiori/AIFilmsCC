import { NextResponse } from "next/server";
import { loadSettings, getOverride, saveSettings } from "@/lib/settings";
import { SETTING_KEYS, SECRET_KEYS } from "@/lib/provider-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(v: string): string {
  return v.length <= 4 ? "••••" : "••••" + v.slice(-4);
}

type ValueInfo = {
  secret: boolean;
  source: "db" | "env" | "none";
  hasValue: boolean;
  value: string; // enmascarado si es secreto; nunca la key en claro
};

function buildValues(): Record<string, ValueInfo> {
  const out: Record<string, ValueInfo> = {};
  for (const key of SETTING_KEYS) {
    const override = getOverride(key);
    const envRaw = process.env[key];
    const envVal = envRaw && envRaw.trim() !== "" ? envRaw.trim() : undefined;
    const raw = override ?? envVal;
    const secret = SECRET_KEYS.has(key);
    out[key] = {
      secret,
      source: override ? "db" : envVal ? "env" : "none",
      hasValue: !!raw,
      value: raw ? (secret ? mask(raw) : raw) : "",
    };
  }
  return out;
}

export async function GET() {
  await loadSettings(true);
  return NextResponse.json({ values: buildValues() });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const incoming = (body?.values ?? {}) as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const [key, val] of Object.entries(incoming)) {
    if (!SETTING_KEYS.includes(key)) continue; // whitelist
    if (typeof val !== "string") continue;
    if (val.includes("••••")) continue; // no guardar el valor enmascarado
    clean[key] = val;
  }
  await saveSettings(clean);
  return NextResponse.json({ ok: true, values: buildValues() });
}
