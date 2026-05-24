// adminSeed.js - نسخه جدید
const mongoose = require("mongoose");
const Admin = require("./models/Admins");
require("dotenv").config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.DB_URL || "mongodb://localhost:27017/odour");
    
    // پاک کردن ادمین قبلی (اختیاری)
    await Admin.deleteMany({});
    
    const adminEmail = "admin@example.com";
    const adminPassword = "admin123456";
    const adminName = "مدیر ارشد سایت";
    
    // سوپر ادمین با همه دسترسی‌ها
    const superAdmin = new Admin({
      fullName: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'super_admin',
      isActive: true,
      permissions: [
        'manage_products',
        'manage_orders',
        'manage_users',
        'manage_categories',
        'manage_brands',
        'manage_discounts',
        'manage_weblogs',
        'view_analytics',
        'manage_admins'
      ]
    });
    
    await superAdmin.save();
    
    // یه ادمین ساده هم بسازیم برای مثال
    const simpleAdmin = new Admin({
      fullName: "مدیر محصولات",
      email: "product@example.com",
      password: "product123456",
      role: 'admin',
      isActive: true,
      permissions: [
        'manage_products',
        'manage_categories',
        'manage_brands',
        'view_analytics'
      ],
      createdBy: superAdmin._id
    });
    
    await simpleAdmin.save();
    
    console.log(`✅ ادمین‌ها با موفقیت ساخته شدند:
    
    🔹 سوپر ادمین:
       ایمیل: ${adminEmail}
       رمز: ${adminPassword}
       نقش: super_admin
       دسترسی‌ها: همه
    
    🔹 ادمین محصولات:
       ایمیل: product@example.com
       رمز: product123456
       نقش: admin
       دسترسی‌ها: manage_products, manage_categories, manage_brands, view_analytics
    `);
    
    process.exit();
  } catch (error) {
    console.error("❌ خطا در ایجاد ادمین:", error);
    process.exit(1);
  }
}

createAdmin();