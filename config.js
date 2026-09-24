// Central configuration. Every environment variable the app reads lives here.
require("dotenv").config();

const env = (key, fallback = "") => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : String(v).trim();
};

const isProd = env("NODE_ENV") === "production";

const config = {
  isProd,
  isTest: env("NODE_ENV") === "test",
  port: Number(env("PORT", "8080")),
  siteUrl: env("SITE_URL", env("WEBSITE_URL", "https://www.kidle.ir")).replace(/\/+$/, ""),
  dbUrl: env("DB_URL", "mongodb://127.0.0.1:27017/kidle"),
  sessionSecret: env("SESSION_SECRET"),
  otpSecret: env("OTP_SECRET", env("SESSION_SECRET")),
  sms: {
    apiKey: env("SMS_API_KEY"),
    bodyId: Number(env("SMS_BODY_ID", "347717")),
  },
  zarinpal: {
    merchantId: env("ZARINPAL_MERCHANT_ID"),
    sandbox: env("ZARINPAL_SANDBOX") === "true",
  },
  reservationMinutes: Number(env("RESERVATION_MINUTES", "30")),
  // "native" uses a TTL index (MongoDB). "interval" is for Mongo-compatible dev databases without TTL support.
  sessionAutoRemove: env("SESSION_AUTO_REMOVE", "native"),
  otp: {
    length: 5,
    ttlSeconds: 120,
    resendCooldownSeconds: 60,
    maxVerifyAttempts: 5,
    maxSendsPerHour: 5,
  },
};

// Fail loudly on misconfiguration instead of silently using weak defaults.
const problems = [];
if (!config.sessionSecret || config.sessionSecret.length < 32) {
  problems.push("SESSION_SECRET must be set to a random string of at least 32 characters");
}
if (isProd && !config.sms.apiKey) problems.push("SMS_API_KEY is not set — OTP login will not work");
if (isProd && !config.zarinpal.merchantId) problems.push("ZARINPAL_MERCHANT_ID is not set — payments will not work");

if (problems.length) {
  const msg = "[config] " + problems.join("\n[config] ");
  if (isProd && (!config.sessionSecret || config.sessionSecret.length < 32)) {
    throw new Error(msg);
  }
  console.warn(msg);
  if (!config.sessionSecret) config.sessionSecret = require("crypto").randomBytes(32).toString("hex");
  if (!config.otpSecret) config.otpSecret = config.sessionSecret;
}

module.exports = config;
