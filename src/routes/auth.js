const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../utils/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(72)
});

function issueToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "2h", issuer: "taskmaster-api", audience: "taskmaster-client" }
  );
}

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true
};

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid registration details.",
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const { name, email, password } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: safeUserSelect
    });

    const token = issueToken(user);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid login details.",
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const publicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return res.json({
      message: "Login successful.",
      token: issueToken(publicUser),
      user: publicUser
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(80)
    }).strict();

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid profile details.",
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: parsed.data.name },
      select: safeUserSelect
    });

    return res.json({ message: "Profile updated successfully.", user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;