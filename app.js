const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const compression = require("compression");
const crypto = require("crypto");

const config = require("./config");
const Visit = require("./models/Visit");
const { sameOrigin } = require("./middlewares/security");
const { viewHelpers } = require("./middlewares/locals");
const limits = require("./lib/rateLimits");
const { wantsJson } = require("./lib/util");

function createApp({ sessionStore } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  viewHelpers(app);

  // Canonical host + HTTPS in production.
  if (config.isProd) {
    const canonicalHost = new URL(config.siteUrl).host;
    app.use((req, res, next) => {
      const host = req.get("host");
      if (req.get("x-forwarded-proto") === "http" || (host && host !== canonicalHost && host.replace(/^www\./, "") === canonicalHost.replace(/^www\./, ""))) {
        return res.redirect(301, `${config.siteUrl}${req.originalUrl}`);
      }
      next();
    });
  }

  app.use(compression());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          formAction: ["'self'", "https://www.zarinpal.com", "https://sandbox.zarinpal.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // Static assets. Hashed-by-version CSS/JS can be cached long; uploads a week.
  app.use(
    express.static(path.join(__dirname, "public"), {
      maxAge: config.isProd ? "30d" : 0,
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}uploads${path.sep}`)) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        }
      },
    })
  );

  app.use(express.json({ limit: "200kb" }));
  app.use(express.urlencoded({ extended: false, limit: "200kb" }));

  app.use(
    session({
      name: "sessionId",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store:
        sessionStore ||
        MongoStore.create({ mongoUrl: config.dbUrl, ttl: 30 * 24 * 60 * 60, autoRemove: config.sessionAutoRemove }),
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(sameOrigin);

  // Lightweight page-view analytics (non-blocking).
  app.use((req, res, next) => {
    if (req.method === "GET" && !/^\/(admin|api|dev)\b/.test(req.path) && !req.path.includes(".")) {
      const visitorId = crypto.createHash("md5").update(`${req.ip}-${req.get("user-agent") || ""}`).digest("hex");
      const since = new Date(Date.now() - 5 * 60 * 1000);
      Visit.findOne({ path: req.path, visitorId, visitTimestamp: { $gte: since } })
        .select("_id")
        .lean()
        .then((seen) => {
          if (seen) return;
          const d = new Date();
          return Visit.create({
            path: req.path,
            title: req.originalUrl.slice(0, 300),
            visitorId,
            ip: req.ip,
            userAgent: (req.get("user-agent") || "").slice(0, 300),
            referer: (req.get("referer") || "").slice(0, 300),
            visitDate: require("./helper/getPersianDate").getPersianDate(d),
            visitTimestamp: d,
          });
        })
        .catch(() => {});
    }
    next();
  });

  // APIs
  app.use("/api", limits.api);
  app.use("/api/auth", require("./routes/api/auth"));
  app.use("/api/cart", require("./routes/api/cart"));
  app.use("/api/order", require("./routes/api/order"));
  app.use("/api/search", require("./routes/api/search"));
  app.use("/api/products", require("./routes/api/reviews"));
  app.use("/api/account", require("./routes/api/account"));

  // Price-comparison partner (Torob) — unchanged contract.
  app.use("/", require("./routes/torobRoutes"));

  // Admin panel
  app.use("/admin", require("./routes/admin"));

  // Storefront
  app.use("/", require("./routes/pages"));

  // 404
  app.use(async (req, res) => {
    if (wantsJson(req)) return res.status(404).json({ success: false, message: "پیدا نشد" });
    await renderError(req, res, 404);
  });

  // Errors
  // eslint-disable-next-line no-unused-vars
  app.use(async (err, req, res, next) => {
    const status = err.statusCode || err.status || 500;
    if (status >= 500) {
      console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
      try {
        const dir = path.join(__dirname, "logs");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(
          path.join(dir, "errors.log"),
          `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ip=${req.ip}\n${err.stack}\n\n`
        );
      } catch {}
    }
    if (res.headersSent) return;
    const message =
      status >= 500 ? "مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید" : err.message || "درخواست نامعتبر";
    if (wantsJson(req)) {
      return res.status(status).json({ success: false, message, ...(err.extra || {}) });
    }
    await renderError(req, res, status, status < 500 ? message : undefined);
  });

  return app;
}

async function renderError(req, res, status, message) {
  try {
    await new Promise((resolve) => require("./middlewares/locals").pageLocals(req, res, resolve));
  } catch {}
  res.status(status).render("pages/error", {
    status,
    message,
    title: status === 404 ? "صفحه پیدا نشد" : "خطا",
    noindex: true,
  });
}

module.exports = { createApp };
