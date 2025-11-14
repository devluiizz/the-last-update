const bcrypt = require("bcryptjs");
const db = require("./index");

const DEFAULT_AVATAR_LIGHT = "/assets/img/avatares/avatar_lightMode.png";
const DEFAULT_AVATAR_DARK = "/assets/img/avatares/avatar_darkMode.png";

const TEST_ADMIN = {
  nome: "Administrador Teste",
  email: "admin@thelastupdate.com",
  cpf: "00000000000",
  nascimento: "2005-01-26",
  senha: "26012005",
  role: "admin",
};

let initialized = false;

function ensurePublicationReasonColumn() {
  try {
    const rows = db.prepare("PRAGMA table_info('publications')").all();
    const hasColumn = rows.some(
      (r) => String(r.name).toLowerCase() === "motivo_exclusao"
    );
    if (!hasColumn) {
      db.exec("ALTER TABLE publications ADD COLUMN motivo_exclusao TEXT");
    }
  } catch (e) {}
}

function ensurePublicationImageCreditColumn() {
  try {
    const rows = db.prepare("PRAGMA table_info('publications')").all();
    const hasColumn = rows.some(
      (r) => String(r.name).toLowerCase() === "image_credit"
    );
    if (!hasColumn) {
      db.exec("ALTER TABLE publications ADD COLUMN image_credit TEXT");
    }
  } catch (e) {
    console.error("ensurePublicationImageCreditColumn error:", e);
  }
}

function ensureMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      cpf TEXT NOT NULL UNIQUE,
      nascimento TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_changed INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL CHECK (role IN ('admin','jornalista')),
      team_member INTEGER NOT NULL DEFAULT 0,
      publicacoes INTEGER NOT NULL DEFAULT 0,
      avatar_light TEXT NOT NULL,
      avatar_dark TEXT NOT NULL,
      telefone TEXT,
      cidade TEXT,
      about TEXT,
      o_que_faz TEXT,
      instagram TEXT,
      linkedin TEXT,
      twitter TEXT,
      email_social TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );

    -- Tabela para armazenar publicações e rascunhos
    CREATE TABLE IF NOT EXISTS publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      category TEXT NOT NULL,
      description TEXT,
      image TEXT,
      image_credit TEXT,
      content TEXT,
      status TEXT NOT NULL CHECK (status IN ('draft','review','published','excluded')),
      views INTEGER NOT NULL DEFAULT 0,
      is_highlighted INTEGER NOT NULL DEFAULT 0,
      -- número de visualizações únicas por visitante (incrementado via cookie)
      visitas_unicas INTEGER NOT NULL DEFAULT 0,
      -- removido: número de cliques contabilizados dentro da publicação (botões de compartilhar, etc.)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(author_id) REFERENCES members(id) ON DELETE CASCADE
    );

    -- Tabela para definir quais publicações são destaque nos cards da home
    CREATE TABLE IF NOT EXISTS highlights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_number INTEGER NOT NULL UNIQUE CHECK (card_number BETWEEN 1 AND 3),
      publication_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(publication_id) REFERENCES publications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_user_id INTEGER,
      to_role TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      url TEXT,
      meta TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(to_user_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(to_role);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      auth_key TEXT,
      p256dh_key TEXT,
      expiration_time TEXT,
      user_agent TEXT,
      preference TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_notified_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);
  `);
  ensurePublicationReasonColumn();
  ensurePublicationImageCreditColumn();
  ensureMemberExtraColumns();
  ensurePublicationStatusReview();
  ensurePublicationUniqueClicksColumns();
  ensurePublicationSlug();
  ensurePublicationHighlightFlag();
}

function ensureMemberExtraColumns() {
  try {
    const rows = db.prepare("PRAGMA table_info('members')").all();
    const existing = new Set(rows.map((r) => String(r.name).toLowerCase()));
    const additions = [];
    if (!existing.has("team_member")) {
      additions.push(
        "ALTER TABLE members ADD COLUMN team_member INTEGER NOT NULL DEFAULT 0"
      );
    }
    if (!existing.has("telefone")) {
      additions.push("ALTER TABLE members ADD COLUMN telefone TEXT");
    }
    if (!existing.has("cidade")) {
      additions.push("ALTER TABLE members ADD COLUMN cidade TEXT");
    }
    if (!existing.has("about")) {
      additions.push("ALTER TABLE members ADD COLUMN about TEXT");
    }
    if (!existing.has("o_que_faz")) {
      additions.push("ALTER TABLE members ADD COLUMN o_que_faz TEXT");
    }
    if (!existing.has("instagram")) {
      additions.push("ALTER TABLE members ADD COLUMN instagram TEXT");
    }
    if (!existing.has("linkedin")) {
      additions.push("ALTER TABLE members ADD COLUMN linkedin TEXT");
    }
    if (!existing.has("twitter")) {
      additions.push("ALTER TABLE members ADD COLUMN twitter TEXT");
    }
    if (!existing.has("email_social")) {
      additions.push("ALTER TABLE members ADD COLUMN email_social TEXT");
    }
    if (!existing.has("password_changed")) {
      additions.push(
        "ALTER TABLE members ADD COLUMN password_changed INTEGER NOT NULL DEFAULT 0"
      );
    }
    if (!existing.has("deleted_at")) {
      additions.push("ALTER TABLE members ADD COLUMN deleted_at TEXT");
    }
    if (!existing.has("is_active")) {
      additions.push(
        "ALTER TABLE members ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
      );
    }
    additions.forEach((sql) => {
      db.exec(sql);
    });
    if (!existing.has("is_active")) {
      db.exec(
        "UPDATE members SET is_active = CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END"
      );
    }
  } catch (err) {
    console.error("ensureMemberExtraColumns error:", err);
  }
}

function ensureSeedAdmin() {
  // Verifica se já existe um administrador de teste com ID -1.
  const existingById = db
    .prepare("SELECT id FROM members WHERE id = -1 LIMIT 1")
    .get();
  if (existingById) return;
  // Caso já exista um usuário com o mesmo CPF do admin de teste, não insere
  // outro registro para evitar violação de unicidade.
  const existingByCpf = db
    .prepare("SELECT id FROM members WHERE cpf = ? LIMIT 1")
    .get(TEST_ADMIN.cpf);
  if (existingByCpf) return;
  const passwordHash = bcrypt.hashSync(TEST_ADMIN.senha, 10);
  // Insere explicitamente o ID = -1 para o superadministrador de teste.
  db.prepare(
    `INSERT INTO members (
      id, nome, email, cpf, nascimento, password_hash, role, team_member, publicacoes, avatar_light, avatar_dark, telefone, cidade, about, o_que_faz, instagram, linkedin, twitter, email_social
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    -1,
    TEST_ADMIN.nome,
    TEST_ADMIN.email,
    TEST_ADMIN.cpf,
    TEST_ADMIN.nascimento,
    passwordHash,
    TEST_ADMIN.role,
    0,
    0,
    DEFAULT_AVATAR_LIGHT,
    DEFAULT_AVATAR_DARK,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  );
}

function initialize() {
  if (initialized) return;
  ensureMigrations();
  ensureSeedAdmin();
  initialized = true;
}

module.exports = {
  initialize,
  DEFAULT_AVATAR_LIGHT,
  DEFAULT_AVATAR_DARK,
};

function ensurePublicationHighlightFlag() {
  try {
    const rows = db.prepare("PRAGMA table_info('publications')").all();
    const hasColumn = rows.some(
      (r) => String(r.name).toLowerCase() === "is_highlighted"
    );
    if (!hasColumn) {
      db.exec(
        "ALTER TABLE publications ADD COLUMN is_highlighted INTEGER NOT NULL DEFAULT 0"
      );
    }
    db.exec(`
      UPDATE publications
         SET is_highlighted = 1
       WHERE id IN (SELECT publication_id FROM highlights)
    `);
  } catch (err) {
    console.error("ensurePublicationHighlightFlag error:", err);
  }
}

function ensurePublicationStatusReview() {
  try {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='publications'"
      )
      .get();
    const sql = (row && row.sql) || "";
    if (sql.includes("'review'")) return;
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE IF NOT EXISTS publications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        date TEXT NOT NULL DEFAULT (date('now')),
        category TEXT NOT NULL,
        description TEXT,
        image TEXT,
        image_credit TEXT,
        content TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft','review','published','excluded')),
        views INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        motivo_exclusao TEXT,
        FOREIGN KEY(author_id) REFERENCES members(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      INSERT INTO publications_new (id, title, author_id, date, category, description, image, image_credit, content, status, views, created_at, updated_at, motivo_exclusao)
      SELECT id, title, author_id, date, category, description, image, image_credit, content, status, views, created_at, updated_at, motivo_exclusao
      FROM publications;
    `);
    db.exec("DROP TABLE publications");
    db.exec("ALTER TABLE publications_new RENAME TO publications");
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    console.error(
      "Erro migrando tabela publications para incluir status 'review':",
      e
    );
  }
}

// Garante que as colunas para visualizações únicas e cliques existam na tabela publications.
// As colunas são adicionadas com valor padrão 0 caso ainda não existam. Isso permite migrações
// sem perda de dados em bancos já existentes.
// Garante que a coluna de visualizações únicas exista e remove a coluna de cliques se presente.
function ensurePublicationUniqueClicksColumns() {
  try {
    const rows = db.prepare("PRAGMA table_info('publications')").all();
    const columns = new Set(rows.map((r) => String(r.name).toLowerCase()));
    const statements = [];
    // Adiciona coluna de visitas únicas se não existir
    if (!columns.has('visitas_unicas')) {
      statements.push(
        "ALTER TABLE publications ADD COLUMN visitas_unicas INTEGER NOT NULL DEFAULT 0"
      );
    }
    // Se a coluna de cliques existir, remove-a migrando a tabela
    if (columns.has('cliques')) {
      db.exec('BEGIN');
      try {
        // Cria nova tabela sem a coluna de cliques; inclui slug e motivo_exclusao caso existam
        db.exec(`
          CREATE TABLE IF NOT EXISTS publications_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            date TEXT NOT NULL DEFAULT (date('now')),
            category TEXT NOT NULL,
            description TEXT,
            image TEXT,
            image_credit TEXT,
            content TEXT,
            status TEXT NOT NULL CHECK (status IN ('draft','review','published','excluded')),
            views INTEGER NOT NULL DEFAULT 0,
            visitas_unicas INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            motivo_exclusao TEXT,
            slug TEXT,
            FOREIGN KEY(author_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);
        // Copia dados existentes, ignorando a coluna de cliques
        db.exec(`
          INSERT INTO publications_new (id, title, author_id, date, category, description, image, image_credit, content, status, views, visitas_unicas, created_at, updated_at, motivo_exclusao, slug)
          SELECT id, title, author_id, date, category, description, image, image_credit, content, status, views, visitas_unicas, created_at, updated_at, motivo_exclusao, slug
          FROM publications;
        `);
        db.exec('DROP TABLE publications');
        db.exec('ALTER TABLE publications_new RENAME TO publications');
        db.exec('COMMIT');
        // Garante índice no campo slug após a migração
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_publications_slug ON publications(slug);"
        );
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
    // Executa quaisquer declarações pendentes
    statements.forEach((sql) => {
      db.exec(sql);
    });
  } catch (err) {
    console.error('ensurePublicationUniqueClicksColumns error:', err);
  }
}

function ensurePublicationSlug() {
  try {
    let hasSlug = false;
    try {
      db.prepare("SELECT slug FROM publications LIMIT 1").get();
      hasSlug = true;
    } catch (e) {
      hasSlug = false;
    }
    if (!hasSlug) {
      db.exec("ALTER TABLE publications ADD COLUMN slug TEXT;");
    }
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_publications_slug ON publications(slug);"
    );
  } catch (e) {
    console.error("ensurePublicationSlug error:", e);
  }
}
