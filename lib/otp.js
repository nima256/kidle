const crypto = require("crypto");
const config = require("../config");
const Otp = require("../models/Otp");
const { sendOtpSms } = require("./sms");

const { length, ttlSeconds, resendCooldownSeconds, maxVerifyAttempts, maxSendsPerHour } = config.otp;
const HOUR = 60 * 60 * 1000;

const hash = (mobile, code) =>
  crypto.createHmac("sha256", config.otpSecret).update(`${mobile}:${code}`).digest("hex");

function generateCode() {
  // Uniform, cryptographically secure, always `length` digits.
  return String(crypto.randomInt(10 ** (length - 1), 10 ** length));
}

/**
 * Issues and sends a code. Returns { ok, retryAfter, expiresIn } or throws on provider errors.
 * The response is identical whether or not an account exists (no enumeration).
 */
async function requestCode(mobile, ip) {
  const now = new Date();
  let doc = await Otp.findOne({ mobile });

  if (doc) {
    const sinceLast = (now - doc.lastSentAt) / 1000;
    if (sinceLast < resendCooldownSeconds) {
      return { ok: false, reason: "cooldown", retryAfter: Math.ceil(resendCooldownSeconds - sinceLast) };
    }
    if (now - doc.windowStartedAt > HOUR) {
      doc.windowStartedAt = now;
      doc.sendCount = 0;
    }
    if (doc.sendCount >= maxSendsPerHour) {
      const retryAfter = Math.ceil((doc.windowStartedAt.getTime() + HOUR - now.getTime()) / 1000);
      return { ok: false, reason: "limit", retryAfter };
    }
  } else {
    doc = new Otp({ mobile, windowStartedAt: now, sendCount: 0 });
  }

  const code = generateCode();
  // Send first: if the SMS fails we must not burn the customer's quota or cooldown.
  await sendOtpSms(mobile, code);

  doc.codeHash = hash(mobile, code);
  doc.expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  doc.attempts = 0;
  doc.lastSentAt = now;
  doc.sendCount += 1;
  doc.ipAddress = ip || "";
  doc.purgeAt = new Date(now.getTime() + HOUR);
  await doc.save();

  return { ok: true, retryAfter: resendCooldownSeconds, expiresIn: ttlSeconds };
}

/** Returns { ok } or { ok:false, reason: 'missing'|'expired'|'locked'|'invalid', remaining } */
async function verifyCode(mobile, code) {
  const doc = await Otp.findOne({ mobile });
  if (!doc || !doc.codeHash) return { ok: false, reason: "missing" };
  if (doc.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (doc.attempts >= maxVerifyAttempts) return { ok: false, reason: "locked" };

  // Count the attempt atomically before comparing (prevents parallel guessing).
  const updated = await Otp.findOneAndUpdate(
    { _id: doc._id, attempts: { $lt: maxVerifyAttempts }, codeHash: doc.codeHash },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!updated) return { ok: false, reason: "locked" };

  const a = Buffer.from(hash(mobile, code), "hex");
  const b = Buffer.from(updated.codeHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const remaining = Math.max(0, maxVerifyAttempts - updated.attempts);
    if (remaining === 0) {
      await Otp.updateOne({ _id: doc._id }, { $set: { codeHash: "" } });
      return { ok: false, reason: "locked", remaining: 0 };
    }
    return { ok: false, reason: "invalid", remaining };
  }

  // Single use: invalidate the code but keep the send counters.
  await Otp.updateOne({ _id: doc._id }, { $set: { codeHash: "", attempts: 0 } });
  return { ok: true };
}

module.exports = { requestCode, verifyCode };
