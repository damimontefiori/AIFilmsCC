import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { listCharacters } from "@/lib/characters";
import { listAccounts } from "@/lib/accounts";
import { matchCharacter } from "@/lib/match-characters";
import { PackagesView, type ShotLayers } from "@/components/pipeline/packages-view";

export const dynamic = "force-dynamic";

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [shots, characters, accounts] = await Promise.all([
    getShotsFlat(id),
    listCharacters(id),
    listAccounts(),
  ]);

  // Capas de entrada por plano: personajes en cuadro con su 1ª referencia.
  const layers: Record<string, ShotLayers> = {};
  for (const shot of shots) {
    const chars: { name: string; path: string }[] = [];
    const seen = new Set<string>();
    for (const name of shot.characters) {
      const c = matchCharacter(name, characters);
      if (c && !seen.has(c.id) && c.referenceImages[0]) {
        seen.add(c.id);
        chars.push({ name: c.name, path: c.referenceImages[0].path });
      }
    }
    layers[shot.id] = { characters: chars };
  }

  return (
    <PackagesView
      projectId={id}
      initialShots={shots}
      initialAccounts={accounts}
      layers={layers}
    />
  );
}
