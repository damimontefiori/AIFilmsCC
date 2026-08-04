import { SettingsManager } from "@/components/pipeline/settings-manager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configuración · Film con IA",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración de modelos</h1>
        <p className="mt-1 text-sm text-muted">
          Gestiona endpoints, modelos y API keys de cada proveedor. Los cambios se guardan en la base
          de datos y tienen prioridad sobre las variables de entorno. Cada modelo tiene un panel de
          <span className="font-medium"> Playground</span> para probarlo con tus propios prompts.
        </p>
      </div>
      <SettingsManager />
    </div>
  );
}
