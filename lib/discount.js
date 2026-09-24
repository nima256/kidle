const DiscountCode = require("../models/DiscountCode");
const { formatPrice } = require("./util");

// Validates a code against a server-computed subtotal. Never trust client totals.
async function evaluate(code, subtotal) {
  if (!code) return { ok: false, message: "کد تخفیف را وارد کنید" };
  const discount = await DiscountCode.findOne({ code: String(code).trim().toUpperCase() });
  const now = new Date();
  if (!discount || !discount.isActive) return { ok: false, message: "این کد تخفیف معتبر نیست" };
  if (discount.expireDate && discount.expireDate < now) return { ok: false, message: "این کد تخفیف منقضی شده است" };
  if (discount.usageLimit && discount.usedCount >= discount.usageLimit) {
    return { ok: false, message: "ظرفیت استفاده از این کد تمام شده است" };
  }
  if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
    return {
      ok: false,
      message: `این کد برای خرید بالای ${formatPrice(discount.minOrderAmount)} تومان است`,
    };
  }
  let amount =
    discount.type === "percent"
      ? Math.floor((subtotal * discount.amount) / 100)
      : discount.amount;
  if (discount.type === "percent" && discount.maxDiscountAmount) amount = Math.min(amount, discount.maxDiscountAmount);
  amount = Math.max(0, Math.min(amount, subtotal));
  return {
    ok: true,
    discount,
    amount,
    summary: {
      code: discount.code,
      type: discount.type,
      amount: discount.amount,
      calculatedAmount: amount,
      originalValue: discount.type === "percent" ? `${discount.amount}%` : `${discount.amount} تومان`,
    },
  };
}

// Counts a use only after successful payment, without exceeding usageLimit.
async function consume(code) {
  if (!code) return;
  await DiscountCode.updateOne(
    {
      code,
      $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
    },
    { $inc: { usedCount: 1 } }
  );
}

module.exports = { evaluate, consume };
