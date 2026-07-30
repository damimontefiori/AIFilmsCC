import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { prisma } from "@/lib/db";
import { AssemblyView } from "@/components/pipeline/assembly-view";

export const dynamic = "force-dynamic";

export default async function AssemblyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const shots = await getShotsFlat(id);
  const lastExport = await prisma.export.findFirst({
    where: { projectId: id, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  return (
    <AssemblyView
      projectId={id}
      initialShots={shots}
      initialExport={lastExport?.outputPath ?? null}
    />
  );
}
