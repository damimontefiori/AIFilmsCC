import { prisma } from "@/lib/db";
import { projectDir } from "@/lib/paths";
import { promises as fs } from "node:fs";

export function listProjects() {
  return prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
}

export function getProject(id: string) {
  return prisma.project.findUnique({ where: { id } });
}

export async function getProjectOr404(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Proyecto no encontrado");
  return p;
}

export type CreateProjectInput = {
  title?: string;
  idea: string;
  language?: string;
  aspectRatio?: string;
  targetDurationSec?: number;
  genre?: string;
  tone?: string;
};

export function createProject(input: CreateProjectInput) {
  return prisma.project.create({
    data: {
      title: input.title?.trim() || "Proyecto sin título",
      idea: input.idea.trim(),
      language: input.language || "es",
      aspectRatio: input.aspectRatio || "16:9",
      targetDurationSec: input.targetDurationSec ?? 60,
      genre: input.genre || "",
      tone: input.tone || "",
      status: "idea",
    },
  });
}

export function updateProject(
  id: string,
  data: Record<string, unknown>,
) {
  return prisma.project.update({ where: { id }, data });
}

export async function deleteProject(id: string) {
  await prisma.project.delete({ where: { id } });
  // Borra la media del proyecto (best-effort).
  await fs.rm(projectDir(id), { recursive: true, force: true }).catch(() => {});
}
