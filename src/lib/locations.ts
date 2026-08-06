import { prisma } from "@/lib/db";
import type { LocationDTO, EncuadreDTO } from "@/lib/dto";
import { readKeyframeFiles, versionsFromFiles } from "@/lib/media/versions";

type EncuadreRow = {
  id: string;
  locationId: string;
  label: string;
  framingPrompt: string;
  imagePath: string | null;
  order: number;
};

type LocationRow = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imagePath: string | null;
  locked: boolean;
  order: number;
  encuadres?: EncuadreRow[];
};

/** Fallback de historial cuando no se pasa el listado del disco: solo la actual. */
function soloActual(imagePath: string | null): string[] {
  return imagePath ? [imagePath] : [];
}

export function toEncuadreDTO(e: EncuadreRow, imageVersions?: string[]): EncuadreDTO {
  return {
    id: e.id,
    locationId: e.locationId,
    label: e.label,
    framingPrompt: e.framingPrompt,
    imagePath: e.imagePath,
    order: e.order,
    imageVersions: imageVersions ?? soloActual(e.imagePath),
  };
}

export function toLocationDTO(l: LocationRow, projectFiles?: string[]): LocationDTO {
  const encuadres = (l.encuadres ?? []).map((e) =>
    toEncuadreDTO(
      e,
      projectFiles
        ? versionsFromFiles(projectFiles, l.projectId, `enc-${e.id}-`, e.imagePath)
        : undefined,
    ),
  );
  return {
    id: l.id,
    projectId: l.projectId,
    name: l.name,
    description: l.description,
    imagePath: l.imagePath,
    locked: l.locked,
    order: l.order,
    encuadres,
    imageVersions: projectFiles
      ? versionsFromFiles(projectFiles, l.projectId, `loc-${l.id}-`, l.imagePath)
      : soloActual(l.imagePath),
  };
}

export async function listLocations(projectId: string): Promise<LocationDTO[]> {
  const [rows, files] = await Promise.all([
    prisma.location.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: { encuadres: { orderBy: { order: "asc" } } },
    }),
    readKeyframeFiles(projectId),
  ]);
  return rows.map((l) => toLocationDTO(l, files));
}

export function getLocation(id: string) {
  return prisma.location.findUnique({ where: { id } });
}

export function getEncuadre(id: string) {
  return prisma.encuadre.findUnique({ where: { id }, include: { location: true } });
}
