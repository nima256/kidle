const express = require("express");
const router = express.Router();
const Product = require("../../models/Product");
const catalog = require("../../lib/catalog");
const { asyncHandler, str, normalizeText, fuzzyRegexSource } = require("../../lib/util");

// Builds a Mongo filter where every word must match name / english name / tags / category.
function searchFilter(q) {
  const words = normalizeText(q).split(" ").filter((w) => w.length > 0).slice(0, 6);
  if (!words.length) return null;
  return {
    $and: words.map((w) => {
      const re = new RegExp(fuzzyRegexSource(w), "i");
      return { $or: [{ name: re }, { englishName: re }, { tags: re }, { catName: re }, { lilDescription: re }] };
    }),
  };
}

router.get(
  "/suggest",
  asyncHandler(async (req, res) => {
    const q = str(req.query.q, 60);
    if (normalizeText(q).length < 2) return res.json({ success: true, products: [], categories: [] });
    const filter = searchFilter(q);
    const re = new RegExp(fuzzyRegexSource(q), "i");
    const [products, tree] = await Promise.all([
      Product.find({ ...catalog.PUBLIC, ...filter })
        .select("name slug images price offerPrice countInStock")
        .sort({ countInStock: -1, createdAt: -1 })
        .limit(6)
        .lean({ getters: false }),
      catalog.loadTree(),
    ]);
    const categories = tree.all.filter((c) => re.test(normalizeText(c.name))).slice(0, 4).map((c) => ({ name: c.name, slug: c.slug }));
    res.set("Cache-Control", "private, max-age=30");
    res.json({
      success: true,
      products: products.map((p) => ({
        name: p.name,
        url: `/productDetails/${p.slug}`,
        image: p.images?.[0]?.url || "",
        price: p.offerPrice && p.offerPrice < p.price ? p.offerPrice : p.price,
        inStock: p.countInStock > 0,
      })),
      categories,
    });
  })
);

module.exports = router;
module.exports.searchFilter = searchFilter;
