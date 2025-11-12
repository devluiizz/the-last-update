const { Router } = require("express");
const bcrypt = require("bcryptjs");

const MemberRepository = require("../repositories/memberRepository");
const requireAuth = require("../middlewares/requireAuth");
const requireAdmin = require("../middlewares/requireAdmin");
const { signToken, TOKEN_COOKIE, SESSION_TTL_MS } = require("../auth/token");

const router = Router();
const SESSION_MAX_AGE = SESSION_TTL_MS > 0 ? SESSION_TTL_MS : 40 * 60 * 1000;

const membersRouter = require("./members");
const profileRouter = require("./profile");
const geoRouter = require("./geo");
const publicationsRouter = require("./publications");
const notificationsRouter = require("./notifications");
const pushRouter = require("./push");
const publicRouter = require("./public");
const dashboardRouter = require("./dashboard");
const searchRouter = require("./search");

router.get("/", (_req, res) => {
  res.json({ api: "The Last Update", version: 1 });
});

router.post("/login", (req, res) => {
  const { cpf, password } = req.body || {};
  if (!cpf || !password) {
    return res.status(400).json({ error: "CPF e senha são obrigatórios." });
  }

  const normalizedCpf = String(cpf).replace(/\D/g, "");
  const submittedPassword = String(password);

  if (normalizedCpf.length !== 11) {
    return res.status(400).json({ error: "CPF inválido." });
  }
  if (!submittedPassword.trim().length) {
    return res.status(400).json({ error: "Senha inválida." });
  }

  const member = MemberRepository.findByCPF(normalizedCpf);
  if (!member) return res.status(401).json({ error: "Credenciais inválidas." });

  const digitsOnly = submittedPassword.replace(/\D/g, "");
  const matches =
    bcrypt.compareSync(submittedPassword, member.password_hash) ||
    (digitsOnly.length > 0 &&
      bcrypt.compareSync(digitsOnly, member.password_hash));
  if (!matches)
    return res.status(401).json({ error: "Credenciais inválidas." });

  const token = signToken({ sub: member.id, role: member.role });
  const sessionExpiresAt = new Date(Date.now() + SESSION_MAX_AGE).toISOString();

  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  const safeMember = MemberRepository.findById(member.id);
  return res.json({ ...safeMember, sessionExpiresAt });
});
router.post("/logout", (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, { path: "/" });
  return res.status(204).send();
});

router.get("/me", requireAuth, (req, res) => {
  const payload = {
    ...req.user,
    sessionExpiresAt: req.sessionExpiresAt || null,
  };
  return res.json(payload);
});

router.use("/members", requireAuth, requireAdmin, membersRouter);
router.use("/profile", requireAuth, profileRouter);
router.use("/geo", geoRouter);

router.use("/publications", publicationsRouter);
router.use("/notifications", notificationsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/push", pushRouter);

router.use("/public", publicRouter);

// Rota pública para busca de publicações (autocomplete e página de resultados)
router.use("/busca", searchRouter);

module.exports = router;
