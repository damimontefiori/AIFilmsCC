import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { toProjectDTO } from "@/lib/dto";
import { ScriptEditor } from "@/components/pipeline/script-editor";

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return <ScriptEditor project={toProjectDTO(project)} />;
}
