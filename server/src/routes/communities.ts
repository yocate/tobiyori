import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

const memberSelect = { id: true, name: true } as const;

// GET /api/communities?interestTag=&university=&city=&q=
router.get("/", async (req, res) => {
  const { interestTag, university, city, q } = req.query as Record<string, string | undefined>;

  const where: any = { suspended: false };
  if (interestTag) where.interestTag = { contains: interestTag };
  if (university) where.university = { contains: university };
  if (city) where.city = city;
  if (q) {
    where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
  }

  const communities = await prisma.community.findMany({
    where,
    include: { _count: { select: { memberships: true } }, createdBy: { select: memberSelect } },
    orderBy: { createdAt: "desc" },
  });
  res.json(communities);
});

router.get("/:id", async (req, res) => {
  const community = await prisma.community.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: memberSelect },
      memberships: { include: { user: { select: memberSelect } }, orderBy: { joinedAt: "asc" } },
      posts: { include: { author: { select: memberSelect } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!community) return res.status(404).json({ error: "コミュニティが見つかりません" });
  res.json(community);
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  interestTag: z.string().min(1),
  university: z.string().optional(),
  city: z.string().optional(),
});

router.post("/", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" });
  }
  const community = await prisma.community.create({
    data: {
      ...parsed.data,
      createdByUserId: req.auth!.userId,
      memberships: { create: { userId: req.auth!.userId, role: "OWNER" } },
    },
  });
  res.status(201).json(community);
});

router.post("/:id/join", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community || community.suspended) return res.status(404).json({ error: "コミュニティが見つかりません" });

  await prisma.communityMembership.upsert({
    where: { communityId_userId: { communityId: community.id, userId: req.auth!.userId } },
    create: { communityId: community.id, userId: req.auth!.userId, role: "MEMBER" },
    update: {},
  });
  res.status(204).send();
});

router.post("/:id/leave", requireAuth, requireRole("STUDENT"), async (req, res) => {
  await prisma.communityMembership
    .delete({ where: { communityId_userId: { communityId: req.params.id, userId: req.auth!.userId } } })
    .catch(() => null);
  res.status(204).send();
});

const postSchema = z.object({ body: z.string().min(1) });

router.post("/:id/posts", requireAuth, requireRole("STUDENT"), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "内容を入力してください" });

  const membership = await prisma.communityMembership.findUnique({
    where: { communityId_userId: { communityId: req.params.id, userId: req.auth!.userId } },
  });
  if (!membership) return res.status(403).json({ error: "参加しているコミュニティにのみ投稿できます" });

  const post = await prisma.communityPost.create({
    data: { communityId: req.params.id, authorId: req.auth!.userId, body: parsed.data.body },
    include: { author: { select: memberSelect } },
  });
  res.status(201).json(post);
});

export default router;
