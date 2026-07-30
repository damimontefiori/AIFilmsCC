// Idiomas de contenido soportados (client-safe: sin imports de servidor).

export type Language = {
  code: string;
  label: string; // etiqueta en la UI
  promptName: string; // nombre para instruir al modelo
};

export const LANGUAGES: Language[] = [
  { code: "es", label: "Español", promptName: "español (España)" },
  { code: "es-419", label: "Español latino", promptName: "español latinoamericano (neutro)" },
  { code: "en", label: "Inglés", promptName: "inglés" },
  { code: "pt", label: "Portugués", promptName: "portugués" },
  { code: "fr", label: "Francés", promptName: "francés" },
];

/** Nombre del idioma para inyectar en los prompts del modelo. */
export function promptLangName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.promptName ?? "español";
}
