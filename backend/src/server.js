const app = require("./app");
const { initAutomaticBackups } = require("./services/backupService");

const PORT = process.env.PORT || 3001;

initAutomaticBackups();

app.listen(PORT, () => {
  console.log(`✅ API on http://localhost:${PORT}`);
});
