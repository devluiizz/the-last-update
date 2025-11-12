#!/usr/bin/env node
/**
 * Gera o arquivo sitemap.xml em frontend/sitemap.xml combinando
 * as páginas estáticas do site com as publicações marcadas como
 * "published" no banco SQLite.
 *
 * Pode ser executado manualmente via `npm run generate:sitemap`
 * ou importado como módulo (`const { generateSitemap } = require(...)`).
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");

const backendDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendDir, "..");
const sitemapPath = path.join(projectRoot, "frontend", "sitemap.xml");
const dbPath = path.join(backendDir, "src", "db", "sqlite", "database.sqlite");

let envLoaded = false;
function ensureEnvLoaded() {
  if (envLoaded) return;
  const envPath = path.join(backendDir, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  envLoaded = true;
}

function resolveBaseUrl() {
  ensureEnvLoaded();
  const rawBaseUrl =
    (process.env.SITE_BASE_URL || "https://www.thelastupdate.com.br").trim() ||
    "https://www.thelastupdate.com.br";
  return rawBaseUrl.replace(/\/+$/, "");
}

const staticPages = [
  { loc: "/", changefreq: "hourly", priority: "1.0" },
  { loc: "/busca", changefreq: "daily", priority: "0.7" },
  { loc: "/quemsomos", changefreq: "monthly", priority: "0.6" },
  { loc: "/politica-de-privacidade", changefreq: "monthly", priority: "0.5" },
  { loc: "/condicoes-de-uso", changefreq: "monthly", priority: "0.5" },
  { loc: "/jornalista", changefreq: "daily", priority: "0.6" },
  { loc: "/login", changefreq: "monthly", priority: "0.4" },
];

function formatIsoDate(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const isoCandidate = normalized.includes("T")
    ? normalized
    : normalized.replace(" ", "T");
  const withZone = /z$/i.test(isoCandidate) ? isoCandidate : `${isoCandidate}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildUrlEntry(baseUrl, { loc, changefreq, priority, lastmod }) {
  const lines = [];
  lines.push("  <url>");
  lines.push(`    <loc>${baseUrl}${loc}</loc>`);
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  lines.push("  </url>");
  return lines.join("\n");
}

function collectPublishedNews() {
  if (!fs.existsSync(dbPath)) {
    console.warn(
      `[sitemap] Banco de dados não encontrado em ${dbPath}. O sitemap conterá apenas páginas estáticas.`
    );
    return [];
  }
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, slug, updated_at, date
         FROM publications
        WHERE status = 'published'
     ORDER BY datetime(date) DESC, id DESC`
    )
    .all();
  return rows.map((row) => {
    const slug = row.slug && row.slug.trim() ? row.slug.trim() : null;
    const pathSuffix = slug
      ? `/noticia/${encodeURIComponent(slug)}`
      : `/noticia?id=${row.id}`;
    return {
      loc: pathSuffix,
      changefreq: "hourly",
      priority: "0.9",
      lastmod: formatIsoDate(row.updated_at || row.date),
    };
  });
}

function generateSitemap({ silent = false } = {}) {
  const baseUrl = resolveBaseUrl();
  const urls = [...staticPages, ...collectPublishedNews()];
  const xmlParts = [];
  xmlParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  xmlParts.push(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
  );
  urls.forEach((entry) => {
    xmlParts.push(buildUrlEntry(baseUrl, entry));
  });
  xmlParts.push(`</urlset>`);
  const xml = `${xmlParts.join("\n")}\n`;
  fs.writeFileSync(sitemapPath, xml, "utf8");
  if (!silent) {
    console.log(
      `[sitemap] Atualizado com ${urls.length} URLs em ${sitemapPath}`
    );
  }
  return { urls: urls.length, sitemapPath, baseUrl };
}

module.exports = { generateSitemap };

if (require.main === module) {
  try {
    generateSitemap({ silent: false });
  } catch (err) {
    console.error("[sitemap] Falha ao gerar sitemap", err);
    process.exit(1);
  }
}
