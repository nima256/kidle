// Data every storefront page needs: signed-in customer, cart badge, menu, store settings.
const User = require("../models/User");
const Setting = require("../models/Setting");
const catalog = require("../lib/catalog");
const cartService = require("../lib/cart");
const config = require("../config");
const { formatPrice, toFaDigits } = require("../lib/util");

async function pageLocals(req, res, next) {
  try {
    const [user, tree, settings, cartCount] = await Promise.all([
      req.session.userId ? User.findById(req.session.userId).select("fullName mobile savedAddress").lean() : null,
      catalog.loadTree(),
      Setting.get(),
      cartService.count(req),
    ]);
    if (req.session.userId && !user) delete req.session.userId;
    Object.assign(res.locals, {
      user,
      cartCount,
      menu: tree.roots,
      settings,
      siteUrl: config.siteUrl,
      path: req.path,
      canonical: config.siteUrl + req.path,
      meta: {},
      noindex: false,
    });
    next();
  } catch (e) {
    next(e);
  }
}

// Content hash of the built CSS/JS so browsers can cache them for 30 days safely.
function assetVersion() {
  const crypto = require("crypto");
  const fs = require("fs");
  const path = require("path");
  const h = crypto.createHash("md5");
  for (const f of ["public/css/app.css", "public/icons.svg"]) {
    try { h.update(fs.readFileSync(path.join(__dirname, "..", f))); } catch {}
  }
  try {
    const dir = path.join(__dirname, "..", "public/js");
    for (const f of fs.readdirSync(dir).sort()) h.update(fs.readFileSync(path.join(dir, f)));
  } catch {}
  return h.digest("hex").slice(0, 10);
}

function viewHelpers(app) {
  const v = assetVersion();
  Object.assign(app.locals, {
    v,
    asset: (p) => `${p}?v=${v}`,
    icon: (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="/icons.svg?v=${v}#${name}"/></svg>`,
    price: formatPrice,
    fa: toFaDigits,
    // Kept for backwards compatibility with any older template.
    toPersianDigits: (n) => toFaDigits(formatPrice(n)),
    toPersianDigitsForSizes: toFaDigits,
    discountPercent: (p) => (p.offerPrice && p.offerPrice < p.price ? Math.round(((p.price - p.offerPrice) / p.price) * 100) : 0),
    finalPrice: (p) => (p.offerPrice && p.offerPrice < p.price ? p.offerPrice : p.price),
    img: (p, i = 0) => p?.images?.[i]?.url || "",
    faDate: (d, opts) => (d ? new Date(d).toLocaleDateString("fa-IR", opts || { year: "numeric", month: "long", day: "numeric" }) : ""),
    json: (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e"),
  });
}

module.exports = { pageLocals, viewHelpers };
