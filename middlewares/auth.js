const { wantsJson } = require("../lib/util");

// Customer must be signed in. Pages redirect home and open the login sheet; APIs get 401.
function requireUser(req, res, next) {
  if (req.session.userId) return next();
  if (wantsJson(req)) {
    return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "برای ادامه وارد حساب کاربری شوید" });
  }
  const nextUrl = encodeURIComponent(req.originalUrl);
  return res.redirect(`/?login=1&next=${nextUrl}`);
}

module.exports = { requireUser };
