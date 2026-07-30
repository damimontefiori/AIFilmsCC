"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Clapperboard } from "lucide-react";
import { jsonFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export type ProjectListItem = {
  id: string;
  title: string;
  logline: string;
  status: string;
  genre: string;
  aspectRatio: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: any }> = {
  draft: { label: "Borrador", tone: "default" },
  idea: { label: "Idea", tone: "default" },
  concept: { label: "Concepto", tone: "info" },
  script: { label: "Guion", tone: "warning" },
  characters: { label: "Personajes", tone: "warning" },
  shots: { label: "Planos", tone: "warning" },
  assembled: { label: "Montado", tone: "success" },
};

export function ProjectsGrid({ projects }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string, title: string) {
    if (!confirm(`¿Eliminar "${title}" y toda su media? Esta acción no se puede deshacer.`))
      return;
    setDeleting(id);
    try {
      await jsonFetch(`/api/projects/${id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      // noop
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const status = STATUS_LABEL[p.status] || STATUS_LABEL.draft;
        return (
          <Card key={p.id} className="group relative transition-colors hover:border-primary/50">
            <Link href={`/projects/${p.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-primary" />
                  <span className="line-clamp-1 font-semibold">{p.title}</span>
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-muted">
                  {p.logline || "Sin logline todavía."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {p.genre && <Badge>{p.genre}</Badge>}
                  <Badge>{p.aspectRatio}</Badge>
                </div>
              </CardContent>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => remove(p.id, p.title)}
              disabled={deleting === p.id}
              title="Eliminar proyecto"
            >
              {deleting === p.id ? <Spinner /> : <Trash2 className="h-4 w-4 text-danger" />}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
