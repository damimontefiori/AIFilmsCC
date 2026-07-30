"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/misc";

type Health = {
  text: {
    narrative: { configured: boolean; deployment?: string };
    structured: { label: string; deployment: string }[];
  };
  image: {
    gemini: { label: string; model: string }[];
    flux: { label: string; model: string }[];
  };
  audio: { deferred: boolean };
  media: {
    ffmpeg: { available: boolean; version?: string; error?: string };
    ffprobe: { available: boolean; version?: string; error?: string };
  };
};

function Ok({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-success" />
  ) : (
    <XCircle className="h-4 w-4 text-danger" />
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [textResult, setTextResult] = useState<any>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [imgResult, setImgResult] = useState<any>(null);
  const [imgLoading, setImgLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/health");
    setHealth(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function testText() {
    setTextLoading(true);
    setTextResult(null);
    const res = await fetch("/api/health/text", { method: "POST" });
    setTextResult(await res.json());
    setTextLoading(false);
  }

  async function testImage() {
    setImgLoading(true);
    setImgResult(null);
    const res = await fetch("/api/health/image", { method: "POST" });
    setImgResult(await res.json());
    setImgLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estado de proveedores</h1>
          <p className="text-sm text-muted">
            Configuración de claves, binarios de media y pruebas en vivo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
          Recargar
        </Button>
      </div>

      {loading || !health ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Cargando…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Texto (Azure OpenAI)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Ok ok={health.text.narrative.configured} />
                <span>Narrativa (razonamiento)</span>
                {health.text.narrative.deployment && (
                  <Badge>{health.text.narrative.deployment}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Ok ok={health.text.structured.length > 0} />
                <span>Estructurado / JSON</span>
                {health.text.structured.map((s) => (
                  <Badge key={s.label}>{s.label}</Badge>
                ))}
              </div>
              <div className="pt-2">
                <Button size="sm" variant="secondary" onClick={testText} disabled={textLoading}>
                  {textLoading ? <Spinner /> : null} Probar en vivo
                </Button>
              </div>
              {textResult && (
                <pre className="mt-2 overflow-auto rounded-md bg-surface-2 p-2 text-xs">
                  {JSON.stringify(textResult, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Ok ok={health.image.gemini.length > 0} />
                <span>Gemini (primario)</span>
                {health.image.gemini.map((s) => (
                  <Badge key={s.label} tone="info">{s.label}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Ok ok={health.image.flux.length > 0} />
                <span>FLUX.2-pro (fallback)</span>
                {health.image.flux.map((s) => (
                  <Badge key={s.label}>{s.label}</Badge>
                ))}
              </div>
              <div className="pt-2">
                <Button size="sm" variant="secondary" onClick={testImage} disabled={imgLoading}>
                  {imgLoading ? <Spinner /> : null} Probar en vivo (consume cuota)
                </Button>
              </div>
              {imgResult?.ok && (
                <div className="mt-2 space-y-1">
                  <Badge tone="success">
                    {imgResult.provider} · {Math.round(imgResult.bytes / 1024)} KB
                  </Badge>
                  <img
                    src={imgResult.preview}
                    alt="test"
                    className="mt-1 h-32 w-32 rounded-md border border-border object-cover"
                  />
                </div>
              )}
              {imgResult && !imgResult.ok && (
                <pre className="mt-2 overflow-auto rounded-md bg-surface-2 p-2 text-xs text-danger">
                  {imgResult.error}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Media (ffmpeg)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Ok ok={health.media.ffmpeg.available} />
                <span className="truncate">
                  {health.media.ffmpeg.version || health.media.ffmpeg.error || "ffmpeg"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Ok ok={health.media.ffprobe.available} />
                <span className="truncate">
                  {health.media.ffprobe.version || health.media.ffprobe.error || "ffprobe"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audio</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">
              Suno / ElevenLabs — diferido a una fase posterior.
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
