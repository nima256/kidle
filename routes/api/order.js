const express = require("express");
const router = express.Router();
const orders = require("../../lib/orders");
const limits = require("../../lib/rateLimits");
const { requireUser } = require("../../middlewares/auth");
const { asyncHandler, str } = require("../../lib/util");

router.post(
  "/checkout",
  requireUser,
  limits.checkout,
  asyncHandler(async (req, res) => {
    const r = await orders.checkout(req);
    res.json({ success: true, redirectUrl: r.redirectUrl });
  })
);

// ZarinPal callback (URL unchanged from the previous site).
router.get(
  "/verify",
  asyncHandler(async (req, res) => {
    const r = await orders.handleCallback({ authority: str(req.query.Authority, 64), status: str(req.query.Status, 10) });
    if (!r.orderNum) return res.redirect("/checkout/result?status=unknown");
    res.redirect(`/checkout/result/${encodeURIComponent(r.orderNum)}`);
  })
);

// Old URLs → new result page.
router.get("/payment-success", (req, res) => res.redirect(301, "/account/orders"));
router.get("/payment-failed", (req, res) => res.redirect(301, "/cart"));

module.exports = router;
