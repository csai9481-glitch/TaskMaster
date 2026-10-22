require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing from .env");
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET is missing or too short in .env");
  process.exit(1);
}

const app = require("./app");
const prisma = require("./utils/prisma");

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(`TaskMaster API is running at http://localhost:${port}`);
});

async function shutdown() {
  console.log("Shutting down TaskMaster API...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);