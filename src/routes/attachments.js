const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { randomUUID } = require("crypto");
const { TextDecoder } = require("util");
const prisma = require("../utils/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain"
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_TYPES[ext] || ALLOWED_TYPES[ext] !== file.mimetype) {
      return callback(new Error("Only PDF, PNG, JPEG, and plain text files are allowed."));
    }
    callback(null, true);
  }
});

async function isTeamMember(teamId, userId) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } }
  });
}

async function findTaskForMember(taskId, userId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, teamId: true }
  });

  if (!task) return null;

  const membership = await isTeamMember(task.teamId, userId);
  return membership ? task : null;
}

async function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function publicAttachment(attachment) {
  const { storagePath, ...safeAttachment } = attachment;
  return safeAttachment;
}

async function validateFileContents(file) {
  const handle = await fsp.open(file.path, "r");

  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, 8, 0);
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === ".pdf") {
      return buffer.subarray(0, bytesRead).toString("ascii").startsWith("%PDF-");
    }

    if (ext === ".png") {
      return bytesRead >= 8 &&
        buffer.subarray(0, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );
    }

    if (ext === ".jpg" || ext === ".jpeg") {
      return bytesRead >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    if (ext === ".txt") {
      const content = await fsp.readFile(file.path);
      if (content.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(content);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  } finally {
    await handle.close();
  }
}

router.post("/tasks/:taskId/attachments", async (req, res, next) => {
  try {
    const task = await findTaskForMember(req.params.taskId, req.user.id);

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    upload.single("file")(req, res, async (uploadError) => {
      if (uploadError) {
        const status = uploadError instanceof multer.MulterError ? 400 : 415;
        const message = uploadError.code === "LIMIT_FILE_SIZE"
          ? "File must be 5 MB or smaller."
          : uploadError.message;

        return res.status(status).json({ error: message });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Attach one file using the multipart field name "file".'
        });
      }

      try {
        const validContents = await validateFileContents(req.file);

        if (!validContents) {
          await removeUploadedFile(req.file.path);
          return res.status(400).json({
            error: "The file contents do not match an allowed file type."
          });
        }

        const originalName = path.basename(req.file.originalname).slice(0, 255);

        const attachment = await prisma.attachment.create({
          data: {
            filename: originalName,
            storagePath: req.file.filename,
            mimeType: ALLOWED_TYPES[path.extname(originalName).toLowerCase()],
            sizeBytes: req.file.size,
            taskId: task.id,
            uploadedById: req.user.id
          },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            taskId: true,
            uploadedById: true,
            createdAt: true
          }
        });

        return res.status(201).json({
          message: "Attachment uploaded successfully.",
          attachment
        });
      } catch (error) {
        try {
          await removeUploadedFile(req.file.path);
        } catch (cleanupError) {
          console.error("Failed to clean up uploaded file:", cleanupError.message);
        }
        return next(error);
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId/attachments", async (req, res, next) => {
  try {
    const task = await findTaskForMember(req.params.taskId, req.user.id);

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    const attachments = await prisma.attachment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        taskId: true,
        uploadedById: true,
        createdAt: true
      }
    });

    return res.json({ attachments, total: attachments.length });
  } catch (error) {
    next(error);
  }
});

router.get("/attachments/:attachmentId/download", async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.attachmentId },
      include: { task: { select: { id: true, teamId: true } } }
    });

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found." });
    }

    const membership = await isTeamMember(attachment.task.teamId, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: "Attachment not found." });
    }

    // Only allow generated filenames inside the uploads directory.
    if (path.basename(attachment.storagePath) !== attachment.storagePath) {
      return res.status(404).json({ error: "Attachment file not found." });
    }

    const filePath = path.resolve(UPLOAD_DIR, attachment.storagePath);
    if (path.dirname(filePath) !== UPLOAD_DIR) {
      return res.status(404).json({ error: "Attachment file not found." });
    }

    try {
      await fsp.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: "Attachment file not found." });
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", attachment.mimeType);

    return res.download(filePath, attachment.filename, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;