import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeStudentStats } from "../lib/studentStats";

const router = Router();

// Student's participation points / badges, computed from real attendance & review history
router.get("/mine/stats", requireAuth, requireRole("STUDENT"), async (req, res) => {
  res.json(await computeStudentStats(req.auth!.userId));
});

const applySchema = z.object({
  activityId: z.string().min(1),
  participationType: z.enum(["VISIT", "ONE_TIME", "ONGOING"]),
  message: z.string().optional(),
});

router.post("/", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const { activityId, participationType, message } = parsed.data;

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return res.status(404).json({ error: "活動が見つかりません" });

  const existing = await prisma.application.findFirst({
    where: { activityId, studentId: req.auth!.userId, status: { not: "CANCELLED" } },
  });
  if (existing) {
    return res.status(409).json({ error: "この活動には既に申し込み済みです" });
  }

  const application = await prisma.application.create({
    data: { activityId, studentId: req.auth!.userId, participationType, message },
  });
  res.status(201).json(application);
});

// Student's own applications
router.get("/mine", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const applications = await prisma.application.findMany({
    where: { studentId: req.auth!.userId },
    include: { activity: { include: { organization: true } }, record: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(applications);
});

router.post("/:id/cancel", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const application = await prisma.application.findUnique({ where: { id: req.params.id } });
  if (!application || application.studentId !== req.auth!.userId) {
    return res.status(404).json({ error: "申込が見つかりません" });
  }
  const updated = await prisma.application.update({
    where: { id: application.id },
    data: { status: "CANCELLED" },
  });
  res.json(updated);
});

// Organization: applications for one of their activities
router.get("/for-activity/:activityId", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { representativeUserId: req.auth!.userId } });
  const activity = await prisma.activity.findUnique({ where: { id: req.params.activityId } });
  if (!org || !activity || activity.orgId !== org.id) {
    return res.status(404).json({ error: "活動が見つかりません" });
  }
  const applications = await prisma.application.findMany({
    where: { activityId: activity.id },
    include: { student: { select: { id: true, name: true, email: true } }, record: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(applications);
});

const statusSchema = z.object({ status: z.enum(["APPROVED", "DECLINED"]) });

router.patch("/:id/status", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ステータスが不正です" });

  const org = await prisma.organization.findUnique({ where: { representativeUserId: req.auth!.userId } });
  const application = await prisma.application.findUnique({ where: { id: req.params.id }, include: { activity: true } });
  if (!org || !application || application.activity.orgId !== org.id) {
    return res.status(404).json({ error: "申込が見つかりません" });
  }
  const updated = await prisma.application.update({
    where: { id: application.id },
    data: { status: parsed.data.status },
  });
  res.json(updated);
});

// Activity record: org marks attendance, issues certificate, and logs the
// behaviours that feed into its trust rank (newcomer orientation, follow-up)
const recordSchema = z.object({
  attended: z.boolean().optional(),
  certificateIssued: z.boolean().optional(),
  orientationGiven: z.boolean().optional(),
  followUpSent: z.boolean().optional(),
});

router.put("/:id/record", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  const org = await prisma.organization.findUnique({ where: { representativeUserId: req.auth!.userId } });
  const application = await prisma.application.findUnique({ where: { id: req.params.id }, include: { activity: true } });
  if (!org || !application || application.activity.orgId !== org.id) {
    return res.status(404).json({ error: "申込が見つかりません" });
  }

  const record = await prisma.activityRecord.upsert({
    where: { applicationId: application.id },
    create: {
      applicationId: application.id,
      attended: parsed.data.attended ?? false,
      certificateIssued: parsed.data.certificateIssued ?? false,
      orientationGiven: parsed.data.orientationGiven ?? false,
      followUpSent: parsed.data.followUpSent ?? false,
    },
    update: {
      attended: parsed.data.attended,
      certificateIssued: parsed.data.certificateIssued,
      orientationGiven: parsed.data.orientationGiven,
      followUpSent: parsed.data.followUpSent,
    },
  });
  res.json(record);
});

// Student: post a review + star rating on their own attended activity.
// This is the PUBLIC feedback; a separate, confidential safety concern
// should go through POST /api/reports instead (see ReportPage on the client).
const reviewSchema = z
  .object({
    review: z.string().min(1).optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .refine((d) => d.review || d.rating, { message: "感想または評価を入力してください" });

router.put("/:id/review", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });

  const application = await prisma.application.findUnique({ where: { id: req.params.id } });
  if (!application || application.studentId !== req.auth!.userId) {
    return res.status(404).json({ error: "申込が見つかりません" });
  }

  const record = await prisma.activityRecord.upsert({
    where: { applicationId: application.id },
    create: {
      applicationId: application.id,
      review: parsed.data.review,
      rating: parsed.data.rating,
      reviewedByUserId: req.auth!.userId,
    },
    update: {
      review: parsed.data.review,
      rating: parsed.data.rating,
      reviewedByUserId: req.auth!.userId,
    },
  });
  res.json(record);
});

export default router;
