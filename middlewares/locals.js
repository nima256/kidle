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

// Category → SVG garment icon (replaces emoji, which render inconsistently across platforms).
const CAT_ICONS = ["c-dress", "c-tshirt", "c-onesie", "c-pants", "c-socks", "c-bow", "c-hat", "c-shoe", "c-set", "hanger"];
const EMOJI_MAP = { "👗": "c-dress", "👚": "c-tshirt", "👕": "c-tshirt", "🍼": "c-onesie", "👶": "c-onesie", "👖": "c-pants", "🩳": "c-pants", "🧦": "c-socks", "🎀": "c-bow", "🧢": "c-hat", "👒": "c-hat", "🎩": "c-hat", "👟": "c-shoe", "👞": "c-shoe", "👠": "c-shoe", "🥿": "c-shoe" };
const NAME_MAP = [[/پیراهن|دختر|سارافون|دامن/, "c-dress"], [/نوزاد|سرهمی|بادی/, "c-onesie"], [/شلوار|شلوارک/, "c-pants"], [/جوراب|اکسسوری/, "c-socks"], [/کلاه|شال/, "c-hat"], [/کفش|صندل/, "c-shoe"], [/ست/, "c-set"], [/پسر|تیشرت|بلوز/, "c-tshirt"]];
function catIcon(c) {
  if (c && CAT_ICONS.includes(c.icon)) return c.icon;
  if (c && c.emoji && EMOJI_MAP[c.emoji.trim()]) return EMOJI_MAP[c.emoji.trim()];
  const hit = NAME_MAP.find(([re]) => re.test((c && c.name) || ""));
  return hit ? hit[1] : "hanger";
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
    catIcon,
    srcset: require("../lib/images").srcset,
    thumb: require("../lib/images").thumb,
    json: (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e"),
  });
}

module.exports = { pageLocals, viewHelpers, CAT_ICONS };
