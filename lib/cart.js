// Cart service: works for guests (session) and signed-in customers (User.cart).
const User = require("../models/User");
const Product = require("../models/Product");
const discountService = require("./discount");
const { HttpError, isObjectId, str, toEnDigits } = require("./util");

const MAX_QTY_PER_LINE = 20;
const MAX_LINES = 50;

const norm = (s) => toEnDigits(s).trim().toLowerCase();
const lineKey = (l) => `${l.productId}~${l.selectedColor || ""}~${l.selectedSize || ""}`;

async function loadLines(req) {
  if (req.session.userId) {
    const user = await User.findById(req.session.userId).select("cart");
    if (!user) return { user: null, lines: req.session.cart || [] };
    return {
      user,
      lines: user.cart.map((i) => ({
        productId: String(i.productId),
        quantity: i.quantity,
        selectedColor: i.selectedColor || "",
        selectedSize: i.selectedSize || "",
      })),
    };
  }
  return { user: null, lines: Array.isArray(req.session.cart) ? req.session.cart : [] };
}

async function saveLines(req, user, lines) {
  if (user) {
    user.cart = lines.map((l) => ({ ...l, addedAt: new Date() }));
    await user.save();
  } else {
    req.session.cart = lines;
  }
}

// Returns the exact option as stored on the product, or throws if the option is required/invalid.
function resolveOption(list, value, field, label) {
  const options = (list || []).map((o) => o[field]).filter(Boolean);
  if (!options.length) return "";
  const v = str(value, 60);
  if (!v) throw new HttpError(400, `لطفاً ${label} را انتخاب کنید`, { field: label });
  const match = options.find((o) => norm(o) === norm(v));
  if (!match) throw new HttpError(400, `${label} انتخاب‌شده معتبر نیست`);
  return match;
}

function publicProductOrThrow(product) {
  if (!product || !product.isPublished) throw new HttpError(404, "این محصول در دسترس نیست");
}

function qtyForProduct(lines, productId, exceptKey) {
  return lines
    .filter((l) => l.productId === String(productId) && lineKey(l) !== exceptKey)
    .reduce((s, l) => s + l.quantity, 0);
}

async function addItem(req, { productId, quantity, color, size }) {
  if (!isObjectId(productId)) throw new HttpError(400, "محصول نامعتبر است");
  const qty = Math.max(1, Math.min(MAX_QTY_PER_LINE, parseInt(quantity, 10) || 1));
  const product = await Product.findById(productId);
  publicProductOrThrow(product);

  const selectedColor = resolveOption(product.colors, color, "name", "رنگ");
  const selectedSize = resolveOption(product.sizes, size, "size", "سایز");

  const { user, lines } = await loadLines(req);
  const candidate = { productId: String(product._id), quantity: qty, selectedColor, selectedSize };
  const key = lineKey(candidate);
  const existing = lines.find((l) => lineKey(l) === key);
  const newLineQty = (existing ? existing.quantity : 0) + qty;
  const totalForProduct = qtyForProduct(lines, product._id, key) + newLineQty;

  if (product.countInStock <= 0) throw new HttpError(409, "این محصول ناموجود است");
  if (totalForProduct > product.countInStock) {
    throw new HttpError(409, `فقط ${product.countInStock} عدد از این محصول موجود است`, {
      available: product.countInStock,
    });
  }
  if (newLineQty > MAX_QTY_PER_LINE) throw new HttpError(400, `حداکثر ${MAX_QTY_PER_LINE} عدد در هر سفارش`);

  if (existing) existing.quantity = newLineQty;
  else {
    if (lines.length >= MAX_LINES) throw new HttpError(400, "سبد خرید پر است");
    lines.push(candidate);
  }
  await saveLines(req, user, lines);
  return { count: countOf(lines), key };
}

async function updateItem(req, key, quantity) {
  const { user, lines } = await loadLines(req);
  const line = lines.find((l) => lineKey(l) === key);
  if (!line) throw new HttpError(404, "این کالا در سبد خرید نیست");
  const qty = parseInt(quantity, 10);
  if (!qty || qty < 1) throw new HttpError(400, "تعداد نامعتبر است");
  if (qty > MAX_QTY_PER_LINE) throw new HttpError(400, `حداکثر ${MAX_QTY_PER_LINE} عدد در هر سفارش`);

  const product = await Product.findById(line.productId).select("countInStock isPublished");
  publicProductOrThrow(product);
  const total = qtyForProduct(lines, line.productId, key) + qty;
  if (total > product.countInStock) {
    throw new HttpError(409, `فقط ${product.countInStock} عدد از این محصول موجود است`, {
      available: product.countInStock,
    });
  }
  line.quantity = qty;
  await saveLines(req, user, lines);
  return { count: countOf(lines) };
}

async function removeItem(req, key) {
  const { user, lines } = await loadLines(req);
  const next = lines.filter((l) => lineKey(l) !== key);
  if (next.length === lines.length) throw new HttpError(404, "این کالا در سبد خرید نیست");
  await saveLines(req, user, next);
  return { count: countOf(next) };
}

async function clear(req) {
  const { user } = await loadLines(req);
  await saveLines(req, user, []);
}

const countOf = (lines) => lines.reduce((s, l) => s + l.quantity, 0);

async function count(req) {
  const { lines } = await loadLines(req);
  return countOf(lines);
}

/**
 * Full priced cart, computed on the server from current product data.
 * Drops lines whose product was deleted/unpublished and reports stock problems.
 */
async function build(req) {
  const { user, lines } = await loadLines(req);
  const ids = [...new Set(lines.map((l) => l.productId))].filter(isObjectId);
  const products = await Product.find({ _id: { $in: ids } })
    .select("name slug images price offerPrice countInStock isPublished colors sizes catName")
    .lean({ getters: false });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  const kept = [];
  const perProduct = {};
  for (const l of lines) {
    const p = byId.get(l.productId);
    if (!p || !p.isPublished) continue;
    kept.push(l);
    perProduct[l.productId] = (perProduct[l.productId] || 0) + l.quantity;
  }
  if (kept.length !== lines.length) await saveLines(req, user, kept);

  let subtotal = 0;
  let listTotal = 0;
  const issues = [];
  for (const l of kept) {
    const p = byId.get(l.productId);
    const unit = p.offerPrice && p.offerPrice < p.price ? p.offerPrice : p.price;
    const stockProblem = perProduct[l.productId] > p.countInStock;
    if (stockProblem) {
      issues.push(
        p.countInStock <= 0
          ? `«${p.name}» ناموجود شده است`
          : `از «${p.name}» فقط ${p.countInStock} عدد موجود است`
      );
    }
    subtotal += unit * l.quantity;
    listTotal += p.price * l.quantity;
    items.push({
      key: lineKey(l),
      productId: l.productId,
      name: p.name,
      slug: p.slug,
      image: p.images?.[0]?.url || "",
      price: p.price,
      unitPrice: unit,
      quantity: l.quantity,
      lineTotal: unit * l.quantity,
      selectedColor: l.selectedColor,
      selectedSize: l.selectedSize,
      colorHex: (p.colors || []).find((c) => c.name === l.selectedColor)?.rgb || "",
      available: p.countInStock,
      outOfStock: p.countInStock <= 0,
      stockProblem,
    });
  }

  let discount = null;
  let discountAmount = 0;
  let discountError = "";
  if (req.session.discountCode && items.length) {
    const r = await discountService.evaluate(req.session.discountCode, subtotal);
    if (r.ok) {
      discount = r.summary;
      discountAmount = r.amount;
    } else {
      discountError = r.message;
      delete req.session.discountCode;
    }
  }

  return {
    items,
    count: countOf(kept),
    subtotal,
    productSavings: Math.max(0, listTotal - subtotal),
    discount,
    discountAmount,
    discountError,
    shippingCost: 0, // پس‌کرایه — paid to the courier on delivery
    payable: Math.max(0, subtotal - discountAmount),
    issues,
    canCheckout: items.length > 0 && issues.length === 0,
  };
}

// Moves a guest cart into the customer's account after login (quantities capped to stock).
async function mergeGuestCart(req, user) {
  const guest = Array.isArray(req.session.cart) ? req.session.cart : [];
  if (!guest.length) return;
  const lines = user.cart.map((i) => ({
    productId: String(i.productId),
    quantity: i.quantity,
    selectedColor: i.selectedColor || "",
    selectedSize: i.selectedSize || "",
  }));
  for (const g of guest) {
    const existing = lines.find((l) => lineKey(l) === lineKey(g));
    if (existing) existing.quantity = Math.min(MAX_QTY_PER_LINE, Math.max(existing.quantity, g.quantity));
    else if (lines.length < MAX_LINES) lines.push(g);
  }
  user.cart = lines;
  await user.save();
  delete req.session.cart;
}

module.exports = { addItem, updateItem, removeItem, clear, count, build, mergeGuestCart, lineKey };
