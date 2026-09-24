const rateLimit = require("express-rate-limit");
const config = require("../config");

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, code: "RATE_LIMITED", message }),
  });

module.exports = {
  otpRequest: make(15 * 60 * 1000, 8, "درخواست‌های زیادی ارسال شده است. چند دقیقه دیگر دوباره تلاش کنید"),
  otpVerify: make(15 * 60 * 1000, 20, "تلاش‌های زیادی انجام شده است. چند دقیقه دیگر دوباره تلاش کنید"),
  adminLogin: make(15 * 60 * 1000, 10, "تلاش‌های ورود زیاد بود. ۱۵ دقیقه دیگر دوباره تلاش کنید"),
  api: make(60 * 1000, 120, "تعداد درخواست‌ها زیاد است. کمی صبر کنید"),
  review: make(60 * 60 * 1000, 10, "در این مدت نظرات زیادی ثبت کرده‌اید. بعداً دوباره تلاش کنید"),
  checkout: make(10 * 60 * 1000, 15, "تلاش‌های پرداخت زیاد بود. چند دقیقه دیگر دوباره تلاش کنید"),
};
