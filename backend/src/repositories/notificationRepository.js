const db = require("../db/sqlite");

function parseMeta(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function serializeMeta(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.trim().length ? value : null;
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    toUserId: row.to_user_id != null ? Number(row.to_user_id) : null,
    toRole: row.to_role || null,
    title: row.title,
    message: row.message,
    url: row.url || "",
    meta: parseMeta(row.meta),
    read: !!row.read_at,
    readAt: row.read_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const NotificationRepository = {
  findById(id) {
    if (!id) return null;
    const stmt = db.prepare(
      `SELECT id, to_user_id, to_role, title, message, url, meta, read_at, created_at, updated_at
       FROM notifications
       WHERE id = ?`
    );
    const row = stmt.get(id);
    return mapRow(row);
  },

  listForUser({ userId, role, unreadOnly = false, limit } = {}) {
    const uid = Number(userId) || null;
    const roleValue = typeof role === "string" ? role.trim() : "";
    const filters = [];
    const params = [];
    if (uid) {
      filters.push("(to_user_id IS NOT NULL AND to_user_id = ?)");
      params.push(uid);
    }
    if (roleValue) {
      filters.push("(to_role IS NOT NULL AND to_role = ?)");
      params.push(roleValue);
    }
    if (!filters.length) return [];
    let sql = `
      SELECT id, to_user_id, to_role, title, message, url, meta, read_at, created_at, updated_at
      FROM notifications
      WHERE (${filters.join(" OR ")})
    `;
    if (unreadOnly) {
      sql += " AND read_at IS NULL";
    }
    sql += " ORDER BY datetime(created_at) DESC, id DESC";
    const lim = Number(limit);
    if (Number.isInteger(lim) && lim > 0) {
      sql += " LIMIT ?";
      params.push(lim);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(mapRow);
  },

  create(payload) {
    const title = String(payload?.title || "").trim();
    const message = String(payload?.message || "").trim();
    if (!title || !message) {
      throw new Error("INVALID_NOTIFICATION");
    }
    const toRoleRaw = payload?.toRole;
    const toRole =
      typeof toRoleRaw === "string" && toRoleRaw.trim().length
        ? toRoleRaw.trim()
        : null;
    const toUserIdRaw = payload?.toUserId ?? payload?.to_user_id;
    const toUserId = Number(toUserIdRaw) || null;
    if (!toUserId && !toRole) {
      throw new Error("MISSING_TARGET");
    }
    const url =
      payload?.url == null ? "" : String(payload.url || "").trim();
    const meta = serializeMeta(payload?.meta ?? payload?.metadata ?? null);
    const stmt = db.prepare(
      `INSERT INTO notifications
         (to_user_id, to_role, title, message, url, meta, created_at, updated_at)
       VALUES
         (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const info = stmt.run(toUserId, toRole, title, message, url, meta);
    return this.findById(info.lastInsertRowid);
  },

  markAsRead(id, userId, role) {
    const uid = Number(userId) || null;
    const roleValue = typeof role === "string" ? role.trim() : "";
    if (!id) return false;
    if (!uid && !roleValue) return false;
    const params = [id];
    let sql = `
      UPDATE notifications
         SET read_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?
         AND read_at IS NULL
    `;
    const targets = [];
    if (uid) {
      targets.push("(to_user_id IS NOT NULL AND to_user_id = ?)");
      params.push(uid);
    }
    if (roleValue) {
      targets.push("(to_role IS NOT NULL AND to_role = ?)");
      params.push(roleValue);
    }
    if (!targets.length) return false;
    sql += ` AND (${targets.join(" OR ")})`;
    const result = db.prepare(sql).run(...params);
    return result.changes > 0;
  },
};

module.exports = NotificationRepository;
