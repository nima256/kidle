const mongoose = require("mongoose");

// Single-document store settings editable from the admin panel.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    phone: { type: String, default: "09054243464" },
    email: { type: String, default: "info@kidle.ir" },
    address: { type: String, default: "گرگان، خیابان پاسداران، پاساژ وارکانا، پلاک ۵۱" },
    workingHours: { type: String, default: "شنبه تا پنجشنبه ۹ الی ۱۸" },
    instagram: { type: String, default: "kidle" },
    telegram: { type: String, default: "kidle" },
    whatsapp: { type: String, default: "09054243464" },
    shippingNote: {
      type: String,
      default: "هزینه ارسال به‌صورت پس‌کرایه هنگام تحویل مرسوله به مأمور پست/پیک پرداخت می‌شود.",
    },
    dispatchTime: { type: String, default: "ارسال ۱ تا ۳ روز کاری پس از ثبت سفارش" },
    defaultCarrier: { type: String, enum: ["تیپاکس", "چاپار", "ایران-پیام"], default: "تیپاکس" },
    lowStockThreshold: { type: Number, default: 3, min: 0 },
    announcement: { type: String, default: "" },
  },
  { timestamps: true }
);

let cache = null;
let cacheAt = 0;

settingSchema.statics.get = async function () {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  let doc = await this.findOne({ key: "store" }).lean();
  if (!doc) doc = (await this.create({ key: "store" })).toObject();
  cache = doc;
  cacheAt = Date.now();
  return doc;
};

settingSchema.statics.invalidate = () => {
  cache = null;
};

module.exports = mongoose.model("Setting", settingSchema);
