"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Check,
  Download,
  Plus,
  Trash2,
  CircleCheck,
  RotateCcw,
  AlertCircle,
  Info,
} from "lucide-react";
import type { ShotDTO, AccountDTO } from "@/lib/dto";
import { jsonFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea, Label, Select } from "@/components/ui/field";
import { Badge, Spinner } from "@/components/ui/misc";

function mediaUrl(path: string) {
  return `/api/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function PackagesView({
  projectId,
  initialShots,
  initialAccounts,
}: {
  projectId: string;
  initialShots: ShotDTO[];
  initialAccounts: AccountDTO[];
}) {
  const [shots, setShots] = useState<ShotDTO[]>(initialShots);
  const [accounts, setAccounts] = useState<AccountDTO[]>(initialAccounts);

  const suggestedAccountId = useMemo(() => {
    const c = [...accounts]
      .filter((a) => a.active && a.remainingToday > 0)
      .sort((a, b) => b.remainingToday - a.remainingToday);
    return c[0]?.id ?? null;
  }, [accounts]);

  const generated = shots.filter((s) => s.status === "generated" || s.status === "imported").length;

  function patchShot(shot: ShotDTO) {
    setShots((ss) => ss.map((s) => (s.id === shot.id ? shot : s)));
  }

  return (
    <div className="space-y-5">
      <AccountsPanel accounts={accounts} setAccounts={setAccounts} />

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Paquetes por clip</h3>
        <Badge tone={generated === shots.length && shots.length > 0 ? "success" : "default"}>
          {generated}/{shots.length} generados
        </Badge>
      </div>

      {shots.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            No hay planos. Genera el desglose en la etapa <strong>Planos</strong>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shots.map((shot, i) => (
            <PackageCard
              key={shot.id}
              projectId={projectId}
              shot={shot}
              index={i + 1}
              accounts={accounts}
              suggestedAccountId={suggestedAccountId}
              onPatchShot={patchShot}
              onAccounts={setAccounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountsPanel({
  accounts,
  setAccounts,
}: {
  accounts: AccountDTO[];
  setAccounts: (a: AccountDTO[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [quota, setQuota] = useState(3);
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!label.trim()) return;
    setAdding(true);
    try {
      const list = await jsonFetch<AccountDTO[]>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ label, email, dailyQuota: quota }),
      });
      setAccounts(list);
      setLabel("");
      setEmail("");
    } finally {
      setAdding(false);
    }
  }

  async function del(id: string) {
    const list = await jsonFetch<AccountDTO[]>(`/api/accounts/${id}`, { method: "DELETE" });
    setAccounts(list);
  }

  async function toggle(id: string, active: boolean) {
    const list = await jsonFetch<AccountDTO[]>(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
    setAccounts(list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cuentas de Google (cuota diaria)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Cada cuenta de Google AI Pro permite ~3 videos/día en Gemini. Registra aquí
          tus cuentas; la app sugiere cuál usar y lleva la cuenta del uso de hoy.
        </p>
        {accounts.length > 0 && (
          <div className="space-y-1">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.label}</span>
                  {a.email && <span className="text-xs text-muted">{a.email}</span>}
                  {!a.active && <Badge tone="danger">inactiva</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={a.remainingToday > 0 ? "success" : "danger"}>
                    {a.remainingToday}/{a.dailyQuota} hoy
                  </Badge>
                  <button
                    className="text-xs text-muted hover:text-foreground"
                    onClick={() => toggle(a.id, !a.active)}
                  >
                    {a.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => del(a.id)} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <Label>Etiqueta</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cuenta 1" />
          </div>
          <div className="flex-1">
            <Label>Email (opcional)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="…@gmail.com" />
          </div>
          <div className="w-24">
            <Label>Cuota</Label>
            <Input type="number" min={1} max={10} value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
          </div>
          <Button variant="outline" onClick={add} disabled={adding}>
            {adding ? <Spinner /> : <Plus className="h-4 w-4" />} Añadir cuenta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PackageCard({
  projectId,
  shot,
  index,
  accounts,
  suggestedAccountId,
  onPatchShot,
  onAccounts,
}: {
  projectId: string;
  shot: ShotDTO;
  index: number;
  accounts: AccountDTO[];
  suggestedAccountId: string | null;
  onPatchShot: (s: ShotDTO) => void;
  onAccounts: (a: AccountDTO[]) => void;
}) {
  const [prompt, setPrompt] = useState(shot.geminiPrompt || "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState(shot.assignedAccountId || suggestedAccountId || "");
  const [error, setError] = useState<string | null>(null);

  const isGenerated = shot.status === "generated" || shot.status === "imported";

  async function copy() {
    await navigator.clipboard.writeText(prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function savePrompt() {
    await jsonFetch(`/api/projects/${projectId}/shots/${shot.id}`, {
      method: "PATCH",
      body: JSON.stringify({ geminiPrompt: prompt }),
    }).catch(() => {});
  }

  async function markGenerated() {
    setBusy(true);
    setError(null);
    try {
      const res = await jsonFetch<{ shot: ShotDTO; accounts: AccountDTO[] }>(
        `/api/projects/${projectId}/shots/${shot.id}/generated`,
        { method: "POST", body: JSON.stringify({ accountId: accountId || null }) },
      );
      onPatchShot(res.shot);
      onAccounts(res.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unmark() {
    setBusy(true);
    try {
      const res = await jsonFetch<{ shot: ShotDTO; accounts: AccountDTO[] }>(
        `/api/projects/${projectId}/shots/${shot.id}/generated`,
        { method: "DELETE" },
      );
      onPatchShot(res.shot);
      onAccounts(res.accounts);
    } finally {
      setBusy(false);
    }
  }

  const usedAccount = accounts.find((a) => a.id === shot.assignedAccountId);

  return (
    <Card className={isGenerated ? "border-success/40" : undefined}>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone={isGenerated ? "success" : "default"}>
              Clip #{index}
            </Badge>
            <span className="text-xs text-muted">{shot.durationSec}s</span>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2">
            {shot.keyframePath ? (
              <img src={mediaUrl(shot.keyframePath)} alt="keyframe" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted">
                Genera el keyframe en la etapa «Planos»
              </div>
            )}
          </div>
          {shot.keyframePath && (
            <a href={mediaUrl(shot.keyframePath)} download>
              <Button variant="outline" size="sm" className="w-full">
                <Download className="h-3 w-3" /> Descargar keyframe
              </Button>
            </a>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="mb-0">Prompt para Gemini (image-to-video)</Label>
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <Textarea
            className="min-h-32 font-mono text-xs"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={savePrompt}
          />

          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="min-w-40 flex-1">
              <Label>Cuenta a usar</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={isGenerated}>
                <option value="">— elegir —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.remainingToday}/{a.dailyQuota})
                    {a.id === suggestedAccountId ? " ★ sugerida" : ""}
                  </option>
                ))}
              </Select>
            </div>
            {isGenerated ? (
              <Button variant="outline" onClick={unmark} disabled={busy}>
                {busy ? <Spinner /> : <RotateCcw className="h-4 w-4" />} Desmarcar
              </Button>
            ) : (
              <Button onClick={markGenerated} disabled={busy}>
                {busy ? <Spinner /> : <CircleCheck className="h-4 w-4" />} Marcar generado
              </Button>
            )}
          </div>
          {isGenerated && usedAccount && (
            <p className="text-xs text-success">Generado con «{usedAccount.label}».</p>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
