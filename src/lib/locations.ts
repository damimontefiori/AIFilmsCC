import { prisma } from "@/lib/db";
import type { LocationDTO } from "@/lib/dto";

type LocationRow = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imagePath: string | null;
  locked: boolean;
  order: number;
};

export function toLocationDTO(l: LocationRow): LocationDTO {
  return {
    id: l.id,
    projectId: l.projectId,
    name: l.name,
    description: l.description,
    imagePath: l.imagePath,
    locked: l.locked,
    order: l.order,
  };
}

export async function listLocations(projectId: string): Promise<LocationDTO[]> {
  const rows = await prisma.location.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return rows.map(toLocationDTO);
}

export function getLocation(id: string) {
  return prisma.location.findUnique({ where: { id } });
}
