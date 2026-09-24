const Admin = require("../models/Admins");
const { hasPermission } = require("../lib/permissions");
const { wantsJson } = require("../lib/util");

const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // admin sessions end after 2h of inactivity

async function requireAdmin(req, res, next) {
  try {
    const deny = (reason) => {
      if (wantsJson(req) || req.method !== "GET") {
        return res.status(401).json({ success: false, message: "لطفاً وارد پنل مدیریت شوید" });
      }
      return res.redirect("/admin/login" + (reason ? `?error=${reason}` : ""));
    };

    if (!req.session?.adminId) return deny();
    const last = req.session.adminSeenAt || 0;
    if (Date.now() - last > IDLE_LIMIT_MS) {
      delete req.session.adminId;
      return deny("expired");
    }
    const admin = await Admin.findById(req.session.adminId);
    if (!admin || !admin.isActive) {
      delete req.session.adminId;
      return deny("account_disabled");
    }
    req.session.adminSeenAt = Date.now();
    req.admin = admin;
    res.locals.admin = admin;
    res.locals.can = (p) => hasPermission(admin, p);
    next();
  } catch (e) {
    next(e);
  }
}

// Route-level authorisation. Always enforced on the server, regardless of what the UI shows.
const requirePermission = (...perms) => (req, res, next) => {
  if (perms.some((p) => hasPermission(req.admin, p))) return next();
  if (wantsJson(req) || req.method !== "GET") {
    return res.status(403).json({ success: false, message: "شما به این بخش دسترسی ندارید" });
  }
  return res.status(403).render("admin/forbidden", { title: "عدم دسترسی" });
};

module.exports = { requireAdmin, requirePermission };
