"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, AlertCircle } from "lucide-react";
import { jsonFetch } from "@/lib/api-client";
import { LANGUAGES } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";

export function NewProjectForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("es");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!idea.trim()) {
      setError("Escribe una idea para empezar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await jsonFetch<{ id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          idea,
          title,
          language,
          aspectRatio,
          targetDurationSec: duration,
        }),
      });
      router.push(`/projects/${project.id}/idea`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Nuevo proyecto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Tu idea</Label>
          <Textarea
            className="min-h-32"
            placeholder="Ej: un faro solitario donde el guardián descubre que la luz habla con el mar…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            autoFocus
          />
          <p className="mt-1 text-xs text-muted">
            Puede ser vaga. La refinarás en el siguiente paso.
          </p>
        </div>
        <div>
          <Label>Título (opcional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Idioma</Label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Formato</Label>
            <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16 (vertical)</option>
              <option value="1:1">1:1</option>
            </Select>
          </div>
          <div>
            <Label>Duración (s)</Label>
            <Input
              type="number"
              min={16}
              max={600}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button onClick={create} disabled={loading} className="w-full">
          {loading ? <Spinner /> : <Wand2 className="h-4 w-4" />} Crear proyecto
        </Button>
      </CardContent>
    </Card>
  );
}
