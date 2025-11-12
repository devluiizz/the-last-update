const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();

let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

const DATA_DIR = path.join(__dirname, "..", "data");
const CACHE_DIR = path.join(__dirname, "..", "storage", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "cities-br.json");
const FALLBACK_FILE = path.join(DATA_DIR, "cities-br.json");
const IBGE_URL =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const json = JSON.parse(raw);
      return Array.isArray(json) && json.length ? json : null;
    }
  } catch (e) {
    console.error("[geo] readJsonSafe:", e.message);
  }
  return null;
}

function writeJsonSafe(file, payload) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(payload), "utf-8");
  } catch (e) {
    console.error("[geo] writeJsonSafe:", e.message);
  }
}

function extractUF(item) {
  const a = item?.microrregiao?.mesorregiao?.UF?.sigla;
  const b = item?.mesorregiao?.UF?.sigla;
  const c = item?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla;
  const d = item?.UF?.sigla;
  return a || b || c || d || null;
}

function toDisplayName(item) {
  const nome = item?.nome?.trim();
  if (!nome) return null;
  const uf = extractUF(item);
  return uf ? `${nome} - ${uf}` : nome;
}

async function fetchIBGECities() {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000); // 12s
  try {
    const res = await fetchFn(IBGE_URL, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const names = [];
    for (const m of data) {
      const n = toDisplayName(m);
      if (n) names.push(n);
    }

    const unique = Array.from(new Set(names)).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    if (!unique.length) throw new Error("Lista vazia do IBGE");
    return unique;
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/br/cities", async (req, res) => {
  try {
    let list = readJsonSafe(CACHE_FILE);
    if (list) return res.json(list);

    try {
      list = await fetchIBGECities();
      if (list?.length) {
        writeJsonSafe(CACHE_FILE, list);
        return res.json(list);
      }
    } catch (e) {
      console.error("[geo] IBGE fetch failed:", e.message);
    }

    list = readJsonSafe(FALLBACK_FILE);
    if (list) return res.json(list);

    return res
      .status(503)
      .json({ error: "Lista de cidades indisponível no momento." });
  } catch (err) {
    console.error("[geo] /br/cities error:", err);
    return res
      .status(500)
      .json({ error: "Não foi possível obter a lista de cidades." });
  }
});

module.exports = router;
