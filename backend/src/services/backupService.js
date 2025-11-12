const { runBackup } = require("../../scripts/backup");

const AUTO_BACKUP_ENABLED =
  process.env.ENABLE_AUTO_BACKUP !== "false" &&
  process.env.NODE_ENV !== "test";
const INTERVAL_MINUTES = Number(process.env.SQLITE_BACKUP_INTERVAL_MINUTES || 360); // 6h
const INITIAL_DELAY_MINUTES = Number(
  process.env.SQLITE_BACKUP_INITIAL_DELAY_MINUTES || 15
);

let timer = null;
let running = false;

function scheduleNext(delayMs) {
  if (!AUTO_BACKUP_ENABLED) return;
  if (timer) clearTimeout(timer);
  const interval =
    typeof delayMs === "number"
      ? delayMs
      : Math.max(INTERVAL_MINUTES, 5) * 60 * 1000;
  timer = setTimeout(async () => {
    if (running) {
      scheduleNext(60 * 1000);
      return;
    }
    running = true;
    try {
      await Promise.resolve(runBackup({ silent: true }));
    } catch (err) {
      console.error("[backup] Backup automático falhou", err);
    } finally {
      running = false;
      scheduleNext();
    }
  }, interval);
}

function initAutomaticBackups() {
  if (!AUTO_BACKUP_ENABLED) {
    console.log("[backup] Backups automáticos desabilitados");
    return;
  }
  if (timer) return;
  const initialDelayMs = Math.max(INITIAL_DELAY_MINUTES, 1) * 60 * 1000;
  scheduleNext(initialDelayMs);
  console.log(
    `[backup] Backups automáticos agendados (intervalo: ${Math.max(
      INTERVAL_MINUTES,
      5
    )} min)`
  );
}

module.exports = {
  initAutomaticBackups,
};
