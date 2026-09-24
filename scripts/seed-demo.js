// Development only: fills an EMPTY local database with demo catalogue data.
// Usage: NODE_ENV=development node scripts/seed-demo.js
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const config = require("../config");

if (config.isProd) {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Product = require("../models/Product");
const Weblog = require("../models/Weblog");
const Admin = require("../models/Admins");
const DiscountCode = require("../models/DiscountCode");

const shapes = {
  tee: '<path d="M140 90h50q30 25 60 0h50l70 55-35 45-35-25v200H175V165l-35 25-35-45z"/>',
  dress: '<path d="M185 90h25l15 40h50l15-40h25l10 95 80 200q-135 40-270 0l80-200z"/>',
  onesie: '<path d="M150 90h45q30 28 60 0h45l60 60-35 35-30-25v140q0 45-40 55h-15q-20-25-40 0h-15q-40-10-40-55V160l-30 25-35-35z"/>',
  pants: '<path d="M160 90h180l15 300h-75l-30-200-30 200h-75z"/>',
  hoodie: '<path d="M175 110q75-60 150 0l75 50-30 50-30-20v200H160V190l-30 20-30-50z"/><path d="M200 105q50 70 100 0" fill="rgba(255,255,255,.35)"/>',
};

async function image(name, shape, color, bg) {
  const dir = path.join(__dirname, "../public/uploads/demo");
  fs.mkdirSync(dir, { recursive: true });
  const file = `${name}.webp`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="625" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice"><rect width="500" height="500" fill="${bg}"/><circle cx="380" cy="120" r="90" fill="#fff" opacity=".45"/><g fill="${color}">${shapes[shape]}</g></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(path.join(dir, file));
  return { url: `/uploads/demo/${file}`, filename: file, alt: name };
}

(async () => {
  await mongoose.connect(config.dbUrl);
  if ((await Product.countDocuments()) > 0) {
    console.log("Database already has products — not seeding.");
    return process.exit(0);
  }
  const brand = await Brand.create({ name: "کیدل" });
  const brand2 = await Brand.create({ name: "نونا" });

  const mk = (name, emoji, color, parentId) => Category.create({ name, categoryType: "product", emoji, color, parentId });
  const girls = await mk("دخترانه", "👗", "#ffe4ee");
  const boys = await mk("پسرانه", "👕", "#e3f1ff");
  const baby = await mk("نوزادی", "🍼", "#fff5d9");
  const sets = await mk("ست لباس", "🎀", "#efe8ff");
  const acc = await mk("اکسسوری", "🧦", "#d9f3e8");
  const dresses = await mk("پیراهن و سارافون", undefined, undefined, girls._id);
  const tees = await mk("تیشرت", undefined, undefined, boys._id);
  const pants = await mk("شلوار", undefined, undefined, boys._id);
  const blogCat = await Category.create({ name: "راهنمای خرید", categoryType: "weblog" });

  const sizesKid = [{ size: "۲", usage: "۱.۵ تا ۲ سال" }, { size: "۴", usage: "۳ تا ۴ سال" }, { size: "۶", usage: "۵ تا ۶ سال" }, { size: "۸", usage: "۷ تا ۸ سال" }];
  const sizesBaby = [{ size: "۰-۳ ماه", usage: "قد ۵۰ تا ۶۰" }, { size: "۳-۶ ماه", usage: "قد ۶۰ تا ۶۸" }, { size: "۶-۱۲ ماه", usage: "قد ۶۸ تا ۸۰" }];
  const C = { pink: { name: "صورتی", rgb: "#f7a8c4" }, cream: { name: "کرم", rgb: "#f3e3c3" }, blue: { name: "آبی", rgb: "#9cc7f0" }, mint: { name: "سبز نعنایی", rgb: "#a7e3c9" }, gray: { name: "طوسی", rgb: "#b9b3b8" } };

  const items = [
    ["پیراهن گلدار نخی دخترانه", "dress", "#f7729f", "#ffe4ee", [dresses._id, girls._id], 690000, 520000, 12, sizesKid, [C.pink, C.cream], { isNewProduct: true, isFeatured: true }],
    ["سارافون جین دخترانه", "dress", "#6c8fd1", "#e3f1ff", [dresses._id, girls._id], 840000, null, 2, sizesKid, [C.blue], { isPopular: true }],
    ["تیشرت پنبه‌ای طرح خرس", "tee", "#8fd9bd", "#d9f3e8", [tees._id, boys._id], 390000, 330000, 30, sizesKid, [C.mint, C.gray, C.blue], { isNewProduct: true, isPopular: true }],
    ["تیشرت راه‌راه پسرانه", "tee", "#6c8fd1", "#e3f1ff", [tees._id, boys._id], 420000, null, 0, sizesKid, [C.blue], {}],
    ["شلوار اسلش نخی", "pants", "#7b6f77", "#f5f0f2", [pants._id, boys._id], 480000, null, 18, sizesKid, [C.gray], { isFeatured: true }],
    ["سرهمی نوزادی دکمه‌دار", "onesie", "#ffc95c", "#fff5d9", [baby._id], 450000, 399000, 9, sizesBaby, [C.cream, C.pink], { isNewProduct: true, isFeatured: true }],
    ["سرهمی خرگوشی نوزاد", "onesie", "#f7a8c4", "#ffe4ee", [baby._id], 520000, null, 3, sizesBaby, [C.pink], { isPopular: true }],
    ["هودی کلاه‌دار بچگانه", "hoodie", "#c9b6ff", "#efe8ff", [sets._id], 950000, 760000, 7, sizesKid, [C.gray, C.pink], { isFeatured: true }],
    ["ست تیشرت و شلوارک تابستانه", "tee", "#ffa0c0", "#fff3f7", [sets._id, girls._id], 620000, null, 14, sizesKid, [C.pink, C.mint], { isNewProduct: true }],
    ["جوراب نخی سه‌جفتی", "pants", "#a7e3c9", "#eefaf5", [acc._id], 180000, 150000, 40, [], [], {}],
  ];
  let i = 0;
  for (const [name, shape, color, bg, category, price, offerPrice, stock, sizes, colors, flags] of items) {
    const imgs = [await image(`p${i}-a`, shape, color, bg), await image(`p${i}-b`, shape, color, "#ffffff")];
    await Product.create({
      name, category, brand: i % 3 ? brand._id : brand2._id, price, offerPrice: offerPrice || undefined,
      discount: offerPrice ? Math.round(((price - offerPrice) / price) * 100) : 0,
      countInStock: stock, sizes, colors, images: imgs, isPublished: true, catName: "",
      lilDescription: "پارچه نخی نرم و قابل تنفس، مناسب استفاده روزانه و بازی.",
      description: "<p>این لباس از <strong>پارچه نخی ۱۰۰٪</strong> دوخته شده و برای پوست حساس کودک مناسب است.</p><ul><li>قابل شستشو در ماشین لباسشویی با دمای ۳۰ درجه</li><li>رنگ ثابت</li></ul>",
      specifications: [{ key: "جنس", value: "نخ پنبه" }, { key: "کشور سازنده", value: "ایران" }, { key: "نحوه شستشو", value: "ماشین، ۳۰ درجه" }],
      tags: ["بچگانه", "نخی"], ...flags, createdAt: new Date(Date.now() - i * 86400000),
    });
    i++;
  }
  await Product.create({ name: "محصول پیش‌نویس منتشرنشده", category: [girls._id], brand: brand._id, price: 100000, countInStock: 5, isPublished: false });

  const devPassword = "Dev" + require("crypto").randomBytes(9).toString("base64url") + "1";
  let admin = await Admin.findOne();
  const createdAdmin = !admin;
  if (!admin) admin = await Admin.create({ fullName: "مدیر آزمایشی", email: "admin@local.test", password: devPassword, role: "super_admin", permissions: [] });
  await Weblog.create({
    title: "چطور سایز مناسب لباس کودک را انتخاب کنیم؟",
    description: "راهنمای سریع انتخاب سایز لباس بچه بر اساس سن، قد و وزن.",
    content: "<p>انتخاب سایز درست، مهم‌ترین قدم در خرید آنلاین لباس کودک است. " + "در این راهنما یاد می‌گیرید چطور با اندازه‌گیری قد و دور سینه، سایز مناسب را انتخاب کنید. ".repeat(4) + "</p><h2>قد کودک را بسنجید</h2><p>قد، دقیق‌ترین معیار انتخاب سایز است.</p>",
    categories: [blogCat._id], isPublished: true, publishedAt: new Date(), author: admin._id, readingTime: 4,
  });
  await DiscountCode.create({ code: "WELCOME10", type: "percent", amount: 10, maxDiscountAmount: 100000, isActive: true });
  console.log("Seeded demo data." + (createdAdmin ? ` Dev admin: admin@local.test / ${devPassword}` : ""));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
