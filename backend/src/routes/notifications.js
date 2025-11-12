const { Router } = require("express");
const requireAuth = require("../middlewares/requireAuth");
const NotificationRepository = require("../repositories/notificationRepository");

const router = Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  try {
    const unreadOnly =
      String(req.query.unread || "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.unread || "")
        .trim()
        .toLowerCase() === "true";
    const limit = Number(req.query.limit);
    const items = NotificationRepository.listForUser({
      userId: req.user.id,
      role: req.user.role,
      unreadOnly,
      limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
    });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar" });
  }
});

router.post("/", (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  if (!title || !message) {
    return res.status(400).json({ error: "Dados inválidos" });
  }
  const toUserIdRaw = body.toUserId ?? body.to_user_id;
  const toRoleRaw = body.toRole ?? body.to_role;
  const toUserId = Number(toUserIdRaw) || null;
  const toRole =
    typeof toRoleRaw === "string" && toRoleRaw.trim().length
      ? toRoleRaw.trim()
      : null;
  if (!toUserId && !toRole) {
    return res.status(400).json({ error: "Destino não informado" });
  }
  if (
    toUserId &&
    toUserId !== req.user.id &&
    req.user.role !== "admin"
  ) {
    return res.status(403).json({ error: "Proibido" });
  }
  try {
    const created = NotificationRepository.create({
      toUserId,
      toRole,
      title,
      message,
      url: body.url || "",
      meta: body.meta ?? body.metadata ?? null,
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Erro ao criar" });
  }
});

router.put("/:id/read", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "ID inválido" });
  }
  try {
    const ok = NotificationRepository.markAsRead(
      id,
      req.user.id,
      req.user.role
    );
    if (!ok) return res.status(404).json({ error: "Não encontrado" });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao atualizar" });
  }
});

module.exports = router;
