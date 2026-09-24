// Categories and brands.
const express = require("express");
const router = express.Router();
const Category = require("../../models/Category");
const Brand = require("../../models/Brand");
const Product = require("../../models/Product");
const Weblog = require("../../models/Weblog");
const catalog = require("../../lib/catalog");
const audit = require("../../lib/audit");
const { requirePermission } = require("../../middlewares/adminAuth");
const { asyncHandler, str, isObjectId, HttpError } = require("../../lib/util");

router.get(
  "/categories",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const type = req.query.type === "weblog" ? "weblog" : "product";
    const cats = await Category.find({ categoryType: type }).sort({ name: 1 }).lean();
    const counts = await Promise.all(
      cats.map((c) => (type === "product" ? Product.countDocuments({ category: c._id }) : Weblog.countDocuments({ categories: c._id })))
    );
    cats.forEach((c, i) => (c.count = counts[i]));
    const byParent = {};
    cats.forEach((c) => (byParent[c.parentId ? String(c.parentId) : "root"] ||= []).push(c));
    const ordered = [];
    const walk = (pid, depth) => (byParent[pid] || []).forEach((c) => { ordered.push({ ...c, depth }); walk(String(c._id), depth + 1); });
    walk("root", 0);
    // Orphans (parent deleted) at the end so they stay editable.
    cats.filter((c) => !ordered.some((o) => String(o._id) === String(c._id))).forEach((c) => ordered.push({ ...c, depth: 0 }));
    res.render("admin/categories", { title: "دسته‌بندی‌ها", cats: ordered, type });
  })
);

function categoryPayload(body) {
  const errors = {};
  const name = str(body.name, 50);
  if (name.length < 2) errors.name = "نام حداقل ۲ حرف است";
  const color = /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#ffffff";
  const image = str(body.image, 300);
  if (image && !/^(\/uploads\/|https:\/\/)/.test(image)) errors.image = "آدرس تصویر نامعتبر است";
  if (Object.keys(errors).length) throw new HttpError(422, "لطفاً فرم را بررسی کنید", { errors });
  return {
    name,
    categoryType: body.categoryType === "weblog" ? "weblog" : "product",
    parentId: isObjectId(body.parentId) ? body.parentId : null,
    description: str(body.description, 3000),
    metaDescription: str(body.metaDescription, 160),
    icon: require("../../middlewares/locals").CAT_ICONS.includes(body.icon) ? body.icon : "",
    emoji: undefined,
    color,
    images: image ? [image] : [],
    isActive: body.isActive !== false,
  };
}

router.post(
  "/api/categories",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const c = await Category.create(categoryPayload(req.body));
    catalog.invalidate();
    audit.log(req, "create_category", "category", c);
    res.status(201).json({ success: true, message: "دسته‌بندی ساخته شد" });
  })
);

router.put(
  "/api/categories/:id",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const c = isObjectId(req.params.id) && (await Category.findById(req.params.id));
    if (!c) throw new HttpError(404, "دسته‌بندی پیدا نشد");
    const data = categoryPayload(req.body);
    if (data.parentId && String(data.parentId) === String(c._id)) throw new HttpError(422, "دسته‌بندی نمی‌تواند والد خودش باشد");
    // Prevent cycles: the new parent must not be a descendant.
    if (data.parentId) {
      let p = await Category.findById(data.parentId).select("parentId").lean();
      for (let i = 0; p && i < 20; i++) {
        if (String(p._id) === String(c._id)) throw new HttpError(422, "این انتخاب حلقه ایجاد می‌کند");
        p = p.parentId ? await Category.findById(p.parentId).select("parentId").lean() : null;
      }
    }
    Object.assign(c, data);
    await c.save();
    catalog.invalidate();
    audit.log(req, "update_category", "category", c);
    res.json({ success: true, message: "ذخیره شد" });
  })
);

router.delete(
  "/api/categories/:id",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const c = isObjectId(req.params.id) && (await Category.findById(req.params.id));
    if (!c) throw new HttpError(404, "دسته‌بندی پیدا نشد");
    const [children, used] = await Promise.all([Category.countDocuments({ parentId: c._id }), Product.countDocuments({ category: c._id })]);
    if (children) throw new HttpError(409, "ابتدا زیردسته‌های این دسته را حذف یا جابه‌جا کنید");
    if (used) throw new HttpError(409, `${used} محصول در این دسته است. ابتدا آن‌ها را به دسته دیگری منتقل کنید`);
    await c.deleteOne();
    catalog.invalidate();
    audit.log(req, "delete_category", "category", c);
    res.json({ success: true, message: "حذف شد" });
  })
);

// ───────────── Brands ─────────────
router.get(
  "/brands",
  requirePermission("manage_brands"),
  asyncHandler(async (req, res) => {
    const brands = await Brand.find({}).sort({ name: 1 }).lean();
    const counts = await Promise.all(brands.map((b) => Product.countDocuments({ brand: b._id })));
    brands.forEach((b, i) => (b.count = counts[i]));
    res.render("admin/brands", { title: "برندها", brands });
  })
);

router.post(
  "/api/brands",
  requirePermission("manage_brands"),
  asyncHandler(async (req, res) => {
    const name = str(req.body.name, 50);
    if (name.length < 2) throw new HttpError(422, "نام برند حداقل ۲ حرف است", { errors: { name: "حداقل ۲ حرف" } });
    const b = await Brand.create({ name, description: str(req.body.description, 500) });
    audit.log(req, "create_brand", "brand", b);
    res.status(201).json({ success: true, message: "برند ساخته شد" });
  })
);

router.put(
  "/api/brands/:id",
  requirePermission("manage_brands"),
  asyncHandler(async (req, res) => {
    const b = isObjectId(req.params.id) && (await Brand.findById(req.params.id));
    if (!b) throw new HttpError(404, "برند پیدا نشد");
    const name = str(req.body.name, 50);
    if (name.length < 2) throw new HttpError(422, "نام برند حداقل ۲ حرف است", { errors: { name: "حداقل ۲ حرف" } });
    b.name = name;
    b.description = str(req.body.description, 500);
    await b.save();
    audit.log(req, "update_brand", "brand", b);
    res.json({ success: true, message: "ذخیره شد" });
  })
);

router.delete(
  "/api/brands/:id",
  requirePermission("manage_brands"),
  asyncHandler(async (req, res) => {
    const b = isObjectId(req.params.id) && (await Brand.findById(req.params.id));
    if (!b) throw new HttpError(404, "برند پیدا نشد");
    const used = await Product.countDocuments({ brand: b._id });
    if (used) throw new HttpError(409, `${used} محصول این برند را دارند. ابتدا برند آن‌ها را تغییر دهید`);
    await b.deleteOne();
    audit.log(req, "delete_brand", "brand", b);
    res.json({ success: true, message: "حذف شد" });
  })
);

module.exports = router;
