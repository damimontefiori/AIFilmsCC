import { prisma } from "@/lib/db";
import type { LocationDTO, EncuadreDTO } from "@/lib/dto";

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

export function toEncuadreDTO(e: EncuadreRow): EncuadreDTO {
  return {
    id: e.id,
    locationId: e.locationId,
    label: e.label,
    framingPrompt: e.framingPrompt,
    imagePath: e.imagePath,
    order: e.order,
  };
}

export function toLocationDTO(l: LocationRow): LocationDTO {
  return {
    id: l.id,
    projectId: l.projectId,
    name: l.name,
    description: l.description,
    imagePath: l.imagePath,
    locked: l.locked,
    order: l.order,
    encuadres: (l.encuadres ?? []).map(toEncuadreDTO),
  };
}

export async function listLocations(projectId: string): Promise<LocationDTO[]> {
  const rows = await prisma.location.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { encuadres: { orderBy: { order: "asc" } } },
  });
  return rows.map(toLocationDTO);
}

export function getLocation(id: string) {
  return prisma.location.findUnique({ where: { id } });
}

export function getEncuadre(id: string) {
  return prisma.encuadre.findUnique({ where: { id }, include: { location: true } });
}
