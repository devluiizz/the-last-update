const { Router } = require("express");
const { searchPublications } = require("../controllers/buscaController");

const router = Router();

router.get("/", searchPublications);

module.exports = router;
