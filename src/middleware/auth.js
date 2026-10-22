const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required. Provide a Bearer token."
      });
    }

    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: "Authentication token is missing." });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: "taskmaster-api",
        audience: "taskmaster-client"
      });
    } catch {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    if (
      !payload.sub ||
      typeof payload.jti !== "string" ||
      !payload.jti ||
      !Number.isInteger(payload.exp)
    ) {
      return res.status(401).json({ error: "Invalid authentication token." });
    }

    const revokedToken = await prisma.revokedToken.findUnique({
      where: { jti: payload.jti }
    });

    if (revokedToken) {
      return res.status(401).json({ error: "Token has been revoked. Please log in again." });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, createdAt: true, updatedAt: true }
    });

    if (!user) {
      return res.status(401).json({ error: "User account no longer exists." });
    }

    req.user = user;
    req.authTokenPayload = payload;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth };
