import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { getShotsFlat } from "@/lib/shots";
import { listAccounts } from "@/lib/accounts";
import { PackagesView } from "@/components/pipeline/packages-view";

export const dynamic = "force-dynamic";

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [shots, accounts] = await Promise.all([getShotsFlat(id), listAccounts()]);
  return (
    <PackagesView projectId={id} initialShots={shots} initialAccounts={accounts} />
  );
}
