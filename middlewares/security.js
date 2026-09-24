const config = require("../config");

// CSRF defence for state-changing requests: the browser's Origin (or Referer) must be this site.
// Combined with SameSite=Lax cookies this blocks cross-site form/fetch submissions.
const EXEMPT = [/^\/torob_api\//];

function sameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (EXEMPT.some((re) => re.test(req.path))) return next();
  const source = req.get("origin") || req.get("referer");
  if (!source) {
    // Non-browser clients send neither header; browsers always send Origin on cross-site POST.
    return next();
  }
  let host;
  try {
    host = new URL(source).host;
  } catch {
    return res.status(403).json({ success: false, message: "درخواست نامعتبر" });
  }
  const allowed = new Set([req.get("host"), new URL(config.siteUrl).host]);
  if (!allowed.has(host)) return res.status(403).json({ success: false, message: "درخواست نامعتبر" });
  next();
}

module.exports = { sameOrigin };
