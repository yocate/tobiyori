import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeOrgTrust } from "../lib/trust";
import { computeOrgHealth } from "../lib/orgHealth";

const router = Router();

router.get("/mine", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { representativeUserId: req.auth!.userId },
  });
  if (!org) return res.status(404).json({ error: "団体情報が見つかりません" });
  const [trust, health] = await Promise.all([computeOrgTrust(org.id), computeOrgHealth(org.id)]);
  res.json({ ...org, trust, health });
});

const updateSchema = z.object({ insuranceInfo: z.string().min(1) });

// Organization updates its own safety/insurance info; this also refreshes the
// "insurance recently updated" signal used in the trust score.
router.put("/mine", requireAuth, requireRole("ORG_ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "保険情報を入力してください" });

  const org = await prisma.organization.findUnique({ where: { representativeUserId: req.auth!.userId } });
  if (!org) return res.status(404).json({ error: "団体情報が見つかりません" });

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: { insuranceInfo: parsed.data.insuranceInfo, insuranceUpdatedAt: new Date() },
  });
  const trust = await computeOrgTrust(updated.id);
  res.json({ ...updated, trust });
});

router.get("/:id", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!org) return res.status(404).json({ error: "団体が見つかりません" });
  const trust = await computeOrgTrust(org.id);
  res.json({ ...org, trust });
});

export default router;
