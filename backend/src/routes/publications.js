const { Router } = require("express");
const requireAuth = require("../middlewares/requireAuth");
const requireAdmin = require("../middlewares/requireAdmin");
const PublicationRepository = require("../repositories/publicationRepository");
const pushNotificationService = require("../services/pushNotificationService");
const sitemapService = require("../services/sitemapService");
const db = require("../db/sqlite");

function slugify(title) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
function makeUniqueSlug(base, currentId) {
  let slug = base || "";
  if (!slug) return null;
  let i = 2;
  const exists = (s) =>
    db
      .prepare(
        "SELECT 1 FROM publications WHERE slug = ? AND (? IS NULL OR id <> ?) LIMIT 1"
      )
      .get(s, currentId, currentId);
  while (exists(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function handlePublicationStatusTransition(previousStatus, publication) {
  const wasPublished = previousStatus === "published";
  const isPublished = publication && publication.status === "published";

  if (isPublished && !wasPublished) {
    if (
      pushNotificationService &&
      typeof pushNotificationService.notifyNewPublication === "function"
    ) {
      pushNotificationService
        .notifyNewPublication(publication)
        .catch((err) =>
          console.error("[push] Falha ao enviar notificação", err)
        );
    }
    sitemapService.scheduleSitemapRefresh();
    return;
  }

  if (wasPublished && !isPublished) {
    sitemapService.scheduleSitemapRefresh();
  }
}

const router = Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  const status = req.query.status || undefined;
  const mine = req.query.mine === "true";
  let authorId;
  if (req.user.role !== "admin" || mine) {
    authorId = req.user.id;
  }
  try {
    const items = PublicationRepository.list({ status, authorId });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar" });
  }
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = PublicationRepository.findById(id);
  if (!item) return res.status(404).json({ error: "Não encontrado" });
  if (req.user.role !== "admin" && item.author_id !== req.user.id) {
    return res.status(403).json({ error: "Proibido" });
  }
  return res.json(item);
});

router.post("/", (req, res) => {
  const payload = Object.assign({}, req.body || {});
  payload.author_id = req.user.id;
  try {
    const item = PublicationRepository.create(payload);
    try {
      if (
        (payload.status === "published" || payload.status === "review") &&
        payload.title
      ) {
        const base = slugify(payload.title);
        const unique = makeUniqueSlug(base, null);
        if (unique) {
          db.prepare("UPDATE publications SET slug = ? WHERE id = ?").run(
            unique,
            item.id
          );
          item.slug = unique;
        }
      }
    } catch (_) {}

    handlePublicationStatusTransition(null, item);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Erro ao criar" });
  }
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = PublicationRepository.findById(id);
  if (!item) return res.status(404).json({ error: "Não encontrado" });
  if (req.user.role !== "admin" && item.author_id !== req.user.id) {
    return res.status(403).json({ error: "Proibido" });
  }
  try {
    const updated = PublicationRepository.update(id, req.body || {});
    try {
      const title = (req.body && req.body.title) || updated.title;
      const status = (req.body && req.body.status) || updated.status;

      if ((status === "published" || status === "review") && title) {
        const base = slugify(title);
        const unique = makeUniqueSlug(base, id);
        if (unique) {
          db.prepare("UPDATE publications SET slug = ? WHERE id = ?").run(
            unique,
            id
          );
          updated.slug = unique;
        }
      }
    } catch (_) {}

    handlePublicationStatusTransition(item.status, updated);
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Erro ao atualizar" });
  }
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = PublicationRepository.findById(id);
  if (!item) return res.status(404).json({ error: "Não encontrado" });

  const permanent = String(req.query.permanent || "").toLowerCase() === "true";

  if (permanent) {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Proibido" });
    }
    const ok = PublicationRepository.deleteHard(id);
    if (ok) {
      handlePublicationStatusTransition(item.status, null);
    }
    return res.json({ ok });
  } else {
    if (req.user.role !== "admin" && item.author_id !== req.user.id) {
      return res.status(403).json({ error: "Proibido" });
    }
    const reason = (req.body && req.body.reason) || req.query.reason || null;
    const updated = PublicationRepository.remove(id, reason);
    handlePublicationStatusTransition(item.status, updated);
    return res.json(updated);
  }
});

router.get("/highlights/all", (_req, res) => {
  const highlights = PublicationRepository.listHighlights();
  return res.json(highlights);
});

router.put("/highlights/:cardNumber", requireAdmin, (req, res) => {
  const cardNumber = Number(req.params.cardNumber);
  const publicationId = Number(req.body.publicationId);
  if (!cardNumber || !publicationId) {
    return res.status(400).json({ error: "Dados inválidos" });
  }
  // Permite que o usuário com ID -1 (administrador de teste) também defina destaques.
  if (req.user.id !== 1 && req.user.id !== -1) {
    return res.status(403).json({
      error: "Apenas o administrador principal pode definir destaques",
    });
  }
  try {
    const result = PublicationRepository.setHighlight(
      cardNumber,
      publicationId
    );
    return res.json(result);
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Erro ao definir destaque" });
  }
});

router.delete("/highlights/:cardNumber", requireAdmin, (req, res) => {
  const cardNumber = Number(req.params.cardNumber);
  if (!cardNumber) {
    return res.status(400).json({ error: "Card invalido" });
  }
  if (req.user.id !== 1 && req.user.id !== -1) {
    return res.status(403).json({
      error: "Apenas o administrador principal pode definir destaques",
    });
  }
  try {
    const result = PublicationRepository.removeHighlight(cardNumber);
    return res.json(result);
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Erro ao remover destaque" });
  }
});

module.exports = router;
