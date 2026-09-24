// Admin panel. Every route below the login handlers requires an active admin session, and each
// section additionally requires its own permission (enforced here, not just hidden in the UI).
const express = require("express");
const router = express.Router();

const Admin = require("../../models/Admins");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const User = require("../../models/User");
const Review = require("../../models/Review");
const Visit = require("../../models/Visit");
const RecentAction = require("../../models/RecentAction");
const Setting = require("../../models/Setting");
const limits = require("../../lib/rateLimits");
const audit = require("../../lib/audit");
const { requireAdmin, requirePermission } = require("../../middlewares/adminAuth");
const { hasPermission, PERMISSIONS } = require("../../lib/permissions");
const { asyncHandler, str } = require("../../lib/util");
const { getPersianDate } = require("../../helper/getPersianDate");

const LOCK_AFTER = 5;
const DUMMY_HASH = require("bcryptjs").hashSync("not-a-real-password", 10);
const LOCK_MINUTES = 15;

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.locals.noindex = true;
  res.locals.path = req.baseUrl + req.path;
  next();
});

// ───────────── Auth ─────────────
router.get("/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  res.render("admin/login", { error: str(req.query.error, 40) });
});

router.post(
  "/login",
  limits.adminLogin,
  asyncHandler(async (req, res) => {
    const email = str(req.body.email, 120).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password.slice(0, 200) : "";
    const generic = { success: false, message: "ایمیل یا رمز عبور اشتباه است" };
    if (!email || !password) return res.status(400).json({ success: false, message: "ایمیل و رمز عبور را وارد کنید" });

    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin) {
      await require("bcryptjs").compare(password, DUMMY_HASH); // equalise timing: no account enumeration
      return res.status(401).json(generic);
    }
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      return res.status(429).json({ success: false, message: `حساب به‌دلیل تلاش‌های ناموفق موقتاً قفل است. ${LOCK_MINUTES} دقیقه دیگر تلاش کنید` });
    }
    const ok = await admin.comparePassword(password);
    if (!ok) {
      admin.failedLoginCount = (admin.failedLoginCount || 0) + 1;
      if (admin.failedLoginCount >= LOCK_AFTER) {
        admin.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        admin.failedLoginCount = 0;
      }
      await admin.save();
      return res.status(401).json(generic);
    }
    if (!admin.isActive) return res.status(403).json({ success: false, message: "حساب مدیریتی شما غیرفعال است" });

    admin.failedLoginCount = 0;
    admin.lockUntil = undefined;
    admin.lastLoginAt = new Date();
    admin.lastLoginIP = req.ip;
    await admin.save();

    await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.adminId = String(admin._id);
    req.session.adminSeenAt = Date.now();
    req.admin = admin;
    audit.log(req, "admin_login", "admin", admin);
    res.json({ success: true, redirect: "/admin" });
  })
);

const logout = (req, res) => {
  if (req.session.adminId) delete req.session.adminId;
  req.session.save(() => (req.method === "GET" ? res.redirect("/admin/login") : res.json({ success: true })));
};
router.post("/logout", logout);
router.get("/logout", logout);

// ───────────── Everything below needs an admin ─────────────
router.use(requireAdmin);
router.use(async (req, res, next) => {
  res.locals.settings = await Setting.get();
  res.locals.navItems = require("./nav").items.filter((i) => hasPermission(req.admin, i.perm));
  res.locals.counts = {
    toShip: await Order.countDocuments({ paymentStatus: "پرداخت شده", status: { $in: ["در حال پردازش", "بسته بندی شده"] } }),
    reviews: await Review.countDocuments({ status: "pending" }),
    needsReview: await Order.countDocuments({ needsReview: true }),
  };
  next();
});

// Dashboard (or the first section the admin is allowed to see).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!hasPermission(req.admin, "view_dashboard")) {
      const first = require("./nav").items.find((i) => i.perm && hasPermission(req.admin, i.perm));
      return first ? res.redirect(first.href) : res.render("admin/forbidden", { title: "عدم دسترسی" });
    }
    const PAID = { paymentStatus: "پرداخت شده" };
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const days = (n) => new Date(now.getTime() - n * 86400000);
    const settings = res.locals.settings;

    const sum = async (match) => {
      const orders = await Order.find(match).select("totalPrice").lean();
      return { count: orders.length, revenue: orders.reduce((s, o) => s + (o.totalPrice || 0), 0) };
    };

    const [today, last30, prev30, awaiting, failed7, customers, newCustomers, lowStock, outOfStock, published, drafts, visitsToday, recentOrders, actions, chartOrders] = await Promise.all([
      sum({ ...PAID, "paymentInfo.paymentDate": { $gte: startToday } }),
      sum({ ...PAID, "paymentInfo.paymentDate": { $gte: days(30) } }),
      sum({ ...PAID, "paymentInfo.paymentDate": { $gte: days(60), $lt: days(30) } }),
      Order.countDocuments({ status: "در انتظار پرداخت", "reservation.released": false }),
      Order.countDocuments({ paymentStatus: "لغو شده", createdAt: { $gte: days(7) } }),
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: days(7) } }),
      Product.find({ countInStock: { $gt: 0, $lte: settings.lowStockThreshold || 3 } }).select("name slug countInStock images").sort({ countInStock: 1 }).limit(8).lean({ getters: false }),
      Product.countDocuments({ isPublished: true, countInStock: { $lte: 0 } }),
      Product.countDocuments({ isPublished: true }),
      Product.countDocuments({ isPublished: false }),
      Visit.countDocuments({ visitDate: getPersianDate() }),
      Order.find({ paymentStatus: { $ne: "لغو شده" } }).sort({ createdAt: -1 }).limit(8).lean(),
      RecentAction.find({}).sort({ _id: -1 }).limit(8).lean(),
      Order.find({ ...PAID, "paymentInfo.paymentDate": { $gte: days(14) } }).select("totalPrice paymentInfo.paymentDate").lean(),
    ]);

    const chart = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d.getTime() + 86400000);
      const dayOrders = chartOrders.filter((o) => o.paymentInfo.paymentDate >= d && o.paymentInfo.paymentDate < next);
      chart.push({ label: d.toLocaleDateString("fa-IR", { day: "numeric", month: "short" }), revenue: dayOrders.reduce((s, o) => s + o.totalPrice, 0), count: dayOrders.length });
    }

    res.render("admin/dashboard", {
      title: "داشبورد",
      stats: { today, last30, prev30, awaiting, failed7, customers, newCustomers, outOfStock, published, drafts, visitsToday },
      lowStock,
      recentOrders,
      actions,
      actionLabels: audit.LABELS,
      chart,
    });
  })
);

router.use(require("./products"));
router.use(require("./catalog"));
router.use(require("./orders"));
router.use(require("./people"));
router.use(require("./content"));

router.use((req, res) => {
  if (req.method !== "GET") return res.status(404).json({ success: false, message: "پیدا نشد" });
  res.status(404).render("admin/forbidden", { title: "پیدا نشد", notFound: true });
});

module.exports = router;
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.requirePermission = requirePermission;
