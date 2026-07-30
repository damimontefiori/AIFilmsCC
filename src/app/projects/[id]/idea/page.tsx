import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { toProjectDTO } from "@/lib/dto";
import { IdeaEditor } from "@/components/pipeline/idea-editor";

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return <IdeaEditor project={toProjectDTO(project)} />;
}
