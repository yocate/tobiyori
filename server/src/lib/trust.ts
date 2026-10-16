import { prisma } from "./prisma";

// Themed after Takasaki's daruma craft: a daruma starts blank-eyed and gets an eye
// painted in as a wish is pursued — here, as the org builds a track record of good behaviour.
export type TrustRank = "白だるま" | "片目だるま" | "両目だるま";

export interface TrustInfo {
  rank: TrustRank;
  score: number;
  activityCount: number;
  avgRating: number | null;
  orientationRate: number | null;
  followUpRate: number | null;
  openReportCount: number;
  insuranceRecentlyUpdated: boolean;
  specialBadges: string[];
}

function rankFromScore(score: number): TrustRank {
  if (score >= 55) return "両目だるま";
  if (score >= 25) return "片目だるま";
  return "白だるま";
}

// Trust rank is deliberately NOT based on how many participants an org draws —
// a small, careful community group should be able to outrank a large, careless one.
// It rewards concrete, tracked behaviour instead: caring for newcomers, following up,
// keeping safety/insurance info current, staying active, and having no open safety
// concerns raised against them.
export async function computeOrgTrust(orgId: string): Promise<TrustInfo> {
  const [org, activities] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.activity.findMany({ where: { orgId }, select: { id: true } }),
  ]);

  const activityIds = activities.map((a) => a.id);
  const activityCount = activityIds.length;

  const records = activityIds.length
    ? await prisma.activityRecord.findMany({
        where: { application: { activityId: { in: activityIds } }, attended: true },
      })
    : [];

  const ratings = records.map((r) => r.rating).filter((r): r is number => r != null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const orientationRate = records.length ? records.filter((r) => r.orientationGiven).length / records.length : null;
  const followUpRate = records.length ? records.filter((r) => r.followUpSent).length / records.length : null;

  const openReportCount = await prisma.report.count({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      OR: [
        { targetType: "ORGANIZATION", targetId: orgId },
        { targetType: "ACTIVITY", targetId: { in: activityIds } },
      ],
    },
  });

  const insuranceRecentlyUpdated = org
    ? Date.now() - new Date(org.insuranceUpdatedAt).getTime() < 1000 * 60 * 60 * 24 * 365
    : false;

  let score = 0;
  if (avgRating != null) score += (avgRating / 5) * 30;
  if (orientationRate != null) score += orientationRate * 20;
  if (followUpRate != null) score += followUpRate * 15;
  if (insuranceRecentlyUpdated) score += 10;
  score += Math.min(activityCount, 5) * 3; // continuity, capped so it can't dominate the score
  score -= openReportCount * 15;
  score = Math.max(0, Math.round(score));

  const specialBadges = org?.specialBadges ? org.specialBadges.split(",").filter(Boolean) : [];

  return {
    rank: rankFromScore(score),
    score,
    activityCount,
    avgRating,
    orientationRate,
    followUpRate,
    openReportCount,
    insuranceRecentlyUpdated,
    specialBadges,
  };
}
