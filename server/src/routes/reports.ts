import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { verifyToken } from "../lib/jwt";

const router = Router();

const reportSchema = z.object({
  targetType: z.enum(["ACTIVITY", "ORGANIZATION", "USER"]),
  targetId: z.string().optional(),
  targetLabel: z.string().min(1),
  reason: z.string().min(1),
  anonymous: z.boolean().optional(),
});

// Anonymous-capable: if a bearer token is present, attach reporterUserId unless anonymous=true
router.post("/", async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const { targetType, targetId, targetLabel, reason, anonymous } = parsed.data;

  let reporterUserId: string | undefined;
  const header = req.headers.authorization;
  if (!anonymous && header?.startsWith("Bearer ")) {
    try {
      reporterUserId = verifyToken(header.slice("Bearer ".length)).userId;
    } catch {
      // ignore invalid token, treat as anonymous
    }
  }

  const report = await prisma.report.create({
    data: { targetType, targetId, targetLabel, reason, reporterUserId },
  });
  res.status(201).json({ id: report.id, status: report.status });
});

export default router;
