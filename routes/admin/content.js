// Reviews, discount codes, blog and store settings.
const express = require("express");
const router = express.Router();
const Review = require("../../models/Review");
const DiscountCode = require("../../models/DiscountCode");
const Weblog = require("../../models/Weblog");
const Category = require("../../models/Category");
const Setting = require("../../models/Setting");
const reviews = require("../../lib/reviews");
const audit = require("../../lib/audit");
const sanitize = require("../../lib/sanitize");
const { removeOrphanImages } = require("./products");
const { requirePermission } = require("../../middlewares/adminAuth");
const { asyncHandler, str, isObjectId, clampInt, HttpError, toEnDigits } = require("../../lib/util");

// ───────────── Reviews ─────────────
router.get(
  "/reviews",
  requirePermission("manage_reviews"),
  asyncHandler(async (req, res) => {
    const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
    const items = await Review.find({ status }).sort({ createdAt: -1 }).limit(100).populate("product", "name slug").populate("user", "mobile").lean();
    res.render("admin/reviews", { title: "نظرات", items, status });
  })
);

router.patch(
  "/api/reviews/:id",
  requirePermission("manage_reviews"),
  asyncHandler(async (req, res) => {
    const status = ["approved", "rejected", "pending"].includes(req.body.status) ? req.body.status : null;
    const r = isObjectId(req.params.id) && (await Review.findById(req.params.id));
    if (!r || !status) throw new HttpError(404, "نظر پیدا نشد");
    r.status = status;
    await r.save();
    await reviews.recompute(r.product);
    audit.log(req, "moderate_review", "review", { _id: r._id, name: r.text.slice(0, 40) }, status);
    res.json({ success: true, message: status === "approved" ? "نظر منتشر شد" : "نظر رد شد" });
  })
);

router.delete(
  "/api/reviews/:id",
  requirePermission("manage_reviews"),
  asyncHandler(async (req, res) => {
    const r = isObjectId(req.params.id) && (await Review.findById(req.params.id));
    if (!r) throw new HttpError(404, "نظر پیدا نشد");
    await r.deleteOne();
    await reviews.recompute(r.product);
    audit.log(req, "delete_review", "review", { _id: r._id, name: r.text.slice(0, 40) });
    res.json({ success: true, message: "نظر حذف شد" });
  })
);

// ───────────── Discount codes ─────────────
router.get(
  "/discounts",
  requirePermission("manage_discounts"),
  asyncHandler(async (req, res) => {
    const items = await DiscountCode.find({}).sort({ createdAt: -1 }).lean({ virtuals: true });
    items.forEach((d) => (d.id = String(d._id)));
    res.render("admin/discounts", { title: "کدهای تخفیف", items });
  })
);

function discountPayload(b) {
  const n = (v) => (v === "" || v === null || v === undefined ? null : Number(toEnDigits(String(v)).replace(/[,٬]/g, "")));
  const errors = {};
  const code = str(b.code, 20).toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(code)) errors.code = "۵ تا ۲۰ حرف انگلیسی یا عدد";
  const type = b.type === "amount" ? "amount" : "percent";
  const amount = n(b.amount);
  if (!(amount > 0) || (type === "percent" && amount > 100)) errors.amount = type === "percent" ? "درصد بین ۱ تا ۱۰۰" : "مبلغ نامعتبر";
  const maxDiscountAmount = n(b.maxDiscountAmount);
  if (type === "percent" && !(maxDiscountAmount > 0)) errors.maxDiscountAmount = "برای تخفیف درصدی، سقف لازم است";
  const expireDate = b.expireDate ? new Date(b.expireDate) : null;
  if (expireDate && (isNaN(expireDate) || expireDate < new Date())) errors.expireDate = "تاریخ باید در آینده باشد";
  if (Object.keys(errors).length) throw new HttpError(422, "لطفاً فرم را بررسی کنید", { errors });
  return {
    code,
    type,
    amount,
    maxDiscountAmount: type === "percent" ? maxDiscountAmount : null,
    minOrderAmount: n(b.minOrderAmount) || null,
    usageLimit: n(b.usageLimit) ? Math.floor(n(b.usageLimit)) : null,
    expireDate,
    description: str(b.description, 200),
    isActive: b.isActive !== false,
  };
}

router.post(
  "/api/discounts",
  requirePermission("manage_discounts"),
  asyncHandler(async (req, res) => {
    const data = discountPayload(req.body);
    if (await DiscountCode.exists({ code: data.code })) throw new HttpError(409, "این کد قبلاً ساخته شده است", { errors: { code: "تکراری" } });
    const d = await DiscountCode.create(data);
    audit.log(req, "create_discount", "discount", d);
    res.status(201).json({ success: true, message: "کد تخفیف ساخته شد" });
  })
);

router.put(
  "/api/discounts/:id",
  requirePermission("manage_discounts"),
  asyncHandler(async (req, res) => {
    const d = isObjectId(req.params.id) && (await DiscountCode.findById(req.params.id));
    if (!d) throw new HttpError(404, "کد پیدا نشد");
    const data = discountPayload(req.body);
    if (await DiscountCode.exists({ code: data.code, _id: { $ne: d._id } })) throw new HttpError(409, "این کد قبلاً ساخته شده است", { errors: { code: "تکراری" } });
    Object.assign(d, data);
    await d.save();
    audit.log(req, "update_discount", "discount", d);
    res.json({ success: true, message: "ذخیره شد" });
  })
);

router.delete(
  "/api/discounts/:id",
  requirePermission("manage_discounts"),
  asyncHandler(async (req, res) => {
    const d = isObjectId(req.params.id) && (await DiscountCode.findByIdAndDelete(req.params.id));
    if (!d) throw new HttpError(404, "کد پیدا نشد");
    audit.log(req, "delete_discount", "discount", d);
    res.json({ success: true, message: "حذف شد" });
  })
);

// ───────────── Blog ─────────────
router.get(
  "/weblogs",
  requirePermission("manage_weblogs"),
  asyncHandler(async (req, res) => {
    const items = await Weblog.find({}).sort({ createdAt: -1 }).populate("categories", "name").select("-content").lean();
    res.render("admin/weblogs", { title: "مجله", items });
  })
);

async function blogForm(res, post, title) {
  const cats = await Category.find({ categoryType: "weblog" }).sort({ name: 1 }).lean();
  res.render("admin/weblog-form", { title, post, cats });
}

router.get("/weblogs/new", requirePermission("manage_weblogs"), asyncHandler(async (req, res) => blogForm(res, { isPublished: false, images: [], categories: [], tags: [] }, "مقاله جدید")));
router.get(
  "/weblogs/:id/edit",
  requirePermission("manage_weblogs"),
  asyncHandler(async (req, res) => {
    const post = isObjectId(req.params.id) && (await Weblog.findById(req.params.id).lean());
    if (!post) throw new HttpError(404, "مقاله پیدا نشد");
    await blogForm(res, post, "ویرایش مقاله");
  })
);

async function weblogPayload(b) {
  const errors = {};
  const title = str(b.title, 100);
  const description = str(b.description, 160);
  const content = sanitize.rich(typeof b.content === "string" ? b.content.slice(0, 300000) : "");
  if (title.length < 5) errors.title = "عنوان حداقل ۵ حرف";
  if (!description) errors.description = "خلاصه الزامی است";
  if (sanitize.text(content).trim().length < 100) errors.content = "متن مقاله حداقل ۱۰۰ حرف";
  if (Object.keys(errors).length) throw new HttpError(422, "لطفاً فرم را بررسی کنید", { errors });
  const cats = (Array.isArray(b.categories) ? b.categories : []).filter(isObjectId);
  const image = str(b.image, 300);
  return {
    title,
    description,
    content,
    categories: cats,
    tags: String(b.tags || "").split(/[,،]/).map((t) => str(t, 40)).filter(Boolean).slice(0, 15),
    readingTime: clampInt(b.readingTime, 1, 120, Math.max(1, Math.round(sanitize.text(content).split(/\s+/).length / 200))),
    images: /^\/uploads\//.test(image) ? [{ url: image, filename: image.split("/").pop(), alt: title, caption: str(b.imageCaption, 150) }] : [],
    metaTitle: str(b.metaTitle, 60) || title.slice(0, 60),
    metaDescription: str(b.metaDescription, 160) || description,
    isPublished: !!b.isPublished,
    isFeatured: !!b.isFeatured,
  };
}

router.post(
  "/api/weblogs",
  requirePermission("manage_weblogs"),
  asyncHandler(async (req, res) => {
    const data = await weblogPayload(req.body);
    const w = await Weblog.create({ ...data, author: req.admin._id, publishedAt: data.isPublished ? new Date() : undefined });
    audit.log(req, "create_weblog", "weblog", w);
    res.status(201).json({ success: true, message: "مقاله ساخته شد", redirect: `/admin/weblogs/${w._id}/edit` });
  })
);

router.put(
  "/api/weblogs/:id",
  requirePermission("manage_weblogs"),
  asyncHandler(async (req, res) => {
    const w = isObjectId(req.params.id) && (await Weblog.findById(req.params.id));
    if (!w) throw new HttpError(404, "مقاله پیدا نشد");
    const data = await weblogPayload(req.body);
    const removed = w.images.map((i) => i.url).filter((u) => !data.images.some((i) => i.url === u));
    if (data.isPublished && !w.publishedAt) data.publishedAt = new Date();
    Object.assign(w, data);
    await w.save();
    await removeOrphanImages(removed);
    audit.log(req, "update_weblog", "weblog", w);
    res.json({ success: true, message: "ذخیره شد" });
  })
);

router.delete(
  "/api/weblogs/:id",
  requirePermission("manage_weblogs"),
  asyncHandler(async (req, res) => {
    const w = isObjectId(req.params.id) && (await Weblog.findByIdAndDelete(req.params.id));
    if (!w) throw new HttpError(404, "مقاله پیدا نشد");
    await removeOrphanImages(w.images.map((i) => i.url));
    audit.log(req, "delete_weblog", "weblog", w);
    res.json({ success: true, message: "حذف شد" });
  })
);

// ───────────── Settings ─────────────
router.get("/settings", requirePermission("manage_settings"), asyncHandler(async (req, res) => res.render("admin/settings", { title: "تنظیمات فروشگاه", s: await Setting.get() })));

router.put(
  "/api/settings",
  requirePermission("manage_settings"),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const fields = ["phone", "email", "address", "workingHours", "instagram", "telegram", "whatsapp", "shippingNote", "dispatchTime", "announcement"];
    const update = {};
    fields.forEach((f) => (update[f] = str(b[f], f === "shippingNote" || f === "address" ? 300 : 120)));
    if (["تیپاکس", "چاپار", "ایران-پیام"].includes(b.defaultCarrier)) update.defaultCarrier = b.defaultCarrier;
    update.lowStockThreshold = clampInt(b.lowStockThreshold, 0, 1000, 3);
    await Setting.updateOne({ key: "store" }, { $set: update }, { upsert: true });
    Setting.invalidate();
    audit.log(req, "update_settings", "settings", { _id: req.admin._id, name: "تنظیمات" });
    res.json({ success: true, message: "تنظیمات ذخیره شد" });
  })
);

module.exports = router;
