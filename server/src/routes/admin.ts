import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeOrgTrust } from "../lib/trust";

const router = Router();
router.use(requireAuth, requireRole("OPERATOR"));

router.get("/organizations", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    include: { representative: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  const withTrust = await Promise.all(orgs.map(async (o) => ({ ...o, trust: await computeOrgTrust(o.id) })));
  res.json(withTrust);
});

// Operator-awarded recognition for behaviour that can't be measured automatically
// (mentoring successors, community ties, etc.) — shown alongside the computed trust rank.
const badgesSchema = z.object({ specialBadges: z.array(z.string().min(1)) });

router.patch("/organizations/:id/badges", async (req, res) => {
  const parsed = badgesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: { specialBadges: parsed.data.specialBadges.join(",") },
  });
  res.json({ ...org, trust: await computeOrgTrust(org.id) });
});

const verifySchema = z.object({ verifiedStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]) });

router.patch("/organizations/:id/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ステータスが不正です" });
  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: { verifiedStatus: parsed.data.verifiedStatus },
  });
  res.json(org);
});

router.get("/reports", async (req, res) => {
  const reports = await prisma.report.findMany({
    include: { reporter: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(reports);
});

const reportStatusSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]) });

router.patch("/reports/:id/status", async (req, res) => {
  const parsed = reportStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ステータスが不正です" });
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json(report);
});

router.get("/users", async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, suspended: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

const suspendSchema = z.object({ suspended: z.boolean() });

router.patch("/users/:id/suspend", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { suspended: parsed.data.suspended },
  });
  res.json({ id: user.id, suspended: user.suspended });
});

router.get("/communities", async (req, res) => {
  const communities = await prisma.community.findMany({
    include: { createdBy: { select: { name: true, email: true } }, _count: { select: { memberships: true, posts: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(communities);
});

const communitySuspendSchema = z.object({ suspended: z.boolean() });

router.patch("/communities/:id/suspend", async (req, res) => {
  const parsed = communitySuspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });
  const community = await prisma.community.update({
    where: { id: req.params.id },
    data: { suspended: parsed.data.suspended },
  });
  res.json(community);
});

export default router;
