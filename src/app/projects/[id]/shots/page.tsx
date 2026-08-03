import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { getScenesWithShots } from "@/lib/shots";
import { listCharacters } from "@/lib/characters";
import { listLocations } from "@/lib/locations";
import { ShotsBoard } from "@/components/pipeline/shots-board";

export const dynamic = "force-dynamic";

export default async function ShotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const scenes = await getScenesWithShots(id);
  const chars = await listCharacters(id);
  const locations = await listLocations(id);
  return (
    <ShotsBoard
      projectId={id}
      initial={scenes}
      hasScript={Boolean(project.scriptJson)}
      characters={chars.map((c) => ({ id: c.id, name: c.name }))}
      locations={locations}
    />
  );
}
