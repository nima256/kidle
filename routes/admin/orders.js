const express = require("express");
const router = express.Router();
const Order = require("../../models/Order");
const inventory = require("../../lib/inventory");
const audit = require("../../lib/audit");
const { STATUS, PAY } = require("../../lib/orders");
const { requirePermission } = require("../../middlewares/adminAuth");
const { asyncHandler, str, isObjectId, escapeRegex, clampInt, HttpError } = require("../../lib/util");

const PAGE = 30;
const CARRIERS = ["تیپاکس", "چاپار", "ایران-پیام"];

// Allowed manual transitions for paid orders.
const FLOW = {
  [STATUS.PROCESSING]: [STATUS.PACKED, STATUS.SHIPPING, STATUS.CANCELLED],
  [STATUS.PACKED]: [STATUS.SHIPPING, STATUS.PROCESSING, STATUS.CANCELLED],
  [STATUS.SHIPPING]: [STATUS.DELIVERED, STATUS.PACKED],
  [STATUS.DELIVERED]: [STATUS.SHIPPING],
  [STATUS.CANCELLED]: [],
  [STATUS.AWAITING]: [STATUS.CANCELLED],
  "پرداخت شده": [STATUS.PROCESSING, STATUS.CANCELLED],
};

function listFilter(query) {
  const filter = {};
  const tab = str(query.tab, 20) || "todo";
  if (tab === "todo") Object.assign(filter, { paymentStatus: PAY.PAID, status: { $in: [STATUS.PROCESSING, STATUS.PACKED, "پرداخت شده"] } });
  if (tab === "shipping") Object.assign(filter, { paymentStatus: PAY.PAID, status: STATUS.SHIPPING });
  if (tab === "done") Object.assign(filter, { status: STATUS.DELIVERED });
  if (tab === "awaiting") Object.assign(filter, { status: STATUS.AWAITING });
  if (tab === "cancelled") Object.assign(filter, { status: STATUS.CANCELLED });
  if (tab === "review") Object.assign(filter, { needsReview: true });
  const q = str(query.q, 60);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ OrderNum: re }, { recipientName: re }, { recipientPhone: re }, { trackingNumber: re }, { "paymentInfo.refId": re }];
  }
  return { filter, tab, q };
}

router.get(
  "/orders",
  requirePermission("manage_orders"),
  asyncHandler(async (req, res) => {
    const { filter, tab, q } = listFilter(req.query);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: tab === "todo" ? 1 : -1 }).skip((page - 1) * PAGE).limit(PAGE).populate("user", "mobile fullName").lean(),
      Order.countDocuments(filter),
    ]);
    res.render("admin/orders", { title: "سفارش‌ها", orders, total, page, pages: Math.ceil(total / PAGE) || 1, tab, q });
  })
);

router.get(
  "/orders/:id",
  requirePermission("manage_orders", "view_payments"),
  asyncHandler(async (req, res) => {
    const order = isObjectId(req.params.id) && (await Order.findById(req.params.id).populate("user", "mobile fullName email createdAt").populate("products.product", "slug images countInStock").lean({ getters: false }));
    if (!order) throw new HttpError(404, "سفارش پیدا نشد");
    const key = order.paymentStatus === PAY.PAID ? order.status : order.status;
    res.render("admin/order", { title: `سفارش ${order.OrderNum}`, order, next: FLOW[key] || [], carriers: CARRIERS });
  })
);

router.patch(
  "/api/orders/:id",
  requirePermission("manage_orders"),
  asyncHandler(async (req, res) => {
    const order = isObjectId(req.params.id) && (await Order.findById(req.params.id));
    if (!order) throw new HttpError(404, "سفارش پیدا نشد");
    const changes = [];

    if (req.body.trackingNumber !== undefined) {
      order.trackingNumber = str(req.body.trackingNumber, 60);
      changes.push("کد رهگیری");
    }
    if (req.body.delivery !== undefined) {
      if (!CARRIERS.includes(req.body.delivery)) throw new HttpError(422, "شرکت ارسال نامعتبر است");
      order.delivery = req.body.delivery;
      changes.push("شرکت ارسال");
    }
    if (req.body.adminNote !== undefined) {
      order.adminNote = str(req.body.adminNote, 1000);
      changes.push("یادداشت");
    }
    if (req.body.needsReview === false) {
      order.needsReview = false;
      changes.push("بررسی شد");
    }

    const status = str(req.body.status, 30);
    if (status && status !== order.status) {
      const allowed = FLOW[order.status] || [];
      if (!allowed.includes(status)) throw new HttpError(422, `تغییر وضعیت از «${order.status}» به «${status}» مجاز نیست`);
      if (status !== STATUS.CANCELLED && order.paymentStatus !== PAY.PAID) throw new HttpError(422, "سفارش پرداخت‌نشده را نمی‌توان ارسال کرد");
      if (status === STATUS.SHIPPING && !order.trackingNumber && !str(req.body.trackingNumber, 60)) {
        throw new HttpError(422, "برای ارسال، کد رهگیری را وارد کنید", { errors: { trackingNumber: "الزامی" } });
      }
      order.status = status;
      order.statusHistory.push({ status, note: str(req.body.note, 200) || `توسط ${req.admin.fullName}`, changedBy: req.admin._id, changedAt: new Date() });
      changes.push(`وضعیت: ${status}`);
    }
    await order.save();

    // Cancelling returns reserved/sold stock to the shelf exactly once.
    if (status === STATUS.CANCELLED) {
      const released = await Order.findOneAndUpdate(
        { _id: order._id, "reservation.released": false },
        { $set: { "reservation.released": true, "reservation.releasedAt": new Date(), "reservation.releaseReason": "لغو توسط مدیر" } }
      );
      if (released) await inventory.restock(order.products.map((p) => ({ productId: p.product, quantity: p.quantity })));
      if (order.paymentStatus !== PAY.PAID) await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: PAY.CANCELLED } });
    }
    audit.log(req, "update_order_status", "order", order, changes.join("، "));
    res.json({ success: true, message: status === STATUS.CANCELLED && order.paymentStatus === PAY.PAID ? "سفارش لغو شد و موجودی برگشت. استرداد وجه را از پنل زرین‌پال انجام دهید." : "ذخیره شد" });
  })
);

// Payments view: every order that reached the gateway.
router.get(
  "/payments",
  requirePermission("view_payments"),
  asyncHandler(async (req, res) => {
    const f = str(req.query.f, 10);
    const filter = { "paymentInfo.authority": { $exists: true } };
    if (f === "paid") filter.paymentStatus = PAY.PAID;
    if (f === "failed") filter.paymentStatus = PAY.CANCELLED;
    if (f === "pending") filter.paymentStatus = PAY.UNPAID;
    const page = clampInt(req.query.page, 1, 1000, 1);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
      Order.countDocuments(filter),
    ]);
    res.render("admin/payments", { title: "پرداخت‌ها", orders, total, page, pages: Math.ceil(total / PAGE) || 1, f });
  })
);

module.exports = router;
