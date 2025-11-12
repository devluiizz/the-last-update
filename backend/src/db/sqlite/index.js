const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "database.sqlite");

const db = new Database(dbPath);

try {
  db.pragma("journal_mode = WAL");
} catch (err) {}
db.pragma("foreign_keys = ON");

module.exports = db;
