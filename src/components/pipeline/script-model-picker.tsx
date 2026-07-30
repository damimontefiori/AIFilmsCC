"use client";

import {
  SCRIPT_MODELS,
  scriptModelById,
} from "@/lib/pipeline/script-models";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";

/** Selector del modelo para el guion + campo de API Key (si aplica). */
export function ScriptModelPicker({
  model,
  setModel,
  apiKey,
  setApiKey,
  hint,
}: {
  model: string;
  setModel: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  hint?: string;
}) {
  const opt = scriptModelById(model);
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Modelo del guion</Label>
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {SCRIPT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          {opt?.needsApiKey && (
            <div>
              <Label>API Key (AI Studio)</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza…"
              />
            </div>
          )}
        </div>
        {opt?.note && <p className="text-xs text-muted">{opt.note}</p>}
      </CardContent>
    </Card>
  );
}
