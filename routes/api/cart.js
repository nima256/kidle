const express = require("express");
const router = express.Router();
const cartService = require("../../lib/cart");
const discountService = require("../../lib/discount");
const { asyncHandler, str } = require("../../lib/util");

const respond = async (req, res, message) => {
  const cart = await cartService.build(req);
  res.json({ success: true, message, cart });
};

router.get("/", asyncHandler(async (req, res) => respond(req, res)));

router.post(
  "/items",
  asyncHandler(async (req, res) => {
    const { productId, quantity, color, size } = req.body || {};
    const r = await cartService.addItem(req, { productId: str(productId, 30), quantity, color, size });
    res.json({ success: true, message: "به سبد خرید اضافه شد", cartCount: r.count });
  })
);

router.patch(
  "/items",
  asyncHandler(async (req, res) => {
    await cartService.updateItem(req, str(req.body.key, 200), req.body.quantity);
    await respond(req, res, "سبد خرید به‌روز شد");
  })
);

router.delete(
  "/items",
  asyncHandler(async (req, res) => {
    await cartService.removeItem(req, str(req.body.key, 200));
    await respond(req, res, "از سبد خرید حذف شد");
  })
);

router.post(
  "/discount",
  asyncHandler(async (req, res) => {
    const code = str(req.body.code, 30).toUpperCase();
    const cart = await cartService.build(req);
    if (!cart.items.length) return res.status(400).json({ success: false, message: "سبد خرید شما خالی است" });
    const r = await discountService.evaluate(code, cart.subtotal);
    if (!r.ok) return res.status(400).json({ success: false, message: r.message });
    req.session.discountCode = r.discount.code;
    await respond(req, res, "کد تخفیف اعمال شد");
  })
);

router.delete(
  "/discount",
  asyncHandler(async (req, res) => {
    delete req.session.discountCode;
    await respond(req, res, "کد تخفیف حذف شد");
  })
);

module.exports = router;
