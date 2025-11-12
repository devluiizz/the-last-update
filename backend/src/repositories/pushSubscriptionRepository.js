const db = require("../db/sqlite");

function normalizeExpiration(expirationTime) {
  if (expirationTime == null) return null;
  if (typeof expirationTime === "number" && !Number.isNaN(expirationTime)) {
    try {
      return new Date(expirationTime).toISOString();
    } catch (_) {
      return null;
    }
  }
  if (typeof expirationTime === "string") {
    const trimmed = expirationTime.trim();
    if (!trimmed.length) return null;
    // Attempt to parse numbers stored as strings
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
      try {
        return new Date(asNumber).toISOString();
      } catch (_) {
        return trimmed;
      }
    }
    return trimmed;
  }
  return null;
}

function mapRow(row) {
  if (!row) return null;
  let expiration = null;
  if (row.expiration_time) {
    const parsed = Date.parse(row.expiration_time);
    expiration = Number.isNaN(parsed) ? null : parsed;
  }
  return {
    id: row.id,
    endpoint: row.endpoint,
    expirationTime: expiration,
    keys: {
      auth: row.auth_key || null,
      p256dh: row.p256dh_key || null,
    },
    preference: row.preference || null,
  };
}

const PushSubscriptionRepository = {
  upsert({ endpoint, authKey, p256dhKey, expirationTime, userAgent, preference }) {
    const normalizedEndpoint = typeof endpoint === "string" ? endpoint.trim() : "";
    if (!normalizedEndpoint) {
      throw new Error("INVALID_ENDPOINT");
    }
    const normalizedAuth = typeof authKey === "string" ? authKey.trim() : null;
    const normalizedP256dh = typeof p256dhKey === "string" ? p256dhKey.trim() : null;
    const normalizedPreference =
      typeof preference === "string" && preference.trim().length
        ? preference.trim()
        : null;
    const activeFlag = normalizedPreference === "accepted" ? 1 : 0;
    const expiration = normalizeExpiration(expirationTime);
    const agent =
      typeof userAgent === "string" && userAgent.trim().length
        ? userAgent.trim().slice(0, 500)
        : null;

    const existing = db
      .prepare(
        "SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1"
      )
      .get(normalizedEndpoint);

    if (existing) {
      db.prepare(
        `UPDATE push_subscriptions
           SET auth_key = ?, p256dh_key = ?, expiration_time = ?, user_agent = ?, preference = ?, is_active = ?, updated_at = datetime('now'), last_error = NULL
         WHERE endpoint = ?`
      ).run(
        normalizedAuth,
        normalizedP256dh,
        expiration,
        agent,
        normalizedPreference,
        activeFlag,
        normalizedEndpoint
      );
      return mapRow(
        db
          .prepare(
            "SELECT id, endpoint, auth_key, p256dh_key, expiration_time, preference FROM push_subscriptions WHERE endpoint = ? LIMIT 1"
          )
          .get(normalizedEndpoint)
      );
    }

    const insert = db.prepare(
      `INSERT INTO push_subscriptions
         (endpoint, auth_key, p256dh_key, expiration_time, user_agent, preference, is_active, created_at, updated_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const info = insert.run(
      normalizedEndpoint,
      normalizedAuth,
      normalizedP256dh,
      expiration,
      agent,
      normalizedPreference,
      activeFlag
    );
    return this.findById(info.lastInsertRowid);
  },

  findById(id) {
    if (!id) return null;
    const row = db
      .prepare(
        `SELECT id, endpoint, auth_key, p256dh_key, expiration_time, preference
         FROM push_subscriptions
         WHERE id = ?`
      )
      .get(id);
    return mapRow(row);
  },

  deactivateByEndpoint(endpoint) {
    if (!endpoint) return false;
    const normalizedEndpoint =
      typeof endpoint === "string" ? endpoint.trim() : "";
    if (!normalizedEndpoint) return false;
    const result = db
      .prepare(
        `UPDATE push_subscriptions
           SET is_active = 0, updated_at = datetime('now')
         WHERE endpoint = ?`
      )
      .run(normalizedEndpoint);
    return result.changes > 0;
  },

  deactivateById(id) {
    if (!id) return false;
    const result = db
      .prepare(
        `UPDATE push_subscriptions
           SET is_active = 0, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(id);
    return result.changes > 0;
  },

  removeById(id) {
    if (!id) return false;
    const result = db
      .prepare("DELETE FROM push_subscriptions WHERE id = ?")
      .run(id);
    return result.changes > 0;
  },

  listActive() {
    const rows = db
      .prepare(
        `SELECT id, endpoint, auth_key, p256dh_key, expiration_time, preference
         FROM push_subscriptions
         WHERE is_active = 1`
      )
      .all();
    return rows.map(mapRow);
  },

  markDelivered(id) {
    if (!id) return;
    db.prepare(
      `UPDATE push_subscriptions
         SET last_notified_at = datetime('now'), updated_at = datetime('now'), last_error = NULL
       WHERE id = ?`
    ).run(id);
  },

  markFailure(id, errorMessage) {
    if (!id) return;
    const message =
      typeof errorMessage === "string" && errorMessage.trim().length
        ? errorMessage.trim().slice(0, 500)
        : null;
    db.prepare(
      `UPDATE push_subscriptions
         SET last_error = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(message, id);
  },
};

module.exports = PushSubscriptionRepository;
