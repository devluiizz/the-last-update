const bcrypt = require("bcryptjs");
const db = require("../db/sqlite");
const {
  initialize,
  DEFAULT_AVATAR_LIGHT,
  DEFAULT_AVATAR_DARK,
} = require("../db/sqlite/setup");

// Import filesystem utilities for cleaning up avatar files on deletion
const fs = require("fs");
const path = require("path");

initialize();
const ALLOWED_ROLES = new Set(["admin", "jornalista"]);

function normalizeRole(value) {
  if (!value) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "administrador" || raw === "administrator") return "admin";
  if (raw === "admin") return "admin";
  if (raw === "jornalista" || raw === "journalist") return "jornalista";
  return raw;
}

function ensureRole(value) {
  const role = normalizeRole(value);
  return ALLOWED_ROLES.has(role) ? role : "";
}

function normalizeCpf(value) {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

function normalizeDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/");
    return `${year}-${month}-${day}`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function birthToPassword(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return "";
  return `${day}${month}${year}`;
}

function toNumber(value) {
  return Number(value ?? 0) || 0;
}

function mapRow(row) {
  if (!row) return null;
  const totalPublicacoes = toNumber(row.total_publicacoes ?? row.publicacoes);
  const totalExclusoes = toNumber(row.total_exclusoes);
  const passwordChanged = !!row.password_changed;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    team_member: row.team_member ? 1 : 0,
    phone: row.phone || "",
    cpf: row.cpf,
    nascimento: row.nascimento,
    tipo: row.role,
    role: row.role,
    cidade: row.cidade || "",
    about: row.about || "",
    o_que_faz: row.o_que_faz || "",
    instagram: row.instagram || "",
    linkedin: row.linkedin || "",
    twitter: row.twitter || "",
    email_social: row.email_social || "",
    publicacoes: totalPublicacoes,
    total_publicacoes: totalPublicacoes,
    total_exclusoes: totalExclusoes,
    avatar: row.avatar_light,
    avatar_light: row.avatar_light,
    avatar_dark: row.avatar_dark,
    created_at: row.created_at,
    updated_at: row.updated_at,
    password_changed: passwordChanged,
    senha_alterada: passwordChanged,
    deleted_at: row.deleted_at || null,
    is_active:
      row.is_active != null
        ? Number(row.is_active)
          ? 1
          : 0
        : row.deleted_at
        ? 0
        : 1,
    active:
      row.is_active != null ? Number(row.is_active) !== 0 : !row.deleted_at,
  };
}

const MEMBER_BASE_SELECT = `
  SELECT
    m.id,
    m.nome,
    m.email,
    m.team_member,
    m.phone,
    m.cpf,
    m.nascimento,
    m.role,
    m.publicacoes,
    m.avatar_light,
    m.avatar_dark,
    m.cidade,
    m.about,
    m.o_que_faz,
    m.instagram,
    m.linkedin,
    m.twitter,
    m.email_social,
    m.password_changed,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    m.is_active,
    stats.total_publicacoes,
    stats.total_exclusoes
  FROM members m
  LEFT JOIN (
    SELECT
      author_id,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS total_publicacoes,
      SUM(CASE WHEN status IN ('excluded','excluída','excluida') THEN 1 ELSE 0 END) AS total_exclusoes
    FROM publications
    GROUP BY author_id
  ) stats ON stats.author_id = m.id
`;

const MemberRepository = {
  list() {
    // Exclui o superadministrador de teste (ID -1) das listagens comuns.
    const rows = db
      .prepare(
        `${MEMBER_BASE_SELECT}\n WHERE m.deleted_at IS NULL AND m.is_active = 1 AND m.id <> -1 ORDER BY m.nome COLLATE NOCASE`
      )
      .all();
    return rows.map(mapRow);
  },

  listAll() {
    const rows = db
      .prepare(`${MEMBER_BASE_SELECT}\n ORDER BY m.nome COLLATE NOCASE`)
      .all();
    return rows.map(mapRow);
  },

  findById(id) {
    const row = db
      .prepare(
        `${MEMBER_BASE_SELECT}\n WHERE m.id = ? AND m.deleted_at IS NULL AND m.is_active = 1`
      )
      .get(id);
    return mapRow(row);
  },

  findAnyById(id) {
    const row = db.prepare(`${MEMBER_BASE_SELECT}\n WHERE m.id = ?`).get(id);
    return mapRow(row);
  },

  findAnyByCPF(cpf) {
    // Busca um membro, mesmo que esteja excluído
    const stmt = db.prepare(`
    SELECT * FROM members
    WHERE cpf = ?
    LIMIT 1
  `);
    return stmt.get(cpf);
  },

  findSensitiveById(id) {
    return db
      .prepare(
        `SELECT id, nome, email, phone, cpf, nascimento, role, team_member, publicacoes, cidade, about, o_que_faz, instagram, linkedin, twitter, email_social, avatar_light, avatar_dark, password_hash, password_changed, created_at, updated_at FROM members WHERE id = ? AND deleted_at IS NULL AND is_active = 1`
      )
      .get(id);
  },

  restore(id) {
    const current = this.findAnyById(id);
    if (!current) return null;

    // Restaura o membro
    const stmt = db.prepare(`
    UPDATE members
    SET is_active = 1,
        team_member = 1,
        deleted_at = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `);
    const result = stmt.run(id);

    return result;
  },

  findByCPF(cpf) {
    const normalized = normalizeCpf(cpf);
    if (!normalized) return null;
    return db
      .prepare(
        `SELECT id, nome, email, phone, cpf, nascimento, role, team_member, publicacoes, cidade, about, o_que_faz, instagram, linkedin, twitter, email_social, avatar_light, avatar_dark, password_hash, password_changed, created_at, updated_at FROM members WHERE cpf = ? AND deleted_at IS NULL AND is_active = 1`
      )
      .get(normalized);
  },

  create(payload) {
    const nome = (payload.nome || "").trim();
    const email = (payload.email || "").trim().toLowerCase();
    const role = ensureRole(payload.role ?? payload.tipo ?? "");
    const cpf = normalizeCpf(payload.cpf);
    const nascimento = normalizeDate(payload.nascimento);
    if (!nome || !email || !role || cpf.length !== 11 || !nascimento) {
      throw new Error("INVALID_DATA");
    }

    const phone = (payload.phone || payload.phone || "").trim();
    const teamMember =
      payload.team_member === 1 || payload.teamMember === 1 ? 1 : 0;
    const cidade = (payload.cidade || "").trim();
    const about = (payload.about || "").trim();
    const oQueFaz = (payload.o_que_faz ?? payload.oQueFaz ?? "")
      .toString()
      .trim();
    const instagram = (payload.instagram || "").trim();
    const linkedin = (payload.linkedin || "").trim();
    const twitter = (payload.twitter || "").trim();
    const emailSocial = (payload.email_social ?? payload.emailSocial ?? "")
      .toString()
      .trim();

    const passwordSeed = payload.password || birthToPassword(nascimento);
    const passwordHash = bcrypt.hashSync(passwordSeed, 10);
    const avatarLight = payload.avatar_light || DEFAULT_AVATAR_LIGHT;
    const avatarDark = payload.avatar_dark || DEFAULT_AVATAR_DARK;
    const stmt = db.prepare(
      `INSERT INTO members
        (nome, email, cpf, nascimento, password_hash, role, team_member, publicacoes, avatar_light, avatar_dark, phone, cidade, about, o_que_faz, instagram, linkedin, twitter, email_social, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const info = stmt.run(
      nome,
      email,
      cpf,
      nascimento,
      passwordHash,
      role,
      teamMember,
      Number(payload.publicacoes) || 0,
      avatarLight,
      avatarDark,
      phone,
      cidade,
      about,
      oQueFaz,
      instagram,
      linkedin,
      twitter,
      emailSocial
    );
    return this.findById(info.lastInsertRowid);
  },

  update(id, payload) {
    const current = this.findSensitiveById(id);
    if (!current) return null;

    const nome = payload.nome ? String(payload.nome).trim() : current.nome;
    const email = payload.email
      ? String(payload.email).trim().toLowerCase()
      : current.email;

    let role = current.role;
    if (payload.role !== undefined || payload.tipo !== undefined) {
      role = ensureRole(payload.role ?? payload.tipo ?? "");
      if (!role) {
        throw new Error("INVALID_DATA");
      }
    }

    let cpf = current.cpf;
    if (payload.cpf !== undefined) {
      const normalizedCpf = normalizeCpf(payload.cpf);
      if (normalizedCpf.length !== 11) {
        throw new Error("INVALID_DATA");
      }
      cpf = normalizedCpf;
    }

    let nascimento = current.nascimento;
    let birthChanged = false;
    if (payload.nascimento !== undefined && payload.nascimento !== null) {
      const trimmedBirth = String(payload.nascimento).trim();
      if (!trimmedBirth) {
        throw new Error("INVALID_DATA");
      }
      const normalizedBirth = normalizeDate(trimmedBirth);
      if (!normalizedBirth) {
        throw new Error("INVALID_DATA");
      }
      nascimento = normalizedBirth;
      birthChanged = true;
    }

    if (!nome || !email || !role || !cpf || !nascimento) {
      throw new Error("INVALID_DATA");
    }

    const phone =
      payload.phone !== undefined
        ? String(payload.phone || "").trim()
        : current.phone || "";
    const cidade =
      payload.cidade !== undefined
        ? String(payload.cidade || "").trim()
        : current.cidade || "";
    const about =
      payload.about !== undefined
        ? String(payload.about || "").trim()
        : current.about || "";
    const oQueFaz =
      payload.o_que_faz !== undefined
        ? String(payload.o_que_faz || "").trim()
        : payload.oQueFaz !== undefined
        ? String(payload.oQueFaz || "").trim()
        : current.o_que_faz || "";
    const instagram =
      payload.instagram !== undefined
        ? String(payload.instagram || "").trim()
        : current.instagram || "";
    const linkedin =
      payload.linkedin !== undefined
        ? String(payload.linkedin || "").trim()
        : current.linkedin || "";
    const twitter =
      payload.twitter !== undefined
        ? String(payload.twitter || "").trim()
        : current.twitter || "";
    const emailSocial =
      payload.email_social !== undefined
        ? String(payload.email_social || "").trim()
        : payload.emailSocial !== undefined
        ? String(payload.emailSocial || "").trim()
        : current.email_social || "";

    let passwordHash = current.password_hash;
    if (payload.resetPassword) {
      passwordHash = bcrypt.hashSync(birthToPassword(nascimento), 10);
    }
    if (payload.password) {
      passwordHash = bcrypt.hashSync(String(payload.password), 10);
    } else if (birthChanged) {
      passwordHash = bcrypt.hashSync(birthToPassword(nascimento), 10);
    }

    const avatarLight =
      payload.avatar_light || current.avatar_light || DEFAULT_AVATAR_LIGHT;
    const avatarDark =
      payload.avatar_dark || current.avatar_dark || DEFAULT_AVATAR_DARK;
    const publicacoes =
      payload.publicacoes !== undefined
        ? Number(payload.publicacoes) || 0
        : current.publicacoes;
    const teamMember =
      payload.team_member !== undefined || payload.teamMember !== undefined
        ? Number(payload.team_member ?? payload.teamMember)
          ? 1
          : 0
        : current.team_member
        ? 1
        : 0;

    db.prepare(
      `UPDATE members
         SET nome = ?,
             email = ?,
             phone = ?,
             cpf = ?,
             nascimento = ?,
             password_hash = ?,
             role = ?,
             team_member = ?,
             publicacoes = ?,
             avatar_light = ?,
             avatar_dark = ?,
             cidade = ?,
             about = ?,
             o_que_faz = ?,
             instagram = ?,
             linkedin = ?,
             twitter = ?,
             email_social = ?,
             updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      nome,
      email,
      phone,
      cpf,
      nascimento,
      passwordHash,
      role,
      teamMember,
      publicacoes,
      avatarLight,
      avatarDark,
      cidade,
      about,
      oQueFaz,
      instagram,
      linkedin,
      twitter,
      emailSocial,
      id
    );
    return this.findById(id);
  },

  remove(id) {
    // Capture the current member record before marking inactive so we know what avatar to clean up
    const current = this.findAnyById(id);
    const result = db
      .prepare(
        `UPDATE members
            SET team_member = 0,
                is_active = 0,
                deleted_at = COALESCE(deleted_at, datetime('now')),
                updated_at = datetime('now')
          WHERE id = ? AND is_active = 1`
      )
      .run(id);
    // If the deletion was applied and the member had a custom avatar, remove it from the filesystem
    try {
      if (result && result.changes && current) {
        const avatar = current.avatar_light;
        // Only delete if avatar exists, is not one of the defaults and resides in the avatars storage directory
        if (
          avatar &&
          avatar !== DEFAULT_AVATAR_LIGHT &&
          avatar !== DEFAULT_AVATAR_DARK &&
          avatar.startsWith("/storage/avatars/")
        ) {
          // Extract the filename from the relative path and construct the absolute path to the file
          const fileName = avatar.split("/").pop();
          const filePath = path.join(
            __dirname,
            "..",
            "storage",
            "avatars",
            fileName
          );
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              // Silent failure: if removal fails we log but don't break the flow
              console.error("Falha ao remover avatar:", e);
            }
          }
        }
        db.prepare(
          `
            UPDATE members
               SET avatar_light = ?,
                   avatar_dark = ?,
                   updated_at = datetime('now')
             WHERE id = ?
          `
        ).run(DEFAULT_AVATAR_LIGHT, DEFAULT_AVATAR_DARK, id);
      }
    } catch (err) {
      // Ignore unexpected errors during cleanup
      console.error(err);
    }
    return result;
  },

  updateAbout(id, aboutValue) {
    const current = this.findSensitiveById(id);
    if (!current) return null;
    const about = aboutValue == null ? "" : String(aboutValue).trim();
    db.prepare(
      `UPDATE members SET about = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(about, id);
    return this.findById(id);
  },

  updateWhatDo(id, textValue) {
    const current = this.findSensitiveById(id);
    if (!current) return null;
    const text = textValue == null ? "" : String(textValue).trim();
    db.prepare(
      `UPDATE members SET o_que_faz = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(text, id);
    return this.findById(id);
  },

  getDetails(id, options = {}) {
    const includeInactive = !!options.includeInactive;
    const member = includeInactive ? this.findAnyById(id) : this.findById(id);
    if (!member) return null;

    const stats =
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS total_publicacoes,
             SUM(CASE WHEN status IN ('excluded','excluída','excluida') THEN 1 ELSE 0 END) AS total_exclusoes
           FROM publications
           WHERE author_id = ?`
        )
        .get(id) || {};

    const latest = db
      .prepare(
        `SELECT id, title, category, slug, created_at
           FROM publications
           WHERE author_id = ? AND status = 'published'
           ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC
           LIMIT 3`
      )
      .all(id);

    return {
      member,
      stats: {
        publicacoes: toNumber(
          stats.total_publicacoes ?? member.total_publicacoes
        ),
        exclusoes: toNumber(stats.total_exclusoes ?? member.total_exclusoes),
      },
      latestPublicacoes: latest.map((row) => ({
        id: row.id,
        titulo: row.title,
        categoria: row.category,
        slug: row.slug,
        created_at: row.created_at,
      })),
    };
  },

  listTeamMembers() {
    const rows = db
      .prepare(
        `${MEMBER_BASE_SELECT}\n WHERE m.team_member = 1 AND m.deleted_at IS NULL AND m.is_active = 1 ORDER BY m.nome COLLATE NOCASE`
      )
      .all();
    return rows.map(mapRow);
  },

  setTeamMember(id, flag) {
    const current = this.findSensitiveById(id);
    if (!current) return null;
    const value = flag ? 1 : 0;
    db.prepare(
      "UPDATE members SET team_member = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(value, id);
    return this.findById(id);
  },
};

module.exports = MemberRepository;
