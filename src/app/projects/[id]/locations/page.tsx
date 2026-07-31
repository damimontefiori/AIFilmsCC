import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { listLocations } from "@/lib/locations";
import { LocationsManager } from "@/components/pipeline/locations-manager";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const locations = await listLocations(id);
  return (
    <LocationsManager
      projectId={id}
      initial={locations}
      hasScript={Boolean(project.scriptMarkdown)}
    />
  );
}
