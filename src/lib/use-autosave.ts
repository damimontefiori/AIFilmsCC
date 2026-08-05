"use client";

import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved";

/**
 * Autoguardado con debounce + estado para el indicador. `schedule(fn)` reprograma
 * el guardado (cancela el pendiente); `fn` persiste (p. ej. un PATCH) y puede
 * lanzar (en ese caso el estado vuelve a "idle" y el llamador muestra el error).
 * Uniforma el patrón que antes vivía suelto en cada componente.
 */
export function useAutosave(delayMs = 700) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  function schedule(fn: () => Promise<void>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        await fn();
        setState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(
          () => setState((s) => (s === "saved" ? "idle" : s)),
          1500,
        );
      } catch {
        setState("idle");
      }
    }, delayMs);
  }

  return { state, schedule };
}
