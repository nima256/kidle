// Product listing engine shared by /shop, /category/:slug and /search.
// All filter state lives in the URL query so results are shareable, crawlable and back-button safe.
const Product = require("../models/Product");
const Brand = require("../models/Brand");
const catalog = require("./catalog");
const { searchFilter } = require("../routes/api/search");
const { str, clampInt, toEnDigits, normalizeText } = require("./util");

const PAGE_SIZE = 24;

const SORTS = {
  newest: "جدیدترین",
  popular: "محبوب‌ترین",
  "price-asc": "ارزان‌ترین",
  "price-desc": "گران‌ترین",
  discount: "بیشترین تخفیف",
};

const arr = (v) => (Array.isArray(v) ? v : v ? String(v).split(",") : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 20);
const effPrice = (p) => (p.offerPrice && p.offerPrice < p.price ? p.offerPrice : p.price);
const discountOf = (p) => (p.offerPrice && p.offerPrice < p.price ? (p.price - p.offerPrice) / p.price : 0);
const normSize = (s) => normalizeText(s).toLowerCase();

function parseQuery(q) {
  return {
    q: str(q.q, 80),
    cats: arr(q.cat),
    sizes: arr(q.size),
    colors: arr(q.color),
    brands: arr(q.brand),
    min: q.min ? clampInt(q.min, 0, 1e10, null) : null,
    max: q.max ? clampInt(q.max, 0, 1e10, null) : null,
    inStock: q.stock === "1",
    onSale: q.sale === "1",
    sort: SORTS[q.sort] ? q.sort : "newest",
    page: clampInt(q.page, 1, 500, 1),
  };
}

/**
 * @param {object} opts { query, category }  category = fixed category doc (category pages)
 */
async function run({ query, category }) {
  const f = parseQuery(query);
  const tree = await catalog.loadTree();
  const base = { ...catalog.PUBLIC };

  if (category) base.category = { $in: await catalog.descendantIds(category._id) };
  if (f.q) Object.assign(base, searchFilter(f.q) || {});

  // Load the base set once (clothing catalogues are small) and compute facets from it,
  // so filter options always reflect what actually exists.
  const all = await Product.find(base)
    .select("name slug images price offerPrice countInStock sizes colors brand category isNewProduct isPopular isFeatured rating reviewsNum createdAt")
    .lean({ getters: false });

  // Category filter (shop/search only): matches a category or any of its descendants.
  let catIds = null;
  if (!category && f.cats.length) {
    const bySlug = new Map(tree.all.map((c) => [c.slug, c]));
    const ids = [];
    for (const slug of f.cats) {
      const c = bySlug.get(slug);
      if (c) ids.push(...(await catalog.descendantIds(c._id)));
    }
    catIds = new Set(ids.map(String));
  }

  const sizeSet = new Set(f.sizes.map(normSize));
  const colorSet = new Set(f.colors.map((c) => normalizeText(c)));
  const brandSet = new Set(f.brands);

  const matches = (p, skip) => {
    if (skip !== "cat" && catIds && !(p.category || []).some((id) => catIds.has(String(id)))) return false;
    if (skip !== "size" && sizeSet.size && !(p.sizes || []).some((s) => sizeSet.has(normSize(s.size)))) return false;
    if (skip !== "color" && colorSet.size && !(p.colors || []).some((c) => colorSet.has(normalizeText(c.name)))) return false;
    if (skip !== "brand" && brandSet.size && !brandSet.has(String(p.brand))) return false;
    const price = effPrice(p);
    if (skip !== "price") {
      if (f.min !== null && price < f.min) return false;
      if (f.max !== null && price > f.max) return false;
    }
    if (f.inStock && !(p.countInStock > 0)) return false;
    if (f.onSale && !discountOf(p)) return false;
    return true;
  };

  const results = all.filter((p) => matches(p));

  // Facets — each facet is computed with its own filter relaxed, so options don't vanish.
  const facet = (skip, pick) => {
    const counts = new Map();
    for (const p of all) if (matches(p, skip)) for (const v of pick(p)) counts.set(v.key, { ...v, count: (counts.get(v.key)?.count || 0) + 1 });
    return [...counts.values()];
  };
  const sizes = facet("size", (p) => [...new Map((p.sizes || []).filter((s) => s.size).map((s) => [normSize(s.size), { key: normSize(s.size), value: s.size.trim() }])).values()]);
  sizes.sort((a, b) => {
    const na = parseFloat(toEnDigits(a.value)), nb = parseFloat(toEnDigits(b.value));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.value.localeCompare(b.value, "fa");
  });
  const colors = facet("color", (p) => [...new Map((p.colors || []).filter((c) => c.name).map((c) => [normalizeText(c.name), { key: normalizeText(c.name), value: c.name.trim(), hex: c.rgb }])).values()]).sort((a, b) => b.count - a.count);
  const brandCounts = facet("brand", (p) => (p.brand ? [{ key: String(p.brand), value: String(p.brand) }] : []));
  const brandDocs = brandCounts.length ? await Brand.find({ _id: { $in: brandCounts.map((b) => b.key) } }).select("name").lean() : [];
  const brands = brandCounts
    .map((b) => ({ ...b, name: brandDocs.find((d) => String(d._id) === b.key)?.name }))
    .filter((b) => b.name)
    .sort((a, b) => b.count - a.count);

  let categories = [];
  if (!category) {
    // Roll counts up to root categories for a compact list.
    categories = tree.roots
      .map((r) => {
        const ids = new Set();
        const walk = (n) => { ids.add(String(n._id)); n.children.forEach(walk); };
        walk(r);
        const count = all.filter((p) => matches(p, "cat") && (p.category || []).some((id) => ids.has(String(id)))).length;
        return { slug: r.slug, name: r.name, count };
      })
      .filter((c) => c.count > 0 || f.cats.includes(c.slug));
  }

  const prices = all.map(effPrice).filter((n) => n > 0);
  const priceRange = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };

  const sorters = {
    newest: (a, b) => b.createdAt - a.createdAt,
    popular: (a, b) => (b.isPopular - a.isPopular) || (b.rating * b.reviewsNum - a.rating * a.reviewsNum) || (b.createdAt - a.createdAt),
    "price-asc": (a, b) => effPrice(a) - effPrice(b),
    "price-desc": (a, b) => effPrice(b) - effPrice(a),
    discount: (a, b) => discountOf(b) - discountOf(a),
  };
  // In-stock items first, then the chosen order.
  results.sort((a, b) => ((b.countInStock > 0) - (a.countInStock > 0)) || sorters[f.sort](a, b));

  const total = results.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const products = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const active = [];
  const brandName = (id) => brands.find((b) => b.key === id)?.name || "برند";
  f.cats.forEach((v) => active.push({ key: "cat", value: v, label: tree.all.find((c) => c.slug === v)?.name || v }));
  f.sizes.forEach((v) => active.push({ key: "size", value: v, label: `سایز ${v}` }));
  f.colors.forEach((v) => active.push({ key: "color", value: v, label: v }));
  f.brands.forEach((v) => active.push({ key: "brand", value: v, label: brandName(v) }));
  if (f.min !== null || f.max !== null) active.push({ key: "price", value: "", label: "محدوده قیمت" });
  if (f.inStock) active.push({ key: "stock", value: "1", label: "فقط موجود" });
  if (f.onSale) active.push({ key: "sale", value: "1", label: "تخفیف‌دار" });

  return {
    filters: f,
    products,
    total,
    page,
    pages,
    facets: { sizes, colors, brands, categories, priceRange },
    active,
    sorts: SORTS,
    pageSize: PAGE_SIZE,
  };
}

// Builds a URL for the same listing with some params changed (used by templates).
function urlWith(basePath, currentQuery, changes) {
  const params = new URLSearchParams();
  const merged = { ...currentQuery, ...changes };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "" || (k === "page" && String(v) === "1")) continue;
    if (Array.isArray(v)) v.forEach((x) => x !== "" && params.append(k, x));
    else params.append(k, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

module.exports = { run, urlWith, SORTS, PAGE_SIZE };
