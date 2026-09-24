const RecentAction = require("../models/RecentAction");

// Fire-and-forget audit log for admin actions.
function log(req, action, targetType, target, details = "") {
  const admin = req.admin;
  if (!admin) return;
  RecentAction.create({
    action,
    targetType,
    targetId: target?._id || target?.id || admin._id,
    targetName: String(target?.name || target?.title || target?.code || target?.OrderNum || target?.fullName || "-").slice(0, 120),
    adminId: admin._id,
    adminName: admin.fullName,
    details,
    ipAddress: req.ip,
  }).catch((e) => console.error("[audit]", e.message));
}

module.exports = { log };

module.exports.LABELS = {
  create_product: "افزودن محصول", update_product: "ویرایش محصول", delete_product: "حذف محصول", update_stock: "تغییر موجودی",
  create_category: "افزودن دسته", update_category: "ویرایش دسته", delete_category: "حذف دسته",
  create_brand: "افزودن برند", update_brand: "ویرایش برند", delete_brand: "حذف برند",
  create_discount: "ساخت کد تخفیف", update_discount: "ویرایش کد تخفیف", delete_discount: "حذف کد تخفیف",
  update_order_status: "به‌روزرسانی سفارش", create_weblog: "افزودن مقاله", update_weblog: "ویرایش مقاله", delete_weblog: "حذف مقاله",
  moderate_review: "بررسی نظر", delete_review: "حذف نظر", create_admin: "افزودن مدیر", update_admin: "ویرایش مدیر",
  change_password: "تغییر رمز", update_settings: "تغییر تنظیمات", admin_login: "ورود به پنل", admin_logout: "خروج از پنل",
};
