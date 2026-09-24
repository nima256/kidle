// Category tree + product query helpers shared by storefront pages.
const Category = require("../models/Category");
const Product = require("../models/Product");

let cache = null;
let cacheAt = 0;
const TTL = 60_000;

async function loadTree() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const all = await Category.find({ categoryType: "product", isActive: true })
    .sort({ name: 1 })
    .lean({ virtuals: false });
  const byId = new Map(all.map((c) => [String(c._id), { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const pid = c.parentId ? String(c.parentId) : null;
    if (pid && byId.has(pid)) byId.get(pid).children.push(c);
    else if (!pid) roots.push(c);
  }
  cache = { roots, byId, all };
  cacheAt = Date.now();
  return cache;
}

function invalidate() {
  cache = null;
}

// The category and all of its active descendants.
async function descendantIds(categoryId) {
  const { byId } = await loadTree();
  const out = [];
  const walk = (id) => {
    const node = byId.get(String(id));
    if (!node) return;
    out.push(node._id);
    node.children.forEach((ch) => walk(ch._id));
  };
  walk(categoryId);
  return out;
}

async function breadcrumbFor(category) {
  const { byId } = await loadTree();
  const trail = [];
  let node = byId.get(String(category._id));
  let guard = 0;
  while (node && guard++ < 10) {
    trail.unshift({ name: node.name, slug: node.slug });
    node = node.parentId ? byId.get(String(node.parentId)) : null;
  }
  return trail;
}

// Public product visibility rule used everywhere on the storefront.
const PUBLIC = { isPublished: true };

async function countsByRoot() {
  const { roots } = await loadTree();
  return Promise.all(
    roots.map(async (r) => {
      const ids = await descendantIds(r._id);
      const productCount = await Product.countDocuments({ ...PUBLIC, category: { $in: ids } });
      return { ...r, productCount };
    })
  );
}

module.exports = { loadTree, invalidate, descendantIds, breadcrumbFor, countsByRoot, PUBLIC };
