import { prisma } from "@/lib/db";
import { parseJson, toJson, type ReferenceImage } from "@/lib/serialize";
import type { CharacterDTO } from "@/lib/dto";

type CharacterRow = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  canonicalDescription: string;
  personality: string;
  referenceImages: string;
  locked: boolean;
  notes: string;
  order: number;
};

export function toCharacterDTO(c: CharacterRow): CharacterDTO {
  return {
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    role: c.role,
    canonicalDescription: c.canonicalDescription,
    personality: c.personality,
    referenceImages: parseJson<ReferenceImage[]>(c.referenceImages, []),
    locked: c.locked,
    notes: c.notes,
    order: c.order,
  };
}

export async function listCharacters(projectId: string): Promise<CharacterDTO[]> {
  const rows = await prisma.character.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return rows.map(toCharacterDTO);
}

export function getCharacter(id: string) {
  return prisma.character.findUnique({ where: { id } });
}

/** Añade una imagen de referencia al array JSON del personaje. */
export async function addReferenceImage(
  characterId: string,
  ref: ReferenceImage,
): Promise<ReferenceImage[]> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new Error("Personaje no encontrado");
  const refs = parseJson<ReferenceImage[]>(character.referenceImages, []);
  refs.push(ref);
  await prisma.character.update({
    where: { id: characterId },
    data: { referenceImages: toJson(refs) },
  });
  return refs;
}

/** Elimina una imagen de referencia por su path. */
export async function removeReferenceImage(
  characterId: string,
  path: string,
): Promise<ReferenceImage[]> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new Error("Personaje no encontrado");
  const refs = parseJson<ReferenceImage[]>(character.referenceImages, []).filter(
    (r) => r.path !== path,
  );
  await prisma.character.update({
    where: { id: characterId },
    data: { referenceImages: toJson(refs) },
  });
  return refs;
}
