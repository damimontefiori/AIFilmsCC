import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/serialize";
import type { AgentMessageDTO, EditProposal } from "@/lib/dto";

type Row = { id: string; role: string; content: string; proposals: string; createdAt: Date };

function toDTO(m: Row): AgentMessageDTO {
  return {
    id: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    proposals: parseJson<EditProposal[]>(m.proposals, []),
    createdAt: m.createdAt.toISOString(),
  };
}

export async function getAgentMessages(projectId: string): Promise<AgentMessageDTO[]> {
  const rows = await prisma.agentMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDTO);
}

export async function addAgentMessage(
  projectId: string,
  role: "user" | "assistant",
  content: string,
  proposals: EditProposal[] = [],
): Promise<AgentMessageDTO> {
  const m = await prisma.agentMessage.create({
    data: { projectId, role, content, proposals: JSON.stringify(proposals) },
  });
  return toDTO(m);
}

export async function resetAgent(projectId: string): Promise<void> {
  await prisma.agentMessage.deleteMany({ where: { projectId } });
}
