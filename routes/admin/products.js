const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");

const Product = require("../../models/Product");
const Category = require("../../models/Category");
const Brand = require("../../models/Brand");
const Weblog = require("../../models/Weblog");
const Setting = require("../../models/Setting");
const catalog = require("../../lib/catalog");
const audit = require("../../lib/audit");
const sanitize = require("../../lib/sanitize");
const { requirePermission } = require("../../middlewares/adminAuth");
const { asyncHandler, str, isObjectId, escapeRegex, clampInt, HttpError, toEnDigits } = require("../../lib/util");

const PAGE = 30;
const UPLOAD_ROOT = path.join(__dirname, "../../public/uploads");

// ───────────── Image uploads ─────────────
// Files are held in memory, decoded by sharp (which rejects anything that isn't a real image),
// resized and re-encoded to WebP. The original bytes/extension are never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

router.post(
  "/api/uploads",
  requirePermission("manage_products", "manage_weblogs", "manage_categories"),
  upload.array("images", 12),
  asyncHandler(async (req, res) => {
    if (!req.files || !req.files.length) throw new HttpError(400, "فقط فایل تصویری (JPG، PNG، WebP) تا ۸ مگابایت مجاز است");
    const folder = str(req.query.folder, 20) === "weblog" ? "weblogs" : str(req.query.folder, 20) === "category" ? "categories" : "products";
    const d = new Date();
    const rel = path.join(folder, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"));
    fs.mkdirSync(path.join(UPLOAD_ROOT, rel), { recursive: true });
    const images = [];
    for (const f of req.files) {
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}.webp`;
      try {
        await sharp(f.buffer, { failOn: "error" })
          .rotate()
          .resize(1400, 1750, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(path.join(UPLOAD_ROOT, rel, name));
      } catch {
        throw new HttpError(400, `فایل «${f.originalname}» تصویر معتبری نیست`);
      }
      images.push({ url: `/uploads/${rel.split(path.sep).join("/")}/${name}`, filename: name });
    }
    res.json({ success: true, images });
  })
);

// Deletes image files that no product/post references anymore.
async function removeOrphanImages(urls) {
  for (const url of urls) {
    if (!/^\/uploads\/[\w\-/.؀-ۿ]+$/.test(url) || url.includes("..")) continue;
    const used = (await Product.exists({ "images.url": url })) || (await Weblog.exists({ "images.url": url }));
    if (used) continue;
    const file = path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ""));
    if (file.startsWith(UPLOAD_ROOT)) fs.promises.unlink(file).catch(() => {});
  }
}

// ───────────── Products ─────────────
router.get(
  "/products",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    const q = str(req.query.q, 80);
    const status = str(req.query.status, 20);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const filter = {};
    if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), "i") }, { englishName: new RegExp(escapeRegex(q), "i") }];
    if (status === "published") filter.isPublished = true;
    if (status === "draft") filter.isPublished = false;
    if (status === "out") filter.countInStock = { $lte: 0 };
    if (status === "sale") filter.offerPrice = { $gt: 0 };
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).populate("category", "name").lean({ getters: false }),
      Product.countDocuments(filter),
    ]);
    res.render("admin/products", { title: "محصولات", items, total, page, pages: Math.ceil(total / PAGE) || 1, q, status });
  })
);

async function formData() {
  const [categories, brands] = await Promise.all([
    Category.find({ categoryType: "product" }).sort({ name: 1 }).lean(),
    Brand.find({}).sort({ name: 1 }).lean(),
  ]);
  const byParent = {};
  categories.forEach((c) => (byParent[c.parentId ? String(c.parentId) : "root"] ||= []).push(c));
  const ordered = [];
  const walk = (pid, depth) => (byParent[pid] || []).forEach((c) => { ordered.push({ ...c, depth }); walk(String(c._id), depth + 1); });
  walk("root", 0);
  return { categories: ordered, brands };
}

router.get(
  "/products/new",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    res.render("admin/product-form", { title: "محصول جدید", product: { isPublished: true, sizes: [], colors: [], specifications: [], images: [], category: [], tags: [] }, ...(await formData()) });
  })
);

router.get(
  "/products/:id/edit",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new HttpError(404, "محصول پیدا نشد");
    const product = await Product.findById(req.params.id).lean({ getters: false });
    if (!product) throw new HttpError(404, "محصول پیدا نشد");
    res.render("admin/product-form", { title: `ویرایش ${product.name}`, product, ...(await formData()) });
  })
);

const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(toEnDigits(String(v)).replace(/[,٬\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Whitelisted, validated product payload (no mass assignment).
async function productPayload(body) {
  const errors = {};
  const name = str(body.name, 100);
  if (name.length < 3) errors.name = "نام محصول حداقل ۳ حرف است";
  const price = num(body.price);
  if (!(price > 0)) errors.price = "قیمت را درست وارد کنید";
  let offerPrice = num(body.offerPrice);
  if (Number.isNaN(offerPrice)) errors.offerPrice = "قیمت ویژه نامعتبر است";
  if (offerPrice !== null && offerPrice >= price) errors.offerPrice = "قیمت ویژه باید کمتر از قیمت اصلی باشد";
  if (offerPrice !== null && offerPrice <= 0) offerPrice = null;
  const countInStock = num(body.countInStock);
  if (!Number.isInteger(countInStock) || countInStock < 0) errors.countInStock = "موجودی باید عدد صحیح ۰ یا بیشتر باشد";

  const category = (Array.isArray(body.category) ? body.category : [body.category]).filter(isObjectId);
  if (!category.length) errors.category = "حداقل یک دسته‌بندی انتخاب کنید";
  else if ((await Category.countDocuments({ _id: { $in: category } })) !== category.length) errors.category = "دسته‌بندی نامعتبر است";
  const brand = isObjectId(body.brand) ? body.brand : null;
  if (!brand || !(await Brand.exists({ _id: brand }))) errors.brand = "برند را انتخاب کنید";

  const list = (v) => (Array.isArray(v) ? v : []);
  const sizes = list(body.sizes).map((s) => ({ size: str(s?.size, 40), usage: str(s?.usage, 60) })).filter((s) => s.size);
  const colors = list(body.colors).map((c) => ({ name: str(c?.name, 40), rgb: /^#[0-9a-f]{6}$/i.test(c?.rgb) ? c.rgb : "#cccccc" })).filter((c) => c.name);
  const specifications = list(body.specifications).map((s) => ({ key: str(s?.key, 60), value: str(s?.value, 200) })).filter((s) => s.key && s.value);
  const images = list(body.images)
    .map((i) => ({ url: str(i?.url, 300), filename: str(i?.filename, 120) || str(i?.url, 300).split("/").pop(), alt: str(i?.alt, 150), caption: str(i?.alt, 150) }))
    .filter((i) => /^\/uploads\//.test(i.url) && !i.url.includes(".."))
    .slice(0, 12);
  const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || "").split(/[,،]/)).map((t) => str(t, 40)).filter(Boolean).slice(0, 20);
  const weight = num(body.weight);

  if (Object.keys(errors).length) throw new HttpError(422, "لطفاً خطاهای فرم را برطرف کنید", { errors });
  const catDocs = await Category.find({ _id: { $in: category } }).select("name").lean();
  return {
    name,
    englishName: str(body.englishName, 100) || undefined,
    lilDescription: str(body.lilDescription, 400),
    description: sanitize.rich(typeof body.description === "string" ? body.description.slice(0, 200000) : ""),
    price,
    offerPrice: offerPrice || null,
    discount: offerPrice ? Math.round(((price - offerPrice) / price) * 100) : 0,
    countInStock,
    isOutOfStock: countInStock <= 0,
    category,
    catName: catDocs[0]?.name || "",
    brand,
    sizes,
    colors,
    specifications,
    images,
    tags,
    weight: weight > 0 ? weight : undefined,
    guarantee: str(body.guarantee, 100),
    product_group_id: str(body.product_group_id, 60) || null,
    isPublished: !!body.isPublished,
    isFeatured: !!body.isFeatured,
    isNewProduct: !!body.isNewProduct,
    isPopular: !!body.isPopular,
  };
}

router.post(
  "/api/products",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    const data = await productPayload(req.body);
    const product = new Product(data);
    await product.save();
    audit.log(req, "create_product", "product", product);
    catalog.invalidate();
    res.status(201).json({ success: true, message: "محصول ایجاد شد", id: product._id, redirect: `/admin/products/${product._id}/edit` });
  })
);

router.put(
  "/api/products/:id",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new HttpError(404, "محصول پیدا نشد");
    const product = await Product.findById(req.params.id);
    if (!product) throw new HttpError(404, "محصول پیدا نشد");
    const data = await productPayload(req.body);
    const removed = product.images.map((i) => i.url).filter((u) => !data.images.some((i) => i.url === u));
    // Stock edits here are absolute; use a conditional update so an order placed meanwhile isn't lost.
    const expectedStock = num(req.body.expectedStock);
    if (Number.isInteger(expectedStock) && expectedStock !== product.countInStock && data.countInStock !== product.countInStock) {
      throw new HttpError(409, `موجودی این محصول در همین فاصله تغییر کرده است (موجودی فعلی: ${product.countInStock}). صفحه را تازه کنید.`);
    }
    Object.assign(product, data);
    await product.save();
    await removeOrphanImages(removed);
    audit.log(req, "update_product", "product", product);
    res.json({ success: true, message: "تغییرات ذخیره شد", stock: product.countInStock });
  })
);

router.post(
  "/api/products/:id/duplicate",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    const src = isObjectId(req.params.id) && (await Product.findById(req.params.id).lean({ getters: false }));
    if (!src) throw new HttpError(404, "محصول پیدا نشد");
    const copy = { ...src };
    ["_id", "id", "__v", "slug", "createdAt", "updatedAt", "publishedAt", "discountPrice"].forEach((k) => delete copy[k]);
    Object.assign(copy, { name: `${src.name} (کپی)`.slice(0, 100), isPublished: false, rating: 0, reviewsNum: 0, isFeatured: false, isPopular: false });
    const p = await Product.create(copy);
    audit.log(req, "create_product", "product", p, "کپی از محصول دیگر");
    res.status(201).json({ success: true, message: "کپی به‌صورت پیش‌نویس ساخته شد", redirect: `/admin/products/${p._id}/edit` });
  })
);

router.delete(
  "/api/products/:id",
  requirePermission("manage_products"),
  asyncHandler(async (req, res) => {
    const p = isObjectId(req.params.id) && (await Product.findById(req.params.id));
    if (!p) throw new HttpError(404, "محصول پیدا نشد");
    const urls = p.images.map((i) => i.url);
    await p.deleteOne();
    await removeOrphanImages(urls);
    audit.log(req, "delete_product", "product", p);
    res.json({ success: true, message: "محصول حذف شد" });
  })
);

// ───────────── Inventory ─────────────
router.get(
  "/inventory",
  requirePermission("manage_inventory"),
  asyncHandler(async (req, res) => {
    const settings = await Setting.get();
    const f = str(req.query.f, 10);
    const q = str(req.query.q, 80);
    const filter = {};
    if (f === "low") filter.countInStock = { $gt: 0, $lte: settings.lowStockThreshold };
    if (f === "out") filter.countInStock = { $lte: 0 };
    if (q) filter.name = new RegExp(escapeRegex(q), "i");
    const items = await Product.find(filter).select("name slug countInStock isPublished images sizes").sort({ countInStock: 1, name: 1 }).limit(300).lean({ getters: false });
    res.render("admin/inventory", { title: "موجودی انبار", items, f, q, threshold: settings.lowStockThreshold });
  })
);

// Adjusts stock by a delta (+ received / − damaged), atomically.
router.patch(
  "/api/inventory/:id",
  requirePermission("manage_inventory"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new HttpError(404, "محصول پیدا نشد");
    const delta = parseInt(toEnDigits(String(req.body.delta ?? "")).replace(/[^\d+-]/g, ""), 10);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) throw new HttpError(422, "مقدار تغییر نامعتبر است");
    const filter = { _id: req.params.id };
    if (delta < 0) filter.countInStock = { $gte: -delta };
    const p = await Product.findOneAndUpdate(filter, { $inc: { countInStock: delta } }, { new: true });
    if (!p) throw new HttpError(409, "موجودی برای کم کردن این مقدار کافی نیست");
    await Product.updateOne({ _id: p._id }, { $set: { isOutOfStock: p.countInStock <= 0 } });
    audit.log(req, "update_stock", "product", p, `${delta > 0 ? "+" : ""}${delta} → ${p.countInStock}`);
    res.json({ success: true, message: `موجودی به ${p.countInStock} رسید`, stock: p.countInStock });
  })
);

module.exports = router;
module.exports.removeOrphanImages = removeOrphanImages;
