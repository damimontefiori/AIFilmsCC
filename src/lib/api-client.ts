// Helper de fetch para client components. Lanza Error con el mensaje del server.

export async function jsonFetch<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Error ${res.status}`);
  }
  return data as T;
}
