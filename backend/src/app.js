const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { verifyToken, TOKEN_COOKIE } = require("./auth/token");
const MemberRepository = require("./repositories/memberRepository");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "100mb" }));
app.use(
  express.urlencoded({ extended: true, limit: "100mb", parameterLimit: 100000 })
);
app.use(cookieParser());

const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsDir));

const frontendDir = path.join(__dirname, "..", "..", "frontend");

const uploadsRouter = require("./routes/uploads");
app.use("/api/uploads", uploadsRouter);

function ensureDashboardSession(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) {
    return res.redirect("/login");
  }
  try {
    const decoded = verifyToken(token);
    if (decoded?.exp && decoded.exp * 1000 <= Date.now()) {
      res.clearCookie(TOKEN_COOKIE, { path: "/" });
      return res.redirect("/login");
    }
    const member = MemberRepository.findById(decoded.sub);
    if (!member) {
      res.clearCookie(TOKEN_COOKIE, { path: "/" });
      return res.redirect("/login");
    }
    return next();
  } catch (err) {
    res.clearCookie(TOKEN_COOKIE, { path: "/" });
    return res.redirect("/login");
  }
}

const page = (p) => path.join(frontendDir, "pages", p);

app.get("/", (_req, res) => res.sendFile(page("index.html")));
app.get("/login", (_req, res) => res.sendFile(page("login.html")));
app.get("/quemsomos", (_req, res) => res.sendFile(page("quemsomos.html")));
app.get("/politicas", (_req, res) =>
  res.sendFile(page("politica-de-privacidade.html"))
);
app.get("/condicoes", (_req, res) =>
  res.sendFile(page("condicoes-de-uso.html"))
);
app.get("/dashboard", ensureDashboardSession, (_req, res) =>
  res.sendFile(page("dashboard.html"))
);

app.get("/pages/dashboard.html", ensureDashboardSession, (_req, res) =>
  res.sendFile(page("dashboard.html"))
);

app.get("/noticia/:slug", (_req, res) => res.sendFile(page("noticia.html")));

app.get("/noticia", (_req, res) => res.sendFile(page("noticia.html")));

app.get("/busca", (_req, res) => res.sendFile(page("busca.html")));
app.get("/busca.html", (req, res) => {
  const qs = req.originalUrl.split("?")[1];
  const target = "/busca" + (qs ? `?${qs}` : "");
  return res.redirect(301, target);
});

app.get("/jornalista", (_req, res) => res.sendFile(page("jornalista.html")));
app.get("/jornalista.html", (_req, res) =>
  res.sendFile(page("jornalista.html"))
);

app.use(express.static(frontendDir));

const allowOrigin = process.env.CORS_ORIGIN || "http://localhost:3001";
app.use(cors({ origin: allowOrigin, credentials: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use("/storage", express.static(path.join(__dirname, "storage")));

const routes = require("./routes");
app.use("/api", routes);

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use((err, req, res, next) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      ok: false,
      error: "PayloadTooLargeError",
      message:
        "Arquivo muito grande. Tente um arquivo menor ou envie a mídia como upload de arquivo.",
    });
  }
  next(err);
});
module.exports = app;
