import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/projects";
import { PipelineNav } from "@/components/pipeline/pipeline-nav";
import { FilmAgentPanel } from "@/components/pipeline/film-agent-panel";
import { Badge } from "@/components/ui/misc";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Proyectos
          </Link>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {project.genre && <Badge tone="info">{project.genre}</Badge>}
            {project.tone && <Badge>{project.tone}</Badge>}
            <Badge>{project.aspectRatio}</Badge>
            <Badge>{project.targetDurationSec}s</Badge>
            <Badge>{project.language.toUpperCase()}</Badge>
          </div>
        </div>
      </div>

      <PipelineNav projectId={project.id} />

      <div>{children}</div>

      <FilmAgentPanel projectId={project.id} />
    </div>
  );
}
