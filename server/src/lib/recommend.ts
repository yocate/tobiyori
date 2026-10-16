import { prisma } from "./prisma";
import { computeOrgTrust } from "./trust";

export interface Recommendation {
  activityId: string;
  score: number;
  reasons: string[];
}

// A simple, transparent rule-based stand-in for "AI おすすめ": no external model call,
// just a weighted match against the student's declared interests/university/city/transport,
// plus small nudges for beginner-friendliness and a well-established organizer.
// Each recommendation carries its reasons in plain Japanese so the "why" is never a black box.
export async function recommendActivitiesFor(studentId: string, limit = 5): Promise<Recommendation[]> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId } });
  const interestTags = profile?.interests ? profile.interests.split(",").filter(Boolean) : [];
  const preferredCity = profile?.preferredCity || undefined;
  const availableDays = profile?.availableDays ? profile.availableDays.split(",").filter(Boolean) : [];

  const alreadyApplied = await prisma.application.findMany({
    where: { studentId, status: { not: "CANCELLED" } },
    select: { activityId: true },
  });
  const appliedIds = new Set(alreadyApplied.map((a) => a.activityId));

  const activities = await prisma.activity.findMany({
    where: { organization: { verifiedStatus: "APPROVED" }, dateTime: { gte: new Date() } },
    include: { organization: true },
    orderBy: { dateTime: "asc" },
    take: 100,
  });

  const scored: Recommendation[] = [];

  for (const activity of activities) {
    if (appliedIds.has(activity.id)) continue;
    let score = 0;
    const reasons: string[] = [];

    if (interestTags.includes(activity.genre)) {
      score += 40;
      reasons.push(`興味に登録している「${activity.genre}」の活動です`);
    }
    if (preferredCity && activity.city === preferredCity) {
      score += 20;
      reasons.push(`希望エリアの${activity.city}で開催されます`);
    }
    if (activity.beginnerFriendly) {
      score += 10;
      reasons.push("初心者歓迎の活動です");
    }
    if (activity.isHelpRequest) {
      score += 5;
      reasons.push("今まさに人手を探している「おたすけ募集」です");
    }
    const trust = await computeOrgTrust(activity.orgId);
    if (trust.rank === "両目だるま") {
      score += 8;
      reasons.push(`${activity.organization.name}は丁寧な運営で信頼ランク「両目だるま」です`);
    } else if (trust.rank === "片目だるま") {
      score += 4;
    }
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][new Date(activity.dateTime).getDay()];
    if (availableDays.includes(dayOfWeek)) {
      score += 8;
      reasons.push(`参加可能曜日として登録している${dayOfWeek}曜日の開催です`);
    }

    if (score > 0) scored.push({ activityId: activity.id, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
