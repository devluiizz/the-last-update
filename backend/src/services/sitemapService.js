const { generateSitemap } = require("../../scripts/generate-sitemap");

const AUTO_SITEMAP =
  process.env.ENABLE_AUTO_SITEMAP !== "false" &&
  process.env.NODE_ENV !== "test";
const DEBOUNCE_MS = Number(process.env.SITEMAP_DEBOUNCE_MS || 5000);

let timer = null;
let running = false;
let pending = false;

async function runGeneration() {
  if (!AUTO_SITEMAP) return;
  if (running) {
    pending = true;
    return;
  }
  running = true;
  pending = false;
  try {
    await Promise.resolve(generateSitemap({ silent: true }));
  } catch (err) {
    console.error("[sitemap] Falha ao regenerar sitemap", err);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      scheduleSitemapRefresh();
    }
  }
}

function scheduleSitemapRefresh() {
  if (!AUTO_SITEMAP) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(runGeneration, Math.max(DEBOUNCE_MS, 1000));
}

module.exports = {
  scheduleSitemapRefresh,
};
