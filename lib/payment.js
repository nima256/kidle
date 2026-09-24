// Thin wrapper around ZarinPal. Amounts are in Toman (currency IRT) — this matches the
// behaviour that was verified in production and must not change without testing.
const ZarinPal = require("zarinpal-checkout");
const config = require("../config");

// Local-only fake gateway for development/QA. Never active in production.
const useMock = !config.isProd && process.env.PAYMENT_MOCK === "1";

let client = null;
function zarinpal() {
  if (!client) client = ZarinPal.create(config.zarinpal.merchantId || "".padEnd(36, "0"), config.zarinpal.sandbox);
  return client;
}

const mockVerified = new Set();

async function request({ amount, description, mobile, email }) {
  const callbackUrl = `${config.siteUrl}/api/order/verify`;
  if (useMock) {
    const authority = "A" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
    return { ok: true, authority, url: `/dev/fake-gateway?Authority=${authority}&amount=${amount}` };
  }
  const res = await zarinpal().PaymentRequest({
    Amount: amount,
    CallbackURL: callbackUrl,
    Description: description,
    Email: email || undefined,
    Mobile: mobile,
  });
  if (res.status !== 100 || !res.authority) return { ok: false, code: res.status };
  return { ok: true, authority: res.authority, url: res.url };
}

/** Returns { ok, alreadyVerified, refId, cardPan, code } */
async function verify({ amount, authority }) {
  if (useMock) {
    const already = mockVerified.has(authority);
    mockVerified.add(authority);
    return { ok: true, alreadyVerified: already, refId: "MOCK-" + authority.slice(-6), cardPan: "6037****1234", code: already ? 101 : 100 };
  }
  const res = await zarinpal().PaymentVerification({ Amount: amount, Authority: authority });
  // 100 = verified now, 101 = already verified earlier (duplicate callback / refresh).
  const ok = res.status === 100 || res.status === 101;
  return { ok, alreadyVerified: res.status === 101, refId: res.refId, cardPan: res.cardPan, code: res.status };
}

module.exports = { request, verify, useMock };
