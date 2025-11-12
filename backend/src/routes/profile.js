const { Router } = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const db = require("../db/sqlite");
const requireAuth = require("../middlewares/requireAuth");
const MemberRepository = require("../repositories/memberRepository");

const router = Router();

function ensureColumns() {
  try {
    const pragma = db.prepare("PRAGMA table_info(members)").all();
    const cols = new Set(pragma.map((x) => x.name));
    if (!cols.has("phone")) {
      db.prepare("ALTER TABLE members ADD COLUMN phone TEXT").run();
    }
    if (!cols.has("location")) {
      db.prepare("ALTER TABLE members ADD COLUMN location TEXT").run();
    }
    if (!cols.has("about")) {
      db.prepare("ALTER TABLE members ADD COLUMN about TEXT").run();
    }
    if (!cols.has("avatar_light")) {
      db.prepare("ALTER TABLE members ADD COLUMN avatar_light TEXT").run();
    }
    if (!cols.has("avatar_dark")) {
      db.prepare("ALTER TABLE members ADD COLUMN avatar_dark TEXT").run();
    }
    if (!cols.has("instagram")) {
      db.prepare("ALTER TABLE members ADD COLUMN instagram TEXT").run();
    }
    if (!cols.has("linkedin")) {
      db.prepare("ALTER TABLE members ADD COLUMN linkedin TEXT").run();
    }
    if (!cols.has("twitter")) {
      db.prepare("ALTER TABLE members ADD COLUMN twitter TEXT").run();
    }
    if (!cols.has("email_social")) {
      db.prepare("ALTER TABLE members ADD COLUMN email_social TEXT").run();
    }
    if (!cols.has("password_changed")) {
      db
        .prepare(
          "ALTER TABLE members ADD COLUMN password_changed INTEGER NOT NULL DEFAULT 0"
        )
        .run();
    }
  } catch (err) {
    console.error("ensureColumns error:", err.message);
  }
}
ensureColumns();

function getMe(id) {
  const row = db
    .prepare(
      `SELECT id,
              nome,
              email,
              role,
              COALESCE(avatar_light, '') AS avatar_light,
              COALESCE(avatar_dark, '') AS avatar_dark,
              COALESCE(phone,'') AS phone,
              COALESCE(location,'') AS location,
              COALESCE(about,'') AS about,
              COALESCE(instagram,'') AS instagram,
              COALESCE(linkedin,'') AS linkedin,
              COALESCE(twitter,'') AS twitter,
              COALESCE(email_social,'') AS email_social
         FROM members
        WHERE id = ?`
    )
    .get(id);
  return row || null;
}

router.get("/", requireAuth, (req, res) => {
  const me = getMe(req.user.id);
  if (!me) return res.status(404).json({ error: "Membro não encontrado." });
  return res.json(me);
});

router.put("/", requireAuth, (req, res) => {
  const id = req.user.id;
  ensureColumns();
  const {
    nome,
    email,
    phone,
    location,
    about,
    avatarUrl,
    avatarDataUrl,
    instagram,
    linkedin,
    twitter,
    email_social,
    emailSocial,
  } = req.body || {};

  const updates = [];
  const values = [];
  if (typeof nome === "string" && nome.trim()) {
    updates.push("nome = ?");
    values.push(nome.trim());
  }
  if (typeof email === "string" && email.trim()) {
    updates.push("email = ?");
    values.push(email.trim());
  }
  if (typeof phone === "string") {
    updates.push("phone = ?");
    values.push(phone.trim());
  }
  if (typeof location === "string") {
    updates.push("location = ?");
    values.push(location.trim());
  }
  if (typeof about === "string") {
    updates.push("about = ?");
    values.push(about.trim().slice(0, 200));
  }
  if (typeof instagram === "string") {
    updates.push("instagram = ?");
    values.push(instagram.trim());
  }
  if (typeof linkedin === "string") {
    updates.push("linkedin = ?");
    values.push(linkedin.trim());
  }
  if (typeof twitter === "string") {
    updates.push("twitter = ?");
    values.push(twitter.trim());
  }
  const normalizedEmailSocial =
    typeof email_social === "string"
      ? email_social
      : typeof emailSocial === "string"
      ? emailSocial
      : undefined;
  if (typeof normalizedEmailSocial === "string") {
    updates.push("email_social = ?");
    values.push(normalizedEmailSocial.trim());
  }

  let savedAvatarRelative = null;

  function saveDataUrlToFile(dataUrl) {
    const m = /^data:(.+);base64,(.*)$/.exec(dataUrl || "");
    if (!m) return null;
    const ext = (m[1] || "image/png").split("/")[1] || "png";
    const buf = Buffer.from(m[2], "base64");
    const dir = path.join(__dirname, "..", "storage", "avatars");
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${id}-${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buf);
    return `/storage/avatars/${filename}`;
  }

  if (
    avatarDataUrl &&
    typeof avatarDataUrl === "string" &&
    avatarDataUrl.startsWith("data:")
  ) {
    const rel = saveDataUrlToFile(avatarDataUrl);
    if (rel) {
      savedAvatarRelative = rel;
      updates.push("avatar_light = ?");
      values.push(rel);
      updates.push("avatar_dark = ?");
      values.push(rel);
    }
  } else if (avatarUrl && typeof avatarUrl === "string") {
    savedAvatarRelative = avatarUrl;
    updates.push("avatar_light = ?");
    values.push(avatarUrl);
    updates.push("avatar_dark = ?");
    values.push(avatarUrl);
  }

  if (!updates.length) {
    const me = getMe(id);
    return res.json(me);
  }

  values.push(id);
  const sql = `UPDATE members SET ${updates.join(", ")} WHERE id = ?`;
  try {
    const result = db.prepare(sql).run(...values);
    if (!result.changes)
      return res.status(404).json({ error: "Membro não encontrado." });
    const me = getMe(id);
    return res.json(me);
  } catch (err) {
    if (String(err.message).includes("members.email")) {
      return res.status(409).json({ error: "Email já cadastrado." });
    }
    return res.status(400).json({ error: "Falha ao atualizar perfil." });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "storage", "avatars");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

router.post("/avatar", requireAuth, upload.single("avatar"), (req, res) => {
  ensureColumns();
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
  const rel = `/storage/avatars/${req.file.filename}`;
  const sql =
    "UPDATE members SET avatar_light = ?, avatar_dark = ? WHERE id = ?";
  db.prepare(sql).run(rel, rel, req.user.id);
  const me = getMe(req.user.id);
  return res.json(me);
});
router.post("/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res
      .status(400)
      .json({ error: "Informe a senha atual e a nova senha." });
  }

  if (String(newPassword) !== String(confirmPassword)) {
    return res.status(400).json({ error: "As novas senhas não coincidem." });
  }

  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
  }

  const sensitive = MemberRepository.findSensitiveById(req.user.id);
  if (!sensitive) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }

  const matches = bcrypt.compareSync(
    String(currentPassword),
    sensitive.password_hash
  );
  if (!matches) {
    return res.status(400).json({ error: "Senha atual incorreta." });
  }

  const passwordHash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare(
    "UPDATE members SET password_hash = ?, password_changed = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(passwordHash, sensitive.id);

  return res.json({ ok: true });
});
module.exports = router;





