// Granular admin permissions and the role presets offered in the admin UI.
// super_admin bypasses checks; every other admin only gets what is listed on their account.

const PERMISSIONS = {
  view_dashboard: "مشاهده داشبورد و گزارش‌ها",
  manage_products: "مدیریت محصولات",
  manage_inventory: "مدیریت موجودی انبار",
  manage_categories: "مدیریت دسته‌بندی‌ها",
  manage_brands: "مدیریت برندها",
  manage_orders: "مدیریت سفارش‌ها",
  view_payments: "مشاهده پرداخت‌ها",
  manage_users: "مدیریت مشتریان",
  manage_reviews: "مدیریت نظرات",
  manage_discounts: "مدیریت کدهای تخفیف",
  manage_weblogs: "مدیریت وبلاگ",
  manage_settings: "تنظیمات فروشگاه و ارسال",
  manage_admins: "مدیریت مدیران",
  // Legacy names kept so existing admin documents stay valid.
  view_analytics: "مشاهده آمار (قدیمی)",
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

const ROLE_PRESETS = {
  order_manager: {
    label: "مدیر سفارش‌ها",
    permissions: ["view_dashboard", "manage_orders", "view_payments", "manage_users", "manage_inventory"],
  },
  catalog_manager: {
    label: "مدیر محصولات",
    permissions: ["view_dashboard", "manage_products", "manage_inventory", "manage_categories", "manage_brands"],
  },
  content_editor: {
    label: "ویراستار محتوا",
    permissions: ["manage_weblogs", "manage_reviews"],
  },
  marketing: {
    label: "بازاریابی",
    permissions: ["view_dashboard", "manage_discounts", "manage_reviews"],
  },
};

function hasPermission(admin, permission) {
  if (!admin) return false;
  if (admin.role === "super_admin") return true;
  const list = admin.permissions || [];
  if (list.includes(permission)) return true;
  // Legacy mapping: old "view_analytics" admins can still see the dashboard.
  if (permission === "view_dashboard" && list.includes("view_analytics")) return true;
  return false;
}

module.exports = { PERMISSIONS, ALL_PERMISSIONS, ROLE_PRESETS, hasPermission };
