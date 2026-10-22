const express = require("express");
const { z } = require("zod");
const prisma = require("../utils/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional()
}).strict();

async function isMember(teamId, userId) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } }
  });
}

router.post("/", async (req, res, next) => {
  try {
    const parsed = teamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid team details.", details: parsed.error.issues });
    }

    const team = await prisma.team.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        members: {
          create: { userId: req.user.id, role: "OWNER" }
        }
      },
      include: {
        members: {
          select: { userId: true, role: true, joinedAt: true }
        }
      }
    });

    return res.status(201).json({ message: "Team created successfully.", team });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      include: {
        team: {
          include: {
            _count: { select: { members: true, tasks: true } }
          }
        }
      },
      orderBy: { joinedAt: "desc" }
    });

    return res.json({
      teams: memberships.map(item => ({
        ...item.team,
        myRole: item.role
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:teamId/join", async (req, res, next) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId }
    });

    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    const membership = await prisma.teamMember.upsert({
      where: {
        userId_teamId: { userId: req.user.id, teamId: team.id }
      },
      update: {},
      create: {
        userId: req.user.id,
        teamId: team.id,
        role: "MEMBER"
      }
    });

    return res.status(200).json({
      message: "You are now a member of the team.",
      membership
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:teamId", async (req, res, next) => {
  try {
    const membership = await isMember(req.params.teamId, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: "Team not found or you are not a member." });
    }

    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { joinedAt: "asc" }
        },
        _count: { select: { tasks: true } }
      }
    });

    return res.json({ team });
  } catch (error) {
    next(error);
  }
});

module.exports = router;