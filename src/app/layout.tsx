import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Activity } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Film con IA",
  description: "Genera películas cortas con IA — de la idea al montaje final.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Clapperboard className="h-5 w-5 text-primary" />
              <span>Film con IA</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              >
                Proyectos
              </Link>
              <Link
                href="/health"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <Activity className="h-4 w-4" />
                Estado
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
