import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { getAgentMessages, addAgentMessage, resetAgent } from "@/lib/agent/store";
import { runAgent, type AgentModel, type AgentEffort } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // el razonamiento (Sol) puede tardar

type Ctx = { params: Promise<{ id: string }> };

// Historial del copiloto del proyecto.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ messages: await getAgentMessages(id) });
}

// Nuevo turno: ejecuta el agente con el contexto FRESCO del film + el historial.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || "").trim();
  if (!message) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  const model: AgentModel = body?.model === "gemini-3.6-flash" ? "gemini-3.6-flash" : "gpt-5.6-sol";
  const effort: AgentEffort = ["minimal", "low", "medium", "high"].includes(body?.effort)
    ? body.effort
    : "medium";

  const history = (await getAgentMessages(id)).map((m) => ({ role: m.role, content: m.content }));
  const userMessage = await addAgentMessage(id, "user", message);

  try {
    const result = await runAgent({ projectId: id, model, effort, history, message });
    const assistant = await addAgentMessage(id, "assistant", result.reply, result.proposals);
    return NextResponse.json({ userMessage, message: assistant });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const assistant = await addAgentMessage(id, "assistant", `⚠️ No pude responder: ${detail}`);
    return NextResponse.json({ userMessage, message: assistant });
  }
}

// Reinicia la conversación (borra todos los mensajes del proyecto).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await resetAgent(id);
  return NextResponse.json({ ok: true, messages: [] });
}
