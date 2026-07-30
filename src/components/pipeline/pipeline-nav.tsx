"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { STAGES, ENABLED_STAGES } from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";

export function PipelineNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-[var(--radius)] border border-border bg-surface p-1">
      {STAGES.map((stage, i) => {
        const href = `/projects/${projectId}/${stage.path}`;
        const active = pathname === href;
        const enabled = ENABLED_STAGES[stage.key];
        const inner = (
          <span
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : enabled
                  ? "text-foreground hover:bg-surface-2"
                  : "cursor-not-allowed text-muted/50",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                active ? "bg-primary-foreground/20" : "bg-surface-2",
              )}
            >
              {i + 1}
            </span>
            {stage.label}
            {!enabled && <Lock className="h-3 w-3" />}
          </span>
        );
        return enabled ? (
          <Link key={stage.key} href={href}>
            {inner}
          </Link>
        ) : (
          <span key={stage.key} title="Disponible en una fase próxima">
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
