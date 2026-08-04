import { prisma } from "@/lib/db";

// Caché en memoria de los overrides de proveedor (persiste entre requests dentro
// del mismo proceso del server). `config.ts` la consulta de forma SÍNCRONA vía
// getOverride(); las rutas y los proveedores llaman a loadSettings() (async)
// para asegurar que esté cargada antes de construir las cadenas de failover.
let cache: Record<string, string> | null = null;

/** Carga (o refresca con force) los overrides desde la DB a la caché. */
export async function loadSettings(force = false): Promise<Record<string, string>> {
  if (cache && !force) return cache;
  try {
    const rows = await prisma.providerSetting.findMany();
    cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    // Si la tabla aún no existe (schema sin aplicar), degradar a "sin overrides".
    cache = {};
  }
  return cache;
}

/** Override efectivo (sync) para una clave; undefined si no hay o está vacío. */
export function getOverride(name: string): string | undefined {
  const v = cache?.[name];
  return v && v.trim() !== "" ? v : undefined;
}

/**
 * Guarda overrides: upsert si el valor no está vacío, y BORRA la clave si viene
 * vacía (para volver a caer en la variable de entorno). Refresca la caché.
 */
export async function saveSettings(values: Record<string, string>): Promise<void> {
  const ops = [];
  for (const [key, raw] of Object.entries(values)) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "") {
      ops.push(prisma.providerSetting.deleteMany({ where: { key } }));
    } else {
      ops.push(
        prisma.providerSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);
  await loadSettings(true);
}
