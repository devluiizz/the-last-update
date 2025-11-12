#!/usr/bin/env node
/**
 * Cria um backup do banco SQLite e aplica política básica de retenção.
 * Pode ser executado manualmente (`npm run backup`) ou importado como
 * módulo (`const { runBackup } = require(...)`).
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const backendDir = path.resolve(__dirname, "..");
const dbFile = path.resolve(backendDir, "src/db/sqlite/database.sqlite");
const backupsDir = path.resolve(backendDir, "backups");

let envLoaded = false;
function ensureEnvLoaded() {
  if (envLoaded) return;
  const envPath = path.join(backendDir, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  envLoaded = true;
}

function getNumberEnv(name, fallback) {
  ensureEnvLoaded();
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanupBackups({ silent = true } = {}) {
  const maxFiles = getNumberEnv("SQLITE_BACKUP_MAX_FILES", 60);
  const retentionDays = getNumberEnv("SQLITE_BACKUP_RETENTION_DAYS", 14);
  if (!fs.existsSync(backupsDir)) return;

  const entries = fs
    .readdirSync(backupsDir)
    .filter((name) => /^backup-.*\.sqlite$/i.test(name))
    .map((name) => {
      const fullPath = path.join(backupsDir, name);
      const stats = fs.statSync(fullPath);
      return { name, path: fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  if (!entries.length) return;

  const now = Date.now();
  const expiresBefore = now - retentionDays * 24 * 60 * 60 * 1000;
  const toDelete = new Set();

  entries.forEach((entry) => {
    if (entry.mtimeMs < expiresBefore) {
      toDelete.add(entry);
    }
  });

  if (maxFiles > 0) {
    while (entries.length - toDelete.size > maxFiles) {
      const oldest = entries.shift();
      toDelete.add(oldest);
    }
  }

  for (const entry of toDelete) {
    try {
      fs.unlinkSync(entry.path);
      if (!silent) {
        console.log(`[backup] Removido backup antigo: ${entry.name}`);
      }
    } catch (err) {
      console.error(`[backup] Falha ao remover ${entry.path}`, err);
    }
  }
}

function runBackup({ silent = false } = {}) {
  ensureEnvLoaded();
  ensureDir(backupsDir);
  if (!fs.existsSync(dbFile)) {
    throw new Error(`Database file not found at ${dbFile}`);
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupsDir, `backup-${timestamp}.sqlite`);

  fs.copyFileSync(dbFile, dest);
  if (!silent) {
    console.log(`[backup] Backup salvo em ${dest}`);
  }

  cleanupBackups({ silent });
  return { backupPath: dest };
}

module.exports = { runBackup };

if (require.main === module) {
  try {
    runBackup({ silent: false });
  } catch (err) {
    console.error("[backup] Falha ao criar backup", err);
    process.exit(1);
  }
}
