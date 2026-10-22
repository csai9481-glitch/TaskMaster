const express = require("express");
const { z } = require("zod");
const prisma = require("../utils/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.iso.datetime({ offset: true }).optional(),
  assigneeId: z.uuid().nullable().optional()
}).strict();

const updateTaskSchema = createTaskSchema.partial();

async function getMembership(teamId, userId) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } }
  });
}

async function taskForMember(taskId, userId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      team: true,
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
      _count: { select: { comments: true, attachments: true } }
    }
  });

  if (!task) return null;
  const membership = await getMembership(task.teamId, userId);
  if (!membership) return null;

  return task;
}

router.post("/teams/:teamId/tasks", async (req, res, next) => {
  try {
    const membership = await getMembership(req.params.teamId, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: "Team not found or you are not a member." });
    }

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid task details.", details: parsed.error.issues });
    }

    const data = parsed.data;

    if (data.assigneeId) {
      const assigneeMembership = await getMembership(req.params.teamId, data.assigneeId);
      if (!assigneeMembership) {
        return res.status(400).json({ error: "The assignee must be a member of this team." });
      }
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || "TODO",
        priority: data.priority || "MEDIUM",
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        teamId: req.params.teamId,
        assigneeId: data.assigneeId || null,
        creatorId: req.user.id
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json({ message: "Task created successfully.", task });
  } catch (error) {
    next(error);
  }
});

router.get("/teams/:teamId/tasks", async (req, res, next) => {
  try {
    const membership = await getMembership(req.params.teamId, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: "Team not found or you are not a member." });
    }

    const querySchema = z.object({
      status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      assigneeId: z.uuid().optional(),
      search: z.string().trim().max(200).optional(),
      sortBy: z.enum(["createdAt", "dueDate", "title", "priority", "status"]).default("createdAt"),
      order: z.enum(["asc", "desc"]).default("desc"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid task filters.", details: parsed.error.issues });
    }

    const { status, priority, assigneeId, search, sortBy, order, page, limit } = parsed.data;

    const where = {
      teamId: req.params.teamId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } }
        ]
      } : {})
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
          _count: { select: { comments: true, attachments: true } }
        }
      }),
      prisma.task.count({ where })
    ]);

    return res.json({
      tasks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:taskId", async (req, res, next) => {
  try {
    const task = await taskForMember(req.params.taskId, req.user.id);
    if (!task) return res.status(404).json({ error: "Task not found." });

    return res.json({ task });
  } catch (error) {
    next(error);
  }
});

router.patch("/:taskId", async (req, res, next) => {
  try {
    const existing = await taskForMember(req.params.taskId, req.user.id);
    if (!existing) return res.status(404).json({ error: "Task not found." });

    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(req.body || {}).length === 0) {
      return res.status(400).json({
        error: "Provide valid task fields to update.",
        details: parsed.success ? [] : parsed.error.issues
      });
    }

    const data = parsed.data;

    if (Object.prototype.hasOwnProperty.call(data, "assigneeId") && data.assigneeId) {
      const assigneeMembership = await getMembership(existing.teamId, data.assigneeId);
      if (!assigneeMembership) {
        return res.status(400).json({ error: "The assignee must be a member of this team." });
      }
    }

    const update = { ...data };
    if (Object.prototype.hasOwnProperty.call(update, "dueDate")) {
      update.dueDate = update.dueDate ? new Date(update.dueDate) : null;
    }

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: update,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    return res.json({ message: "Task updated successfully.", task });
  } catch (error) {
    next(error);
  }
});

router.delete("/:taskId", async (req, res, next) => {
  try {
    const existing = await taskForMember(req.params.taskId, req.user.id);
    if (!existing) return res.status(404).json({ error: "Task not found." });

    await prisma.task.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

const commentSchema = z.object({
  content: z.string().trim().min(1).max(2000)
}).strict();

router.post("/tasks/:taskId/comments", async (req, res, next) => {
  try {
    const task = await taskForMember(req.params.taskId, req.user.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid comment.",
        details: parsed.error.issues
      });
    }

    const comment = await prisma.comment.create({
      data: {
        content: parsed.data.content,
        taskId: task.id,
        authorId: req.user.id
      },
      include: {
        author: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.status(201).json({
      message: "Comment added successfully.",
      comment
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId/comments", async (req, res, next) => {
  try {
    const task = await taskForMember(req.params.taskId, req.user.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.json({ comments, total: comments.length });
  } catch (error) {
    next(error);
  }
});
module.exports = router;