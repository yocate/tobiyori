import { prisma } from "./prisma";

export interface OrgHealth {
  daysSinceLastActivityPosted: number | null;
  staleApplicationCount: number; // APPLIED for 7+ days, still unanswered
  signOfStrain: boolean;
}

// A lightweight, honest signal for the organization itself (not shown publicly):
// long gaps between postings or a pile-up of unanswered applications usually
// mean the people running things are stretched thin.
export async function computeOrgHealth(orgId: string): Promise<OrgHealth> {
  const latestActivity = await prisma.activity.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });

  const daysSinceLastActivityPosted = latestActivity
    ? Math.floor((Date.now() - new Date(latestActivity.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const staleThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const staleApplicationCount = await prisma.application.count({
    where: {
      status: "APPLIED",
      createdAt: { lt: staleThreshold },
      activity: { orgId },
    },
  });

  const signOfStrain = (daysSinceLastActivityPosted ?? 0) > 90 || staleApplicationCount >= 3;

  return { daysSinceLastActivityPosted, staleApplicationCount, signOfStrain };
}
