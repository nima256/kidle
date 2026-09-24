const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const { requireUser } = require("../../middlewares/auth");
const { asyncHandler, str } = require("../../lib/util");
const validator = require("validator");

router.patch(
  "/profile",
  requireUser,
  asyncHandler(async (req, res) => {
    const fullName = str(req.body.fullName, 60);
    const email = str(req.body.email, 100).toLowerCase();
    const errors = {};
    if (fullName && fullName.length < 3) errors.fullName = "نام باید حداقل ۳ حرف باشد";
    if (email && !validator.isEmail(email)) errors.email = "ایمیل معتبر نیست";
    if (Object.keys(errors).length) return res.status(422).json({ success: false, message: "لطفاً فرم را بررسی کنید", errors });
    if (email && (await User.exists({ email, _id: { $ne: req.session.userId } }))) {
      return res.status(409).json({ success: false, message: "این ایمیل برای حساب دیگری ثبت شده است", errors: { email: "تکراری" } });
    }
    const update = { $set: { fullName } };
    if (email) update.$set.email = email;
    else update.$unset = { email: 1 };
    await User.updateOne({ _id: req.session.userId }, update);
    res.json({ success: true, message: "اطلاعات شما ذخیره شد" });
  })
);

module.exports = router;
