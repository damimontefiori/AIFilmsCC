import Link from "next/link";
import { Plus, Clapperboard } from "lucide-react";
import { listProjects } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectsGrid, type ProjectListItem } from "@/components/pipeline/projects-grid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjects();
  const items: ProjectListItem[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    logline: p.logline,
    status: p.status,
    genre: p.genre,
    aspectRatio: p.aspectRatio,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="text-sm text-muted">
            De una idea vaga a una película corta con IA.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4" /> Nuevo proyecto
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Clapperboard className="h-12 w-12 text-primary" />
            <div>
              <p className="font-medium">Aún no hay proyectos</p>
              <p className="text-sm text-muted">
                Crea tu primer cortometraje a partir de una idea.
              </p>
            </div>
            <Link href="/projects/new">
              <Button>
                <Plus className="h-4 w-4" /> Nuevo proyecto
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ProjectsGrid projects={items} />
      )}
    </div>
  );
}
