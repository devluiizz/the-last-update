#!/usr/bin/env node
/*
 * SQLite/VPS Health Diagnostic Script
 *    node scripts/health.js
 */

const fs = require("fs");
const path = require("path");
let Database;
try {
  Database = require("better-sqlite3");
} catch (err) {
  console.error(
    "Erro ao carregar better-sqlite3. Certifique-se de que as dependências estejam instaladas."
  );
  process.exit(1);
}

const dbPath = path.resolve(__dirname, "../src/db/sqlite/database.sqlite");
const backupsDir = path.resolve(__dirname, "../backups");

function formatDate(date) {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function getLatestBackupInfo() {
  try {
    if (!fs.existsSync(backupsDir)) return null;
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith(".sqlite"))
      .sort();
    if (!files.length) return null;
    const latestFile = files[files.length - 1];
    const fullPath = path.join(backupsDir, latestFile);
    const stats = fs.statSync(fullPath);
    return { file: latestFile, mtime: stats.mtime };
  } catch (err) {
    return null;
  }
}

function analyzeDatabase() {
  const results = {};
  if (!fs.existsSync(dbPath)) {
    console.error(`Arquivo do banco não encontrado: ${dbPath}`);
    return results;
  }
  const stats = fs.statSync(dbPath);
  results.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const db = new Database(dbPath, { readonly: true });
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all();
  const tableCounts = {};
  for (const row of tables) {
    const name = row.name;
    const stmt = db.prepare(`SELECT COUNT(*) AS count FROM \`${name}\``);
    const res = stmt.get();
    tableCounts[name] = res.count;
  }
  db.close();
  results.tables = tableCounts;
  return results;
}

function main() {
  console.log("📊 Diagnóstico do banco SQLite:");
  const info = analyzeDatabase();
  if (info.sizeMB) {
    console.log(`→ Tamanho do arquivo: ${info.sizeMB} MB`);
  }
  if (info.tables) {
    console.log("→ Quantidade de registros por tabela:");
    Object.entries(info.tables).forEach(([table, count]) => {
      console.log(`   - ${table}: ${count}`);
    });
  }
  const backup = getLatestBackupInfo();
  if (backup) {
    console.log(
      `→ Último backup: ${backup.file} (${formatDate(backup.mtime)})`
    );
  } else {
    console.log("→ Nenhum backup encontrado");
  }
  console.log(
    "\nDica: utilize ferramentas como top, htop ou pm2 para monitorar o uso de CPU e memória da sua VPS."
  );
}

main();
