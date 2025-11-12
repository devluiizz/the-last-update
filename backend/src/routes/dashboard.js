const { Router } = require("express");
const requireAuth = require("../middlewares/requireAuth");
const DashboardRepository = require("../repositories/dashboardRepository");

const router = Router();

router.use(requireAuth);

router.get("/overview", (req, res) => {
  const range = req.query.range || "30d";
  const weekStart = req.query.weekStart || null;
  const membersSort = req.query.membersSort === "views" ? "views" : "publications";
  const membersLimit = parseInt(req.query.membersLimit, 10);
  const membersOffset = parseInt(req.query.membersOffset, 10);
  try {
    const payload = DashboardRepository.getOverviewPayload({
      range,
      weekStart,
      userId: req.user.id,
      role: req.user.role,
      membersSort,
      membersLimit: Number.isInteger(membersLimit) && membersLimit > 0 ? membersLimit : 5,
      membersOffset: Number.isInteger(membersOffset) && membersOffset >= 0 ? membersOffset : 0,
    });
    return res.json(payload);
  } catch (err) {
    console.error("Erro ao carregar visão geral do dashboard", err);
    return res
      .status(500)
      .json({ error: "Não foi possível carregar os dados da visão geral." });
  }
});

module.exports = router;
