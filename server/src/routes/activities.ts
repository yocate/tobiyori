import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeOrgTrust } from "../lib/trust";
import { recommendActivitiesFor } from "../lib/recommend";

const router = Router();

async function withOrgTrust<T extends { organization: { id: string } }>(items: T[]) {
  const uniqueOrgIds = [...new Set(items.map((i) => i.organization.id))];
  const trustByOrgId = new Map(await Promise.all(uniqueOrgIds.map(async (id) => [id, await computeOrgTrust(id)] as const)));
  return items.map((item) => ({ ...item, organization: { ...item.organization, trust: trustByOrgId.get(item.organization.id) } }));
}

// GET /api/activities?genre=&city=&beginnerFriendly=&participationType=&q=&helpOnly=
router.get("/", async (req, res) => {
  const { genre, city, beginnerFriendly, participationType, q, helpOnly } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (genre) where.genre = genre;
  if (city) where.city = city;
  if (beginnerFriendly === "true") where.beginnerFriendly = true;
  if (participationType) where.participationTypes = { contains: participationType };
  if (helpOnly === "true") where.isHelpRequest = true;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
    ];
  }
  where.organization = { verifiedStatus: "APPROVED" };

  const activities = await prisma.activity.findMany({
    where,
    include: { organization: true },
    orderBy: { dateTime: "asc" },
  });
  res.json(await withOrgTrust(activities));
});

// AI おすすめ (rule-based): top activity matches for the logged-in student, with reasons
router.get("/recommended/for-me", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const recs = await recommendActivitiesFor(req.auth!.userId);
  if (recs.length === 0) return res.json([]);

  const activities = await prisma.activity.findMany({
    where: { id: { in: recs.map((r) => r.activityId) } },
    include: { organization: true },
  });
  const withTrust = await withOrgTrust(activities);
  const byId = new Map(withTrust.map((a) => [a.id, a]));

  const result = recs
    .map((r) => {
      const activity = byId.get(r.activityId);
      return activity ? { activity, score: r.score, reasons: r.reasons } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  res.json(result);
});

router.get("/:id", async (req, res) => {
  const activity = await prisma.activity.findUnique({
    where: { id: req.params.id },
    include: { organization: true },
  });
  if (!activity) return res.status(404).json({ error: "活動が見つかりません" });
  const [withTrust] = await withOrgTrust([activity]);
  res.json(withTrust);
});

const activitySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().min(1),
  city: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  dateTime: z.string(),
  participationTypes: z.array(z.enum(["VISIT", "ONE_TIME", "ONGOING"])).min(1),
  beginnerFriendly: z.boolean().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  insuranceCovered: z.boolean().optional(),
  capacity: z.number().int().positive().optional(),
  transportNote: z.string().optional(),
  emergencyContact: z.string().optional(),
  incidentProcedure: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  parkingAvailable: z.boolean().optional(),
  transportCost: z.string().optional(),
  contactPerson: z.string().optional(),
  itemsToBring: z.string().optional(),
  photoPolicy: z.string().optional(),
  prohibitedNotes: z.string().optional(),
  isHelpRequest: z.boolean().optional(),
});

async function getOwnedOrg(userId: string) {
  return prisma.organization.findUnique({ where: { representativeUserId: userId } });
}

router.post("/", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await getOwnedOrg(req.auth!.userId);
  if (!org) return res.status(404).json({ error: "団体情報が見つかりません" });
  if (org.verifiedStatus !== "APPROVED") {
    return res.status(403).json({ error: "団体が運営の承認待ちのため、活動を掲載できません" });
  }

  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const data = parsed.data;

  const activity = await prisma.activity.create({
    data: {
      orgId: org.id,
      title: data.title,
      description: data.description,
      genre: data.genre,
      city: data.city,
      lat: data.lat,
      lng: data.lng,
      dateTime: new Date(data.dateTime),
      participationTypes: data.participationTypes.join(","),
      beginnerFriendly: data.beginnerFriendly ?? false,
      riskLevel: data.riskLevel ?? "LOW",
      insuranceCovered: data.insuranceCovered ?? false,
      capacity: data.capacity ?? 10,
      transportNote: data.transportNote,
      emergencyContact: data.emergencyContact,
      incidentProcedure: data.incidentProcedure,
      durationMinutes: data.durationMinutes,
      parkingAvailable: data.parkingAvailable ?? false,
      transportCost: data.transportCost,
      contactPerson: data.contactPerson,
      itemsToBring: data.itemsToBring,
      photoPolicy: data.photoPolicy,
      prohibitedNotes: data.prohibitedNotes,
      isHelpRequest: data.isHelpRequest ?? false,
    },
  });
  res.status(201).json(activity);
});

router.put("/:id", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await getOwnedOrg(req.auth!.userId);
  const activity = await prisma.activity.findUnique({ where: { id: req.params.id } });
  if (!activity || !org || activity.orgId !== org.id) {
    return res.status(404).json({ error: "活動が見つかりません" });
  }

  const parsed = activitySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const data = parsed.data;

  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: {
      ...data,
      dateTime: data.dateTime ? new Date(data.dateTime) : undefined,
      participationTypes: data.participationTypes ? data.participationTypes.join(",") : undefined,
    },
  });
  res.json(updated);
});

router.delete("/:id", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await getOwnedOrg(req.auth!.userId);
  const activity = await prisma.activity.findUnique({ where: { id: req.params.id } });
  if (!activity || !org || activity.orgId !== org.id) {
    return res.status(404).json({ error: "活動が見つかりません" });
  }
  await prisma.activity.delete({ where: { id: activity.id } });
  res.status(204).send();
});

// Organization's own activities (including if org not yet approved)
router.get("/mine/list", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await getOwnedOrg(req.auth!.userId);
  if (!org) return res.status(404).json({ error: "団体情報が見つかりません" });
  const activities = await prisma.activity.findMany({
    where: { orgId: org.id },
    orderBy: { dateTime: "asc" },
  });
  res.json(activities);
});

export default router;
