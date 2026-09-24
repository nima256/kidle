// Admin sidebar. Items are shown only if the admin has the permission (routes enforce it too).
const items = [
  { href: "/admin", label: "داشبورد", icon: "chart", perm: "view_dashboard", exact: true },
  { href: "/admin/orders", label: "سفارش‌ها", icon: "package", perm: "manage_orders", badge: "toShip" },
  { href: "/admin/payments", label: "پرداخت‌ها", icon: "card", perm: "view_payments" },
  { href: "/admin/products", label: "محصولات", icon: "hanger", perm: "manage_products" },
  { href: "/admin/inventory", label: "موجودی انبار", icon: "layers", perm: "manage_inventory" },
  { href: "/admin/categories", label: "دسته‌بندی‌ها", icon: "grid", perm: "manage_categories" },
  { href: "/admin/brands", label: "برندها", icon: "tag", perm: "manage_brands" },
  { href: "/admin/customers", label: "مشتریان", icon: "users", perm: "manage_users" },
  { href: "/admin/reviews", label: "نظرات", icon: "message", perm: "manage_reviews", badge: "reviews" },
  { href: "/admin/discounts", label: "کدهای تخفیف", icon: "percent", perm: "manage_discounts" },
  { href: "/admin/weblogs", label: "مجله", icon: "file", perm: "manage_weblogs" },
  { href: "/admin/admins", label: "مدیران", icon: "shield", perm: "manage_admins" },
  { href: "/admin/settings", label: "تنظیمات فروشگاه", icon: "settings", perm: "manage_settings" },
];
module.exports = { items };
