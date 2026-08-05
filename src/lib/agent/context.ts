import { getProject } from "@/lib/projects";
import { listCharacters } from "@/lib/characters";
import { listLocations } from "@/lib/locations";
import { getScenesWithShots } from "@/lib/shots";
import { parseJson } from "@/lib/serialize";
import type { ScriptDoc } from "@/lib/pipeline/types";

const t = (s: string | null | undefined, n = 400) =>
  s ? (s.length > n ? s.slice(0, n) + "…" : s) : "";

/**
 * Ensambla un snapshot FRESCO y compacto de todo el film (con ids para poder
 * referenciar/editar entidades concretas). Se construye en cada mensaje del
 * copiloto, así el contexto nunca queda desincronizado con la DB.
 */
export async function buildFilmContext(projectId: string): Promise<string> {
  const p = await getProject(projectId);
  if (!p) return "No hay proyecto.";
  const [chars, locs, scenes] = await Promise.all([
    listCharacters(projectId),
    listLocations(projectId),
    getScenesWithShots(projectId),
  ]);

  const L: string[] = [];
  L.push(`# CONTEXTO DEL FILM (project id ${p.id})`);
  L.push(
    `Estado: ${p.status} · Idioma: ${p.language} · Formato: ${p.aspectRatio} · Duración objetivo: ${p.targetDurationSec}s`,
  );

  L.push(`\n## PROYECTO — target "project", id=null`);
  L.push(`- title: ${t(p.title, 140)}`);
  L.push(`- idea: ${t(p.idea, 600)}`);
  L.push(`- logline: ${t(p.logline, 400)}`);
  L.push(`- synopsis: ${t(p.synopsis, 900)}`);
  L.push(`- genre: ${p.genre}`);
  L.push(`- tone: ${p.tone}`);
  L.push(`- styleBible: ${t(p.styleBible, 900)}`);

  const doc = parseJson<ScriptDoc | null>(p.scriptJson, null);
  if (doc && Array.isArray(doc.scenes) && doc.scenes.length > 0) {
    L.push(
      `\n## GUION — beats EDITABLES: target "script-beat", id "sceneIndex:beatIndex", field: line|text|character|parenthetical`,
    );
    doc.scenes.forEach((sc, si) => {
      L.push(`- Escena ${si}: ${t(sc.heading || sc.location, 140)}${sc.summary ? ` — ${t(sc.summary, 180)}` : ""}`);
      sc.beats.forEach((b, bi) => {
        if (b.type === "dialogue") {
          L.push(
            `  - beat ${si}:${bi} [dialogue] ${b.character}${b.parenthetical ? ` (${b.parenthetical})` : ""}: line: "${t(b.line, 240)}"`,
          );
        } else {
          L.push(`  - beat ${si}:${bi} [action]: text: ${t(b.text, 240)}`);
        }
      });
    });
  } else if (p.scriptMarkdown) {
    L.push(`\n## GUION (aún sin estructura editable)`);
    L.push(t(p.scriptMarkdown, 3000));
  }

  L.push(`\n## PERSONAJES — target "character"`);
  if (chars.length === 0) L.push("(ninguno)");
  for (const c of chars) {
    L.push(
      `- id=${c.id} · ${c.name}${c.role ? ` (${c.role})` : ""}${c.locked ? " [BLOQUEADO]" : ""}` +
        ` · canonicalDescription: ${t(c.canonicalDescription, 320)}` +
        (c.personality ? ` · personality: ${t(c.personality, 160)}` : ""),
    );
  }

  L.push(`\n## ESCENARIOS — target "location"`);
  if (locs.length === 0) L.push("(ninguno)");
  for (const l of locs) {
    L.push(
      `- id=${l.id} · ${l.name} · description: ${t(l.description, 320)}` +
        `${l.imagePath ? " [con imagen]" : ""} · encuadres: ${l.encuadres.length}`,
    );
  }

  L.push(`\n## ESCENAS Y PLANOS — escena target "scene"; plano target "shot"`);
  if (scenes.length === 0) L.push("(sin desglose aún)");
  for (const s of scenes) {
    L.push(
      `- ESCENA id=${s.id} · #${s.order} · heading: ${t(s.heading, 140)} · summary: ${t(s.summary, 260)}`,
    );
    for (const sh of s.shots) {
      L.push(
        `  - PLANO id=${sh.id} · #${sh.order} · estado:${sh.status} · render:${sh.renderMode}` +
          ` · actionDescription: ${t(sh.actionDescription, 240)}` +
          (sh.keyframeMoment ? ` · keyframeMoment: ${t(sh.keyframeMoment, 140)}` : "") +
          (sh.cameraNotes ? ` · cameraNotes: ${t(sh.cameraNotes, 140)}` : "") +
          (sh.dialogueOrVO ? ` · dialogueOrVO: ${t(sh.dialogueOrVO, 160)}` : "") +
          ` · characters:[${sh.characters.join(", ")}]`,
      );
    }
  }

  return L.join("\n");
}
