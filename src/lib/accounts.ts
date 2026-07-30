import { prisma } from "@/lib/db";
import { todayKey } from "@/lib/utils";
import type { AccountDTO } from "@/lib/dto";

export async function listAccounts(): Promise<AccountDTO[]> {
  const today = todayKey();
  const accounts = await prisma.account.findMany({ orderBy: { createdAt: "asc" } });
  const usages = await prisma.accountUsage.findMany({ where: { date: today } });
  const usageMap = new Map(usages.map((u) => [u.accountId, u.count]));
  return accounts.map((a) => {
    const usedToday = usageMap.get(a.id) ?? 0;
    return {
      id: a.id,
      label: a.label,
      email: a.email,
      dailyQuota: a.dailyQuota,
      active: a.active,
      usedToday,
      remainingToday: Math.max(0, a.dailyQuota - usedToday),
    };
  });
}

export function createAccount(input: {
  label: string;
  email?: string;
  dailyQuota?: number;
}) {
  return prisma.account.create({
    data: {
      label: input.label,
      email: input.email || "",
      dailyQuota: input.dailyQuota ?? 3,
    },
  });
}

export function updateAccount(id: string, data: Record<string, unknown>) {
  return prisma.account.update({ where: { id }, data });
}

export function deleteAccount(id: string) {
  return prisma.account.delete({ where: { id } });
}

/** Sugiere la cuenta activa con más cuota restante hoy. */
export async function suggestAccount(): Promise<AccountDTO | null> {
  const accounts = await listAccounts();
  const candidates = accounts
    .filter((a) => a.active && a.remainingToday > 0)
    .sort((a, b) => b.remainingToday - a.remainingToday);
  return candidates[0] ?? null;
}

async function bumpUsage(accountId: string, delta: number) {
  const today = todayKey();
  const existing = await prisma.accountUsage.findUnique({
    where: { accountId_date: { accountId, date: today } },
  });
  const next = Math.max(0, (existing?.count ?? 0) + delta);
  await prisma.accountUsage.upsert({
    where: { accountId_date: { accountId, date: today } },
    create: { accountId, date: today, count: Math.max(0, delta) },
    update: { count: next },
  });
}

export function incrementUsage(accountId: string) {
  return bumpUsage(accountId, 1);
}

export function decrementUsage(accountId: string) {
  return bumpUsage(accountId, -1);
}
