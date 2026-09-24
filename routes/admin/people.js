const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const Order = require("../../models/Order");
const Admin = require("../../models/Admins");
const audit = require("../../lib/audit");
const { PERMISSIONS, ROLE_PRESETS, hasPermission } = require("../../lib/permissions");
const { requirePermission } = require("../../middlewares/adminAuth");
const { asyncHandler, str, isObjectId, escapeRegex, clampInt, HttpError, toEnDigits } = require("../../lib/util");

const PAGE = 40;

// ───────────── Customers ─────────────
router.get(
  "/customers",
  requirePermission("manage_users"),
  asyncHandler(async (req, res) => {
    const q = str(req.query.q, 60);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const filter = {};
    if (q) {
      const re = new RegExp(escapeRegex(toEnDigits(q)), "i");
      filter.$or = [{ mobile: re }, { fullName: new RegExp(escapeRegex(q), "i") }, { email: re }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).select("fullName mobile email createdAt lastLoginAt orders").lean(),
      User.countDocuments(filter),
    ]);
    const stats = await Order.aggregate([
      { $match: { user: { $in: users.map((u) => u._id) }, paymentStatus: "پرداخت شده" } },
      { $group: { _id: "$user", n: { $sum: 1 }, spent: { $sum: "$totalPrice" } } },
    ]);
    users.forEach((u) => {
      const s = stats.find((x) => String(x._id) === String(u._id));
      u.paidOrders = s?.n || 0;
      u.spent = s?.spent || 0;
    });
    res.render("admin/customers", { title: "مشتریان", users, total, page, pages: Math.ceil(total / PAGE) || 1, q });
  })
);

router.get(
  "/customers/:id",
  requirePermission("manage_users"),
  asyncHandler(async (req, res) => {
    const customer = isObjectId(req.params.id) && (await User.findById(req.params.id).lean());
    if (!customer) throw new HttpError(404, "مشتری پیدا نشد");
    const orders = await Order.find({ user: customer._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.render("admin/customer", { title: customer.fullName || customer.mobile, customer, orders });
  })
);

// ───────────── Admins ─────────────
router.get(
  "/admins",
  requirePermission("manage_admins"),
  asyncHandler(async (req, res) => {
    const admins = await Admin.find({}).sort({ role: -1, fullName: 1 }).lean();
    res.render("admin/admins", { title: "مدیران", admins, PERMISSIONS, ROLE_PRESETS });
  })
);

function strongPassword(p) {
  return typeof p === "string" && p.length >= 10 && /[a-zA-Z]/.test(p) && /\d/.test(p);
}

// Nobody can grant more than they have; only a super admin can create/modify super admins.
function sanitizeGrant(actor, body) {
  const role = body.role === "super_admin" ? "super_admin" : "admin";
  if (role === "super_admin" && actor.role !== "super_admin") throw new HttpError(403, "فقط مدیر ارشد می‌تواند مدیر ارشد بسازد");
  const requested = (Array.isArray(body.permissions) ? body.permissions : []).filter((p) => PERMISSIONS[p]);
  const escalation = requested.filter((p) => !hasPermission(actor, p));
  if (escalation.length) throw new HttpError(403, "نمی‌توانید دسترسی‌ای بدهید که خودتان ندارید");
  return { role, permissions: role === "super_admin" ? [] : requested };
}

router.post(
  "/api/admins",
  requirePermission("manage_admins"),
  asyncHandler(async (req, res) => {
    const fullName = str(req.body.fullName, 50);
    const email = str(req.body.email, 120).toLowerCase();
    const errors = {};
    if (fullName.length < 3) errors.fullName = "نام حداقل ۳ حرف";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "ایمیل نامعتبر";
    if (!strongPassword(req.body.password)) errors.password = "حداقل ۱۰ کاراکتر شامل حرف و عدد";
    if (Object.keys(errors).length) throw new HttpError(422, "لطفاً فرم را بررسی کنید", { errors });
    if (await Admin.exists({ email })) throw new HttpError(409, "این ایمیل قبلاً ثبت شده است", { errors: { email: "تکراری" } });
    const grant = sanitizeGrant(req.admin, req.body);
    const a = await Admin.create({ fullName, email, password: req.body.password, ...grant, isActive: true, createdBy: req.admin._id });
    audit.log(req, "create_admin", "admin", a);
    res.status(201).json({ success: true, message: "مدیر جدید ساخته شد" });
  })
);

router.put(
  "/api/admins/:id",
  requirePermission("manage_admins"),
  asyncHandler(async (req, res) => {
    const a = isObjectId(req.params.id) && (await Admin.findById(req.params.id));
    if (!a) throw new HttpError(404, "مدیر پیدا نشد");
    const self = String(a._id) === String(req.admin._id);
    if (a.role === "super_admin" && req.admin.role !== "super_admin") throw new HttpError(403, "فقط مدیر ارشد می‌تواند مدیر ارشد را ویرایش کند");
    if (self && (req.body.isActive === false || (req.body.role && req.body.role !== a.role))) {
      throw new HttpError(422, "نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید");
    }
    const grant = sanitizeGrant(req.admin, req.body);
    if (a.role === "super_admin" && grant.role !== "super_admin" || (a.role === "super_admin" && req.body.isActive === false)) {
      const supers = await Admin.countDocuments({ role: "super_admin", isActive: true });
      if (supers <= 1) throw new HttpError(422, "حداقل یک مدیر ارشد فعال باید باقی بماند");
    }
    a.fullName = str(req.body.fullName, 50) || a.fullName;
    Object.assign(a, grant);
    if (typeof req.body.isActive === "boolean") a.isActive = req.body.isActive;
    if (req.body.password) {
      if (!strongPassword(req.body.password)) throw new HttpError(422, "رمز عبور ضعیف است", { errors: { password: "حداقل ۱۰ کاراکتر شامل حرف و عدد" } });
      a.password = req.body.password;
      a.failedLoginCount = 0;
      a.lockUntil = undefined;
    }
    await a.save();
    audit.log(req, "update_admin", "admin", a);
    res.json({ success: true, message: "ذخیره شد" });
  })
);

// Any admin can change their own password.
router.get("/profile", (req, res) => res.render("admin/profile", { title: "حساب من" }));
router.put(
  "/api/profile/password",
  asyncHandler(async (req, res) => {
    const a = await Admin.findById(req.admin._id).select("+password");
    if (!(await a.comparePassword(String(req.body.current || "")))) throw new HttpError(422, "رمز فعلی اشتباه است", { errors: { current: "اشتباه" } });
    if (!strongPassword(req.body.password)) throw new HttpError(422, "رمز جدید ضعیف است", { errors: { password: "حداقل ۱۰ کاراکتر شامل حرف و عدد" } });
    a.password = req.body.password;
    await a.save();
    audit.log(req, "change_password", "admin", a);
    res.json({ success: true, message: "رمز عبور تغییر کرد" });
  })
);

module.exports = router;
