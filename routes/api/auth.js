const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const otp = require("../../lib/otp");
const cartService = require("../../lib/cart");
const limits = require("../../lib/rateLimits");
const { asyncHandler, normalizeMobile, toEnDigits } = require("../../lib/util");

const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, code, message, ...extra });

// Step 1: send a one-time code. Same response whether or not the number has an account.
router.post(
  "/otp/request",
  limits.otpRequest,
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile) return fail(res, 422, "INVALID_MOBILE", "شماره موبایل را درست وارد کنید (مثل ۰۹۱۲۱۲۳۴۵۶۷)");
    let r;
    try {
      r = await otp.requestCode(mobile, req.ip);
    } catch (e) {
      console.error("[otp] send failed:", e.message);
      return fail(res, 502, "SMS_FAILED", "ارسال پیامک با مشکل روبه‌رو شد. چند لحظه دیگر دوباره تلاش کنید");
    }
    if (!r.ok) {
      const message =
        r.reason === "cooldown"
          ? "کد قبلی تازه ارسال شده است. کمی صبر کنید"
          : "تعداد درخواست کد برای این شماره زیاد بوده است. بعداً دوباره تلاش کنید";
      return fail(res, 429, r.reason === "cooldown" ? "COOLDOWN" : "SEND_LIMIT", message, { retryAfter: r.retryAfter });
    }
    res.json({ success: true, message: "کد تأیید پیامک شد", mobile, retryAfter: r.retryAfter, expiresIn: r.expiresIn });
  })
);

// Step 2: verify and sign in (creates the account on first login).
router.post(
  "/otp/verify",
  limits.otpVerify,
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    const code = toEnDigits(req.body.code || "").replace(/\D/g, "");
    if (!mobile) return fail(res, 422, "INVALID_MOBILE", "شماره موبایل معتبر نیست");
    if (code.length !== 5) return fail(res, 422, "INVALID_CODE", "کد ۵ رقمی را کامل وارد کنید");

    const r = await otp.verifyCode(mobile, code);
    if (!r.ok) {
      const map = {
        missing: [400, "EXPIRED", "کدی برای این شماره فعال نیست. کد جدید بگیرید"],
        expired: [400, "EXPIRED", "کد منقضی شده است. کد جدید بگیرید"],
        locked: [429, "LOCKED", "تعداد تلاش‌ها بیش از حد مجاز بود. کد جدید بگیرید"],
        invalid: [400, "WRONG_CODE", `کد اشتباه است. ${r.remaining} بار دیگر می‌توانید تلاش کنید`],
      };
      const [status, c, message] = map[r.reason];
      return fail(res, status, c, message, { remaining: r.remaining });
    }

    let user = await User.findOne({ mobile });
    const isNew = !user;
    if (!user) user = await User.create({ mobile });
    user.lastLoginAt = new Date();
    await user.save();

    // New session id on login (prevents session fixation) while keeping the guest cart.
    const guestCart = req.session.cart;
    const discountCode = req.session.discountCode;
    await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.userId = String(user._id);
    req.session.cart = guestCart;
    if (discountCode) req.session.discountCode = discountCode;
    await cartService.mergeGuestCart(req, user);

    res.json({
      success: true,
      message: isNew ? "به کیدل خوش آمدید!" : "خوش برگشتید!",
      isNew,
      user: { fullName: user.fullName, mobile: user.mobile },
    });
  })
);

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("sessionId");
    res.json({ success: true, message: "از حساب خود خارج شدید" });
  });
});

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.session.userId) return res.json({ success: true, user: null });
    const user = await User.findById(req.session.userId).select("fullName mobile").lean();
    res.json({ success: true, user });
  })
);

module.exports = router;
