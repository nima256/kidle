// Checkout → reservation → payment → confirmation. All money math happens here, on the server.
const crypto = require("crypto");
const Order = require("../models/Order");
const User = require("../models/User");
const Setting = require("../models/Setting");
const cartService = require("./cart");
const inventory = require("./inventory");
const payment = require("./payment");
const discountService = require("./discount");
const config = require("../config");
const { HttpError, str, toEnDigits, normalizeMobile } = require("./util");

const STATUS = {
  AWAITING: "در انتظار پرداخت",
  PROCESSING: "در حال پردازش",
  PACKED: "بسته بندی شده",
  SHIPPING: "در حال ارسال",
  DELIVERED: "تحویل داده شد",
  CANCELLED: "لغو شده",
};
const PAY = { UNPAID: "پرداخت نشده", PAID: "پرداخت شده", CANCELLED: "لغو شده" };

function newOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `KD-${ymd}-${crypto.randomInt(10000, 99999)}`;
}

function validateShipping(body) {
  const errors = {};
  const recipientName = str(body.recipientName, 60);
  const recipientPhone = normalizeMobile(body.recipientPhone);
  const province = str(body.province, 40);
  const city = str(body.city, 40);
  const address = str(body.address, 500);
  const postcode = toEnDigits(str(body.postcode, 20)).replace(/[\s-]/g, "");

  if (recipientName.length < 3) errors.recipientName = "نام و نام خانوادگی گیرنده را کامل وارد کنید";
  if (!recipientPhone) errors.recipientPhone = "شماره موبایل گیرنده معتبر نیست";
  if (!province) errors.province = "استان را انتخاب کنید";
  if (city.length < 2) errors.city = "شهر را وارد کنید";
  if (address.length < 10) errors.address = "آدرس را کامل‌تر بنویسید (خیابان، کوچه، پلاک، واحد)";
  if (postcode && !/^\d{10}$/.test(postcode)) errors.postcode = "کد پستی باید ۱۰ رقم باشد";

  if (Object.keys(errors).length) throw new HttpError(422, "لطفاً اطلاعات ارسال را بررسی کنید", { errors });
  return { recipientName, recipientPhone, province, city, address, postcode };
}

async function history(order, status, note) {
  order.statusHistory.push({ status, note, changedAt: new Date() });
}

/**
 * Creates (or returns the existing, for the same checkoutKey) order, reserves stock and
 * opens a payment. Returns { redirectUrl }.
 */
async function checkout(req) {
  const userId = req.session.userId;
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, "لطفاً ابتدا وارد حساب کاربری شوید");

  const checkoutKey = str(req.body.checkoutKey, 64).replace(/[^a-zA-Z0-9-]/g, "") || undefined;

  // Idempotency: a double tap / retry with the same key never creates a second order.
  if (checkoutKey) {
    const existing = await Order.findOne({ user: userId, checkoutKey });
    if (existing) {
      if (existing.paymentStatus === PAY.PAID) return { redirectUrl: `/checkout/result/${existing.OrderNum}` };
      if (existing.status === STATUS.AWAITING && !existing.reservation?.released && existing.paymentInfo?.paymentUrl) {
        return { redirectUrl: existing.paymentInfo.paymentUrl };
      }
      throw new HttpError(409, "این سفارش قبلاً بسته شده است. لطفاً صفحه را تازه کنید و دوباره تلاش کنید", { refresh: true });
    }
  }

  const shipping = validateShipping(req.body);
  const cart = await cartService.build(req);
  if (!cart.items.length) throw new HttpError(400, "سبد خرید شما خالی است");
  if (!cart.canCheckout) throw new HttpError(409, cart.issues[0] || "موجودی برخی کالاها تغییر کرده است", { issues: cart.issues });

  // A customer only ever has one open checkout: release older unpaid reservations first.
  const stale = await Order.find({ user: userId, status: STATUS.AWAITING, paymentStatus: PAY.UNPAID, "reservation.released": false });
  for (const o of stale) await cancelUnpaid(o._id, "شروع پرداخت جدید توسط مشتری");

  const reserved = await inventory.reserve(cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
  if (!reserved.ok) {
    throw new HttpError(
      409,
      reserved.available > 0
        ? `از «${reserved.name}» فقط ${reserved.available} عدد باقی مانده است`
        : `«${reserved.name || "یکی از کالاها"}» همین حالا ناموجود شد`,
      { refresh: true }
    );
  }

  const settings = await Setting.get();
  let order;
  try {
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      try {
        order = await Order.create({
          OrderNum: newOrderNumber(),
          user: userId,
          checkoutKey,
          ...shipping,
          products: cart.items.map((i) => ({
            product: i.productId,
            quantity: i.quantity,
            priceAtPurchase: i.unitPrice,
            nameAtPurchase: i.name,
            selectedColor: i.selectedColor,
            selectedSize: i.selectedSize,
          })),
          delivery: settings.defaultCarrier || "تیپاکس",
          shippingPayment: "پس‌کرایه",
          originalPrice: cart.subtotal,
          totalPrice: cart.payable,
          discount: cart.discount || undefined,
          discountAmount: cart.discountAmount,
          status: STATUS.AWAITING,
          paymentStatus: PAY.UNPAID,
          paymentMethod: "آنلاین",
          reservation: { expiresAt: new Date(Date.now() + config.reservationMinutes * 60_000), released: false },
          statusHistory: [{ status: STATUS.AWAITING, note: "ثبت سفارش و رزرو موجودی" }],
        });
      } catch (e) {
        if (e.code === 11000 && /checkoutKey/.test(e.message)) {
          // Lost a race with a parallel request carrying the same key.
          await inventory.restock(cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
          return checkout(req);
        }
        if (e.code !== 11000) throw e;
      }
    }
    if (!order) throw new Error("Could not allocate order number");
  } catch (e) {
    await inventory.restock(cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    throw e;
  }

  await User.updateOne(
    { _id: userId },
    {
      $addToSet: { orders: order._id },
      $set: {
        savedAddress: shipping,
        ...(user.fullName ? {} : { fullName: shipping.recipientName }),
      },
    }
  );

  // Fully discounted orders don't go to the gateway.
  if (order.totalPrice <= 0) {
    await markPaid(order._id, { refId: "FREE", cardPan: "" });
    return { redirectUrl: `/checkout/result/${order.OrderNum}` };
  }

  let pay;
  try {
    pay = await payment.request({
      amount: order.totalPrice,
      description: `سفارش ${order.OrderNum} از کیدل`,
      mobile: user.mobile,
      email: user.email,
    });
  } catch (e) {
    console.error("[payment] request failed:", e.message);
    pay = { ok: false };
  }
  if (!pay.ok) {
    await cancelUnpaid(order._id, "خطا در اتصال به درگاه پرداخت");
    throw new HttpError(502, "اتصال به درگاه پرداخت برقرار نشد. چند لحظه دیگر دوباره تلاش کنید");
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { "paymentInfo.authority": pay.authority, "paymentInfo.paymentUrl": pay.url } }
  );
  return { redirectUrl: pay.url, orderNum: order.OrderNum };
}

async function cancelUnpaid(orderId, reason) {
  await inventory.releaseOrder(orderId, reason);
  await Order.updateOne(
    { _id: orderId, paymentStatus: { $ne: PAY.PAID }, status: STATUS.AWAITING },
    {
      $set: { status: STATUS.CANCELLED, paymentStatus: PAY.CANCELLED },
      $push: { statusHistory: { status: STATUS.CANCELLED, note: reason, changedAt: new Date() } },
    }
  );
}

/** Flips an order to paid exactly once. Returns the order if this call did the flip, else null. */
async function markPaid(orderId, { refId, cardPan }) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $ne: PAY.PAID } },
    {
      $set: {
        paymentStatus: PAY.PAID,
        status: STATUS.PROCESSING,
        "paymentInfo.refId": refId,
        "paymentInfo.cardPan": cardPan,
        "paymentInfo.paymentDate": new Date(),
      },
      $push: { statusHistory: { status: STATUS.PROCESSING, note: "پرداخت موفق", changedAt: new Date() } },
    },
    { new: true }
  );
  if (!order) return null;

  // Paid after the reservation had expired and been released: take the stock again.
  if (order.reservation?.released) {
    const r = await inventory.reserve(order.products.map((p) => ({ productId: p.product, quantity: p.quantity })));
    await Order.updateOne(
      { _id: order._id },
      r.ok
        ? { $set: { "reservation.released": false, "reservation.releaseReason": "رزرو مجدد پس از پرداخت دیرهنگام" } }
        : { $set: { needsReview: true, reviewReason: "پرداخت پس از پایان مهلت رزرو انجام شد و موجودی کافی نیست — نیاز به بررسی/استرداد" } }
    );
  }

  if (order.discount?.code) await discountService.consume(order.discount.code);

  // Remove the purchased lines from the customer's cart.
  const user = await User.findById(order.user).select("cart");
  if (user) {
    const bought = new Set(order.products.map((p) => `${p.product}~${p.selectedColor || ""}~${p.selectedSize || ""}`));
    user.cart = user.cart.filter((i) => !bought.has(`${i.productId}~${i.selectedColor || ""}~${i.selectedSize || ""}`));
    await user.save();
  }
  return order;
}

/** Handles the gateway callback. Idempotent. Returns { orderNum, outcome }. */
async function handleCallback({ authority, status }) {
  const order = authority ? await Order.findOne({ "paymentInfo.authority": String(authority) }) : null;
  if (!order) return { outcome: "unknown" };

  if (order.paymentStatus === PAY.PAID) return { orderNum: order.OrderNum, outcome: "paid" };

  if (status !== "OK") {
    await cancelUnpaid(order._id, "پرداخت توسط مشتری لغو شد یا ناموفق بود");
    return { orderNum: order.OrderNum, outcome: "cancelled" };
  }

  let v;
  try {
    v = await payment.verify({ amount: order.totalPrice, authority: order.paymentInfo.authority });
  } catch (e) {
    // Network error talking to ZarinPal: keep the order pending (the reservation still holds)
    // so a refresh can retry verification instead of wrongly cancelling a real payment.
    console.error("[payment] verify error:", e.message);
    return { orderNum: order.OrderNum, outcome: "pending" };
  }

  if (v.ok) {
    await markPaid(order._id, { refId: v.refId, cardPan: v.cardPan });
    return { orderNum: order.OrderNum, outcome: "paid" };
  }

  await cancelUnpaid(order._id, `تأیید پرداخت ناموفق (کد ${v.code})`);
  return { orderNum: order.OrderNum, outcome: "failed" };
}

/** Releases reservations whose time is up. Safe to run concurrently. */
async function expireReservations() {
  const expired = await Order.find({
    status: STATUS.AWAITING,
    paymentStatus: PAY.UNPAID,
    "reservation.released": false,
    "reservation.expiresAt": { $lt: new Date() },
  }).select("_id");
  for (const o of expired) await cancelUnpaid(o._id, "پایان مهلت پرداخت");
  return expired.length;
}

module.exports = { checkout, handleCallback, expireReservations, cancelUnpaid, markPaid, STATUS, PAY, validateShipping };
