import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewProjectForm } from "@/components/pipeline/new-project-form";

export default function NewProjectPage() {
  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Proyectos
      </Link>
      <NewProjectForm />
    </div>
  );
}
