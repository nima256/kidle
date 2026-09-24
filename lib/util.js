class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.statusCode = status;
    this.extra = extra;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Persian/Arabic digits → ASCII digits.
function toEnDigits(input) {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d));
}

function toFaDigits(input) {
  if (input === undefined || input === null) return "";
  return String(input).replace(/\d/g, (d) => FA_DIGITS[d]);
}

// "۰۹۱۲ ۳۴۵ ۶۷۸۹", "+989123456789", "9123456789" → "09123456789" (or "" if invalid)
function normalizeMobile(raw) {
  let s = toEnDigits(raw).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : "";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalises Arabic/Persian letter variants and whitespace so "كيف" and "کیف" match.
function normalizeText(s) {
  return toEnDigits(String(s || ""))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ً-ٰٟ]/g, "") // diacritics
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a regex that tolerates letter variants and ZWNJ/space differences.
function fuzzyRegexSource(term) {
  return escapeRegex(normalizeText(term))
    .replace(/ی/g, "[یيى]")
    .replace(/ک/g, "[کك]")
    .replace(/ه/g, "[هۀة]")
    .replace(/ا/g, "[اأإآ]")
    .replace(/ /g, "[\\s\\u200c]*");
}

function formatPrice(n) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
}

function str(v, max = 500) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).trim().slice(0, max);
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(toEnDigits(v), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isObjectId(v) {
  return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
}

function wantsJson(req) {
  return (
    req.originalUrl.startsWith("/api/") ||
    req.xhr ||
    (req.get("accept") || "").includes("application/json") ||
    (req.originalUrl.startsWith("/admin/") && req.method !== "GET")
  );
}

module.exports = {
  HttpError,
  asyncHandler,
  toEnDigits,
  toFaDigits,
  normalizeMobile,
  escapeRegex,
  normalizeText,
  fuzzyRegexSource,
  formatPrice,
  str,
  clampInt,
  isObjectId,
  wantsJson,
};
