"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

// Bloqueo de scroll del body por CONTEO de referencias: con varios modales
// apilados (galería + lightbox), el body queda bloqueado mientras haya ≥1 abierto
// y se restaura solo cuando se cierran todos. Evita el bug de "scroll perdido".
let bodyLockCount = 0;
function lockBodyScroll() {
  if (bodyLockCount === 0) document.body.style.overflow = "hidden";
  bodyLockCount += 1;
}
function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) document.body.style.overflow = "";
}

/** Ventana flotante reutilizable (portal + backdrop + Esc + scroll interno). */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // onClose vía ref para que el efecto de bloqueo dependa SOLO de `open`
  // (si dependiera de onClose, que cambia cada render, se re-ejecutaría y
  // descompensaría el conteo de bloqueos).
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-2xl",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Imagen que se amplía al hacer click (lightbox). `src` es la URL ya resuelta.
 * `alt`/`caption` opcionales; `className` estiliza la miniatura.
 */
export function ImageZoom({
  src,
  alt = "",
  caption,
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  caption?: React.ReactNode;
  className?: string;
  imgClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group relative block w-full overflow-hidden", className)}
        title="Ampliar"
      >
        <img src={src} alt={alt} className={cn("h-full w-full object-cover", imgClassName)} />
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={caption ?? alt} className="max-w-5xl">
        <img src={src} alt={alt} className="mx-auto max-h-[80vh] w-auto rounded-md object-contain" />
      </Modal>
    </>
  );
}
