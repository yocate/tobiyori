import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

const studentRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  university: z.string().optional(),
  interests: z.string().optional(),
});

router.post("/register/student", async (req, res) => {
  const parsed = studentRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const { email, password, name, university, interests } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "STUDENT",
      studentProfile: {
        create: {
          university: university ?? "",
          interests: interests ?? "",
        },
      },
    },
  });

  const token = signToken({ userId: user.id, role: "STUDENT" });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

const orgRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  repName: z.string().min(1),
  orgName: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  insuranceInfo: z.string().min(1),
});

router.post("/register/organization", async (req, res) => {
  const parsed = orgRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const { email, password, repName, orgName, category, description, insuranceInfo } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "このメールアドレスは既に登録されています" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: repName,
      role: "ORG_ADMIN",
      organization: {
        create: {
          name: orgName,
          category,
          description,
          insuranceInfo,
          verifiedStatus: "PENDING",
        },
      },
    },
  });

  const token = signToken({ userId: user.id, role: "ORG_ADMIN" });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "メールアドレスとパスワードを入力してください" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }
  if (user.suspended) {
    return res.status(403).json({ error: "このアカウントは利用停止中です" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
  }

  const token = signToken({ userId: user.id, role: user.role as "STUDENT" | "ORG_ADMIN" | "OPERATOR" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

const studentProfileSchema = z.object({
  university: z.string().optional(),
  interests: z.string().optional(),
  bio: z.string().optional(),
  availableDays: z.string().optional(),
  transportMethod: z.string().optional(),
  preferredCity: z.string().optional(),
});

router.put("/student-profile", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = studentProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "入力内容を確認してください" });

  const profile = await prisma.studentProfile.upsert({
    where: { userId: req.auth!.userId },
    create: { userId: req.auth!.userId, interests: "", ...parsed.data },
    update: parsed.data,
  });
  res.json(profile);
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { studentProfile: true, organization: true },
  });
  if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });
  const { passwordHash: _passwordHash, ...safe } = user;
  res.json(safe);
});

export default router;
