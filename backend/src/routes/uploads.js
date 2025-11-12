const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "file", ext)
      .replace(/[^a-z0-9_-]+/gi, "-");
    const stamp = Date.now();
    cb(null, `${base}-${stamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const router = Router();

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "NO_FILE" });
  const rel = `/uploads/${req.file.filename}`;
  return res.json({ ok: true, url: rel, name: req.file.originalname });
});

module.exports = router;
