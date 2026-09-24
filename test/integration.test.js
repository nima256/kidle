// Integration tests for the money/stock/auth-critical paths.
// Needs a MongoDB-compatible server: TEST_DB_URL (default mongodb://127.0.0.1:27017/kidle_test).
// Run: npm test
process.env.NODE_ENV = "test";
process.env.PAYMENT_MOCK = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-test-secret-test-secret-123456";
process.env.DB_URL = process.env.TEST_DB_URL || "mongodb://127.0.0.1:27017/kidle_test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const session = require("express-session");

// Capture OTPs instead of sending SMS.
const sms = require("../lib/sms");
const sent = {};
sms.sendOtpSms = async (mobile, code) => { sent[mobile] = code; };

const { createApp } = require("../app");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Order = require("../models/Order");
const Otp = require("../models/Otp");
const User = require("../models/User");
const Admin = require("../models/Admins");
const Review = require("../models/Review");
const DiscountCode = require("../models/DiscountCode");
const orders = require("../lib/orders");

let server, base, product, soloProduct, cat, brand;

// Minimal cookie-keeping client.
function client() {
  let cookie = "";
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { "content-type": "application/json", accept: "application/json", ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, location: res.headers.get("location") };
  };
}

async function login(call, mobile) {
  await Otp.updateOne({ mobile }, { $set: { lastSentAt: new Date(0) } }); // skip resend cooldown between tests
  const r1 = await call("POST", "/api/auth/otp/request", { mobile });
  assert.equal(r1.status, 200, r1.text);
  const r2 = await call("POST", "/api/auth/otp/verify", { mobile, code: sent[mobile] });
  assert.equal(r2.status, 200, r2.text);
}

before(async () => {
  await mongoose.connect(process.env.DB_URL);
  await mongoose.connection.db.dropDatabase();
  cat = await Category.create({ name: "دخترانه", categoryType: "product" });
  brand = await Brand.create({ name: "کیدل" });
  product = await Product.create({
    name: "پیراهن آزمایشی", category: [cat._id], brand: brand._id, price: 500000, offerPrice: 400000,
    countInStock: 5, isPublished: true, sizes: [{ size: "۴", usage: "۳ تا ۴ سال" }, { size: "۶" }], colors: [{ name: "صورتی", rgb: "#ff00aa" }],
  });
  soloProduct = await Product.create({ name: "جوراب تک", category: [cat._id], brand: brand._id, price: 100000, countInStock: 1, isPublished: true });
  await Product.create({ name: "پیش‌نویس مخفی", category: [cat._id], brand: brand._id, price: 1000, countInStock: 3, isPublished: false });
  await DiscountCode.create({ code: "MIN900K", type: "amount", amount: 50000, minOrderAmount: 900000 });
  const app = createApp({ sessionStore: new session.MemoryStore() });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server && server.close();
  await mongoose.disconnect();
});

test("robots.txt allows crawling and lists the sitemap", async () => {
  const r = await client()("GET", "/robots.txt");
  assert.match(r.text, /User-agent: \*\nAllow: \//);
  assert.doesNotMatch(r.text, /Disallow: \/\n/);
  assert.match(r.text, /Sitemap: /);
});

test("unpublished products are not visible", async () => {
  const r = await client()("GET", "/api/search/suggest?q=" + encodeURIComponent("پیش"));
  assert.equal(r.json.products.length, 0);
});

test("OTP: never returned, wrong code counted, cooldown enforced, single use", async () => {
  const call = client();
  const mobile = "09121111111";
  const r = await call("POST", "/api/auth/otp/request", { mobile: "۰۹۱۲۱۱۱۱۱۱۱" }); // Persian digits accepted
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.json).includes(sent[mobile]), "code must not be in the response");
  const doc = await Otp.findOne({ mobile });
  assert.ok(doc.codeHash && !String(doc.codeHash).includes(sent[mobile]), "code stored hashed");

  const again = await call("POST", "/api/auth/otp/request", { mobile });
  assert.equal(again.status, 429);
  assert.equal(again.json.code, "COOLDOWN");

  const wrong = sent[mobile] === "11111" ? "22222" : "11111";
  const bad = await call("POST", "/api/auth/otp/verify", { mobile, code: wrong });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.remaining, 4);

  const ok = await call("POST", "/api/auth/otp/verify", { mobile, code: sent[mobile] });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.isNew, true);

  const reuse = await client()("POST", "/api/auth/otp/verify", { mobile, code: sent[mobile] });
  assert.equal(reuse.status, 400, "code is single-use");
});

test("OTP: locked after 5 wrong attempts; expired codes rejected", async () => {
  const call = client();
  const mobile = "09122222222";
  await call("POST", "/api/auth/otp/request", { mobile });
  const wrong = sent[mobile] === "11111" ? "22222" : "11111";
  let last;
  for (let i = 0; i < 5; i++) last = await call("POST", "/api/auth/otp/verify", { mobile, code: wrong });
  assert.equal(last.json.code, "LOCKED");
  const right = await call("POST", "/api/auth/otp/verify", { mobile, code: sent[mobile] });
  assert.notEqual(right.status, 200, "correct code no longer works once locked");

  await Otp.updateOne({ mobile }, { $set: { lastSentAt: new Date(0) } });
  await call("POST", "/api/auth/otp/request", { mobile });
  await Otp.updateOne({ mobile }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const exp = await call("POST", "/api/auth/otp/verify", { mobile, code: sent[mobile] });
  assert.equal(exp.json.code, "EXPIRED");
});

test("cart: size/colour required, stock respected, guest cart merges on login", async () => {
  const call = client();
  const id = String(product._id);
  let r = await call("POST", "/api/cart/items", { productId: id, quantity: 1, color: "صورتی" });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /سایز/);
  r = await call("POST", "/api/cart/items", { productId: id, quantity: 9, color: "صورتی", size: "4" });
  assert.equal(r.status, 409, "cannot exceed stock");
  r = await call("POST", "/api/cart/items", { productId: id, quantity: 2, color: "صورتی", size: "4" });
  assert.equal(r.status, 200);
  assert.equal(r.json.cartCount, 2);
  await login(call, "09123333333");
  const cart = await call("GET", "/api/cart");
  assert.equal(cart.json.cart.count, 2, "guest cart kept after login");
  assert.equal(cart.json.cart.payable, 800000, "server-side pricing uses offer price");
  assert.equal(cart.json.cart.shippingCost, 0, "shipping is pas-kerayeh, not charged online");
});

test("discount: minimum is checked against the server subtotal", async () => {
  const call = client();
  await call("POST", "/api/cart/items", { productId: String(product._id), quantity: 1, color: "صورتی", size: "6" });
  const r = await call("POST", "/api/cart/discount", { code: "min900k", subtotal: 99999999 });
  assert.equal(r.status, 400);
});

const shipping = { recipientName: "سارا محمدی", recipientPhone: "09124444444", province: "تهران", city: "تهران", address: "خیابان آزادی، کوچه یک، پلاک ۲" };

test("checkout: reserves stock, idempotent per key, payment success is idempotent", async () => {
  const call = client();
  await login(call, "09124444444");
  await call("POST", "/api/cart/items", { productId: String(product._id), quantity: 2, color: "صورتی", size: "4" });
  const before = (await Product.findById(product._id)).countInStock;

  const bad = await call("POST", "/api/order/checkout", { ...shipping, address: "کوتاه", checkoutKey: "k-bad" });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.address);

  const [a, b] = await Promise.all([
    call("POST", "/api/order/checkout", { ...shipping, checkoutKey: "key-1" }),
    call("POST", "/api/order/checkout", { ...shipping, checkoutKey: "key-1" }),
  ]);
  assert.equal(a.status, 200, a.text);
  assert.equal(b.status, 200, b.text);
  const user = await User.findOne({ mobile: "09124444444" });
  const list = await Order.find({ user: user._id });
  assert.equal(list.length, 1, "double submit creates one order");
  const order = list[0];
  assert.equal(order.totalPrice, 800000);
  assert.equal((await Product.findById(product._id)).countInStock, before - 2, "stock reserved");

  const cb = await call("GET", `/api/order/verify?Authority=${order.paymentInfo.authority}&Status=OK`);
  assert.equal(cb.status, 302);
  assert.match(cb.location, new RegExp(order.OrderNum));
  const paid = await Order.findById(order._id);
  assert.equal(paid.paymentStatus, "پرداخت شده");
  assert.equal(paid.status, "در حال پردازش");

  // Duplicate callback / refresh must not change anything or double-deduct.
  await call("GET", `/api/order/verify?Authority=${order.paymentInfo.authority}&Status=NOK`);
  const still = await Order.findById(order._id);
  assert.equal(still.paymentStatus, "پرداخت شده");
  assert.equal((await Product.findById(product._id)).countInStock, before - 2);
  assert.equal((await call("GET", "/api/cart")).json.cart.count, 0, "purchased items leave the cart");
});

test("failed payment releases stock and keeps the cart", async () => {
  const call = client();
  await login(call, "09125555555");
  await call("POST", "/api/cart/items", { productId: String(product._id), quantity: 1, color: "صورتی", size: "4" });
  const start = (await Product.findById(product._id)).countInStock;
  const r = await call("POST", "/api/order/checkout", { ...shipping, checkoutKey: "fail-1" });
  assert.equal(r.status, 200);
  const user = await User.findOne({ mobile: "09125555555" });
  const order = await Order.findOne({ user: user._id });
  assert.equal((await Product.findById(product._id)).countInStock, start - 1);
  await call("GET", `/api/order/verify?Authority=${order.paymentInfo.authority}&Status=NOK`);
  assert.equal((await Product.findById(product._id)).countInStock, start, "stock returned");
  assert.equal((await Order.findById(order._id)).status, "لغو شده");
  assert.equal((await call("GET", "/api/cart")).json.cart.count, 1, "cart survives failed payment");
  // Repeating the failure callback must not return stock twice.
  await call("GET", `/api/order/verify?Authority=${order.paymentInfo.authority}&Status=NOK`);
  assert.equal((await Product.findById(product._id)).countInStock, start);
});

test("abandoned checkout: reservation expires and stock is released once", async () => {
  const call = client();
  await login(call, "09126666666");
  await call("POST", "/api/cart/items", { productId: String(product._id), quantity: 1, color: "صورتی", size: "4" });
  const start = (await Product.findById(product._id)).countInStock;
  await call("POST", "/api/order/checkout", { ...shipping, checkoutKey: "abandon-1" });
  const user = await User.findOne({ mobile: "09126666666" });
  const order = await Order.findOne({ user: user._id });
  await Order.updateOne({ _id: order._id }, { $set: { "reservation.expiresAt": new Date(Date.now() - 1000) } });
  await Promise.all([orders.expireReservations(), orders.expireReservations()]);
  assert.equal((await Product.findById(product._id)).countInStock, start, "released exactly once");
  assert.equal((await Order.findById(order._id)).status, "لغو شده");
});

test("concurrent purchase of the last unit: only one checkout wins", async () => {
  const c1 = client();
  const c2 = client();
  await login(c1, "09127777777");
  await login(c2, "09128888888");
  await c1("POST", "/api/cart/items", { productId: String(soloProduct._id), quantity: 1 });
  await c2("POST", "/api/cart/items", { productId: String(soloProduct._id), quantity: 1 });
  const [a, b] = await Promise.all([
    c1("POST", "/api/order/checkout", { ...shipping, checkoutKey: "race-a" }),
    c2("POST", "/api/order/checkout", { ...shipping, checkoutKey: "race-b" }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal((await Product.findById(soloProduct._id)).countInStock, 0, "never negative");
});

test("reviews: require login, go to moderation, rating updates on approval", async () => {
  const anon = await client()("POST", `/api/products/${product._id}/reviews`, { rating: 5, text: "خیلی عالی بود" });
  assert.equal(anon.status, 401);
  const call = client();
  await login(call, "09124444444"); // bought the product above
  const r = await call("POST", `/api/products/${product._id}/reviews`, { rating: 4, text: "پارچه خیلی نرمه <script>x</script>" });
  assert.equal(r.status, 200);
  const rev = await Review.findOne({ product: product._id });
  assert.equal(rev.status, "pending");
  assert.equal(rev.verifiedBuyer, true);
  assert.doesNotMatch(rev.text, /<script>/);
  let list = await call("GET", `/api/products/${product._id}/reviews`);
  assert.equal(list.json.total, 0, "pending reviews are hidden");
  rev.status = "approved";
  await rev.save();
  await require("../lib/reviews").recompute(product._id);
  list = await call("GET", `/api/products/${product._id}/reviews`);
  assert.equal(list.json.total, 1);
  assert.equal((await Product.findById(product._id)).rating, 4);
});

test("admin: permissions enforced server-side, no escalation, lockout", async () => {
  await Admin.create({ fullName: "مدیر ارشد", email: "boss@test.io", password: "BossPass12345", role: "super_admin" });
  await Admin.create({ fullName: "مدیر سفارش", email: "ops@test.io", password: "OpsPass12345", role: "admin", permissions: ["manage_orders", "manage_admins"] });
  const ops = client();
  const li = await ops("POST", "/admin/login", { email: "ops@test.io", password: "OpsPass12345" });
  assert.equal(li.status, 200);
  assert.equal((await ops("POST", "/admin/api/products", { name: "x" })).status, 403);
  const esc = await ops("POST", "/admin/api/admins", { fullName: "هکر", email: "h@test.io", password: "Hackpass123", role: "admin", permissions: ["manage_settings"] });
  assert.equal(esc.status, 403, "cannot grant permissions they don't have");
  const sup = await ops("POST", "/admin/api/admins", { fullName: "هکر", email: "h2@test.io", password: "Hackpass123", role: "super_admin" });
  assert.equal(sup.status, 403, "cannot create super admins");

  const guess = client();
  for (let i = 0; i < 5; i++) await guess("POST", "/admin/login", { email: "boss@test.io", password: "wrong-" + i });
  const locked = await guess("POST", "/admin/login", { email: "boss@test.io", password: "BossPass12345" });
  assert.equal(locked.status, 429, "account locked after repeated failures");
});

test("cross-site writes are rejected", async () => {
  const res = await fetch(base + "/api/cart/items", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ productId: String(product._id) }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null, "no reflected CORS");
});
