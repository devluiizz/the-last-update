const db = require("../db/sqlite");

// Utilities for removing image files when a publication is permanently deleted
const fs = require("fs");
const path = require("path");

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug || null,
    author_id: row.author_id,
    author_name: row.author_name,
    author_avatar_light: row.author_avatar_light || row.avatar_light || null,
    author_avatar_dark: row.author_avatar_dark || row.avatar_dark || null,
    date: row.date,
    category: row.category,
    description: row.description,
    image: row.image,
    content: row.content,
    status: row.status,
    views: row.views,
    is_highlighted: row.is_highlighted ? 1 : 0,
    // visualizações únicas e cliques são opcionais; retornamos 0 se ausentes
    unique_views: row.visitas_unicas ?? row.unique_views ?? 0,
    // A propriedade de cliques foi removida. As publicações não registram mais cliques.
    motivo_exclusao: row.motivo_exclusao,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function refreshMembersPublicationCount(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  const unique = Array.from(
    new Set(
      list
        .map((value) => {
          const parsed = Number(value);
          return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        })
        .filter((value) => value !== null)
    )
  );
  if (!unique.length) return;
  const selectPublications = db.prepare(
    "SELECT COUNT(*) AS total FROM publications WHERE author_id = ? AND status = 'published'"
  );
  const selectMember = db.prepare(
    "SELECT publicacoes FROM members WHERE id = ? LIMIT 1"
  );
  const updateMember = db.prepare(
    "UPDATE members SET publicacoes = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const apply = db.transaction((idsToUpdate) => {
    idsToUpdate.forEach((memberId) => {
      const totalRow = selectPublications.get(memberId);
      const total = totalRow ? Number(totalRow.total) || 0 : 0;
      const memberRow = selectMember.get(memberId);
      if (!memberRow) return;
      const currentTotal = Number(memberRow.publicacoes) || 0;
      if (currentTotal === total) return;
      updateMember.run(total, memberId);
    });
  });
  apply(unique);
}

function syncHighlightFlags() {
  const resetHighlights = db.prepare(
    "UPDATE publications SET is_highlighted = 0 WHERE is_highlighted <> 0"
  );
  const selectHighlighted = db.prepare(`
    SELECT DISTINCT h.publication_id AS publication_id
      FROM highlights h
      JOIN publications p ON p.id = h.publication_id
     WHERE p.status = 'published'
  `);
  const markHighlight = db.prepare(
    "UPDATE publications SET is_highlighted = 1 WHERE id = ?"
  );
  const apply = db.transaction(() => {
    resetHighlights.run();
    const rows = selectHighlighted.all();
    rows.forEach((row) => {
      if (!row || row.publication_id == null) return;
      markHighlight.run(row.publication_id);
    });
  });
  apply();
}
const PublicationRepository = {
  list({ status, authorId } = {}) {
    let sql = `SELECT p.id, p.slug, p.title, p.author_id, m.nome AS author_name, p.date, p.category, p.description, p.image, p.content, p.status, p.views, p.is_highlighted, p.visitas_unicas, p.motivo_exclusao, p.created_at, p.updated_at
       FROM publications p
       JOIN members m ON p.author_id = m.id`;
    const conditions = [];
    const params = [];
    if (status) {
      conditions.push("p.status = ?");
      params.push(status);
    }
    if (authorId) {
      conditions.push("p.author_id = ?");
      params.push(authorId);
    }
    if (conditions.length) {
      sql += ` WHERE ` + conditions.join(" AND ");
    }
    sql += " ORDER BY datetime(p.date) DESC, p.id DESC";
    const stmt = db.prepare(sql);
    return stmt.all(...params).map(mapRow);
  },

  findById(id) {
    const stmt = db.prepare(
      `SELECT p.id, p.slug, p.title, p.author_id, m.nome AS author_name, p.date, p.category, p.description, p.image, p.content, p.status, p.views, p.is_highlighted, p.visitas_unicas, p.motivo_exclusao, p.created_at, p.updated_at
       FROM publications p
       JOIN members m ON p.author_id = m.id
       WHERE p.id = ?`
    );
    const row = stmt.get(id);
    return mapRow(row);
  },

  create(payload) {
    const title = String(payload.title || "").trim();
    const date = String(payload.date || "").trim();
    const category = String(payload.category || "").trim();
    const description = payload.description || "";
    const image = payload.image || null;
    const content = payload.content || "";
    const status = payload.status || "draft";
    const views = Number(payload.views) || 0;
    const authorId = Number(payload.author_id || payload.authorId);
    if (!title || !date || !category || !authorId) {
      throw new Error("MISSING_FIELDS");
    }
    const stmt = db.prepare(
      `INSERT INTO publications (title, author_id, date, category, description, image, content, status, views, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const info = stmt.run(
      title,
      authorId,
      date,
      category,
      description,
      image,
      content,
      status,
      views
    );
    refreshMembersPublicationCount([authorId]);
    return this.findById(info.lastInsertRowid);
  },

  update(id, payload) {
    const current = this.findById(id);
    if (!current) return null;
    const fields = [];
    const params = [];
    let shouldRefreshCount = false;
    let shouldSyncHighlights = false;
    function add(field, value) {
      fields.push(`${field} = ?`);
      params.push(value);
    }
    if (payload.title !== undefined) add("title", String(payload.title).trim());
    if (payload.date !== undefined) add("date", String(payload.date).trim());
    if (payload.category !== undefined)
      add("category", String(payload.category).trim());
    if (payload.description !== undefined)
      add("description", payload.description);
    if (payload.image !== undefined) add("image", payload.image);
    if (payload.content !== undefined) add("content", payload.content);
    if (payload.author_id !== undefined || payload.authorId !== undefined) {
      const candidate = Number(payload.author_id ?? payload.authorId);
      if (!Number.isInteger(candidate) || candidate <= 0) {
        throw new Error("INVALID_AUTHOR");
      }
      add("author_id", candidate);
      if (candidate !== current.author_id) shouldRefreshCount = true;
    }
    if (payload.status !== undefined) {
      const statusValue = String(payload.status).trim();
      add("status", statusValue);
      if (statusValue !== current.status) {
        shouldRefreshCount = true;
        shouldSyncHighlights = true;
      }
    }
    if (payload.is_highlighted !== undefined) {
      add("is_highlighted", payload.is_highlighted ? 1 : 0);
    }
    if (payload.views !== undefined) add("views", Number(payload.views) || 0);
    if (!fields.length) return current;
    // always update updated_at
    fields.push("updated_at = datetime('now')");
    const stmt = db.prepare(
      `UPDATE publications SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...params, id);
    const updated = this.findById(id);
    if (shouldRefreshCount) {
      const idsToRefresh = [current.author_id];
      if (updated) idsToRefresh.push(updated.author_id);
      refreshMembersPublicationCount(idsToRefresh);
    }
    if (shouldSyncHighlights) {
      syncHighlightFlags();
    }
    return updated;
  },

  remove(id, reason) {
    const current = this.findById(id);
    if (!current) return null;
    db.prepare(
      `UPDATE publications SET status = 'excluded', motivo_exclusao = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(reason ?? null, id);
    refreshMembersPublicationCount([current.author_id]);
    syncHighlightFlags();
    return this.findById(id);
  },

  deleteHard(id) {
    const current = this.findById(id);
    if (!current) return false;
    // Attempt to remove any image files associated with this publication
    try {
      const pathsToRemove = new Set();
      // Remove the main image if it lives in uploads or storage directories
      if (current.image && typeof current.image === "string") {
        pathsToRemove.add(current.image);
      }
      // Scan the content for images stored under /uploads or /storage/copilots
      if (current.content && typeof current.content === "string") {
        const regex = /\/(?:uploads|storage\/copilots)\/[^"'\)\s]+/g;
        const matches = current.content.match(regex) || [];
        matches.forEach((m) => pathsToRemove.add(m));
      }
      // Iterate through each collected path and attempt to unlink the file from disk
      for (const relPath of pathsToRemove) {
        if (!relPath || typeof relPath !== "string") continue;
        // Remove query parameters if present
        const cleanPath = relPath.split("?")[0];
        if (cleanPath.startsWith("/uploads/")) {
          // Remove the prefix and join relative to the uploads directory
          const remainder = cleanPath.replace(/^\/uploads\//, "");
          const filePath = path.join(__dirname, "..", "..", "uploads", remainder);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              console.error("Falha ao remover imagem da publicação:", e);
            }
          }
        } else if (cleanPath.startsWith("/storage/copilots/")) {
          // Remove the prefix and join relative to the storage/copilots directory
          const remainder = cleanPath.replace(/^\/storage\/copilots\//, "");
          const filePath = path.join(__dirname, "..", "storage", "copilots", remainder);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              console.error("Falha ao remover imagem de copilots:", e);
            }
          }
        }
      }
    } catch (err) {
      // Log errors but do not block deletion
      console.error(err);
    }
    // Remove database record
    db.prepare(`DELETE FROM publications WHERE id = ?`).run(id);
    refreshMembersPublicationCount([current.author_id]);
    syncHighlightFlags();
    return true;
  },

  listPublishedHighlights(limit = 3) {
    const parsed = Number(limit);
    const take =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 12) : 3;
    const rows = db
      .prepare(
        `SELECT
           p.id,
           p.slug,
           p.title,
           p.author_id,
           m.nome AS author_name,
           m.avatar_light AS author_avatar_light,
           m.avatar_dark AS author_avatar_dark,
           p.date,
           p.category,
           p.description,
           p.image,
           p.content,
           p.status,
           p.views,
           p.is_highlighted,
           p.visitas_unicas,
           p.motivo_exclusao,
           p.created_at,
           p.updated_at
         FROM publications p
         JOIN members m ON p.author_id = m.id
         WHERE p.status = 'published' AND p.is_highlighted = 1
         ORDER BY datetime(p.date) DESC, p.id DESC
         LIMIT ?`
      )
      .all(take);
    return rows.map(mapRow);
  },

  listHighlights() {
    const rows = db
      .prepare(
        `SELECT h.card_number, h.publication_id, p.id, p.slug, p.title, p.author_id, m.nome AS author_name, p.date, p.category, p.description, p.image, p.content, p.status, p.views, p.is_highlighted, p.visitas_unicas, p.created_at, p.updated_at
         FROM highlights h
         JOIN publications p ON h.publication_id = p.id
         JOIN members m ON p.author_id = m.id
         ORDER BY h.card_number`
      )
      .all();
    const result = {};
    rows.forEach((row) => {
      const mapped = mapRow(row);
      mapped.card_number = row.card_number;
      mapped.cardNumber = row.card_number;
      result[row.card_number] = mapped;
    });
    return result;
  },

  removeHighlight(cardNumber) {
    db.prepare(`DELETE FROM highlights WHERE card_number = ?`).run(cardNumber);
    syncHighlightFlags();
    return this.listHighlights();
  },

  setHighlight(cardNumber, publicationId) {
    const select = db
      .prepare(`SELECT id FROM highlights WHERE card_number = ? LIMIT 1`)
      .get(cardNumber);
    if (select) {
      db.prepare(
        `UPDATE highlights SET publication_id = ?, updated_at = datetime('now') WHERE card_number = ?`
      ).run(publicationId, cardNumber);
    } else {
      db.prepare(
        `INSERT INTO highlights (card_number, publication_id, updated_at) VALUES (?, ?, datetime('now'))`
      ).run(cardNumber, publicationId);
    }
    syncHighlightFlags();
    return this.listHighlights();
  },
};

module.exports = PublicationRepository;
