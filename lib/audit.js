const RecentAction = require("../models/RecentAction");

// Fire-and-forget audit log for admin actions.
function log(req, action, targetType, target, details = "") {
  const admin = req.admin;
  if (!admin) return;
  RecentAction.create({
    action,
    targetType,
    targetId: target?._id || target?.id || admin._id,
    targetName: String(target?.name || target?.title || target?.code || target?.OrderNum || target?.fullName || "-").slice(0, 120),
    adminId: admin._id,
    adminName: admin.fullName,
    details,
    ipAddress: req.ip,
  }).catch((e) => console.error("[audit]", e.message));
}

module.exports = { log };
