import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { listCharacters } from "@/lib/characters";
import { CharactersManager } from "@/components/pipeline/characters-manager";

export const dynamic = "force-dynamic";

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const characters = await listCharacters(id);
  return (
    <CharactersManager
      projectId={id}
      initial={characters}
      hasScript={Boolean(project.scriptMarkdown)}
    />
  );
}
