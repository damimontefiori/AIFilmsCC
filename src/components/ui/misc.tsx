import * as React from "react";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveState } from "@/lib/use-autosave";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "bg-surface-2 text-muted",
    success: "bg-success/15 text-success",
    warning: "bg-primary/15 text-primary",
    danger: "bg-danger/15 text-danger",
    info: "bg-accent/15 text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

/** Indicador de autoguardado uniforme en todas las etapas. */
export function SaveIndicator({
  state,
  className,
}: {
  state: SaveState;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1 text-[11px] text-muted", className)}>
      {state === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
        </>
      ) : state === "saved" ? (
        <>
          <Check className="h-3 w-3 text-success" /> Guardado
        </>
      ) : (
        <>Autoguardado activo</>
      )}
    </span>
  );
}
