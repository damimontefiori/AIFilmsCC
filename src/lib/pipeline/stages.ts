export type StageKey =
  | "idea"
  | "script"
  | "characters"
  | "locations"
  | "shots"
  | "packages"
  | "assembly";

export type Stage = {
  key: StageKey;
  label: string;
  path: string; // sufijo relativo a /projects/[id]
  description: string;
};

export const STAGES: Stage[] = [
  { key: "idea", label: "Idea", path: "idea", description: "Idea y concepto" },
  { key: "script", label: "Guion", path: "script", description: "Guion estructurado" },
  { key: "characters", label: "Personajes", path: "characters", description: "Mapa visual y consistencia" },
  { key: "locations", label: "Escenarios", path: "locations", description: "Ambientes reutilizables" },
  { key: "shots", label: "Planos", path: "shots", description: "Desglose en clips" },
  { key: "packages", label: "Paquetes", path: "packages", description: "Generación por clip" },
  { key: "assembly", label: "Montaje", path: "assembly", description: "Importar y exportar" },
];

/** Etapas habilitadas según la fase construida (se amplía por fase). */
export const ENABLED_STAGES: Record<StageKey, boolean> = {
  idea: true,
  script: true,
  characters: true,
  locations: true,
  shots: true,
  packages: true,
  assembly: true,
};
