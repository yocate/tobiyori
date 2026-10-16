import { prisma } from "./prisma";

export interface StudentStats {
  points: number;
  attendedCount: number;
  reviewCount: number;
  levelBadge: string;
  levelIcon: string;
  nextLevel: { label: string; pointsToGo: number } | null;
  cityBadges: string[];
  genreBadges: string[];
}

// Gunma's "Joumou Sanzan" (上毛三山): the three iconic mountains — Akagi, Haruna, Myougi —
// used here as a 5-stage level ladder for students, from the foothills to "master".
const LEVELS: { min: number; label: string; icon: string }[] = [
  { min: 0, label: "ふもとレベル", icon: "🏞️" },
  { min: 20, label: "赤城レベル", icon: "🌋" },
  { min: 50, label: "榛名レベル", icon: "🏔️" },
  { min: 100, label: "妙義レベル", icon: "⛰️" },
  { min: 200, label: "上毛三山マスター", icon: "👑" },
];

export async function computeStudentStats(studentId: string): Promise<StudentStats> {
  const applications = await prisma.application.findMany({
    where: { studentId },
    include: { activity: true, record: true },
  });

  const attended = applications.filter((a) => a.record?.attended);
  const reviewed = applications.filter((a) => a.record?.review);

  const points = attended.length * 10 + reviewed.length * 5;

  const cityBadges = [...new Set(attended.map((a) => a.activity.city))];
  const genreBadges = [...new Set(attended.map((a) => a.activity.genre))];

  const current = [...LEVELS].reverse().find((l) => points >= l.min) ?? LEVELS[0];
  const next = LEVELS[LEVELS.indexOf(current) + 1];

  return {
    points,
    attendedCount: attended.length,
    reviewCount: reviewed.length,
    levelBadge: current.label,
    levelIcon: current.icon,
    nextLevel: next ? { label: next.label, pointsToGo: next.min - points } : null,
    cityBadges,
    genreBadges,
  };
}
