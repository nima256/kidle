const mongoose = require("mongoose");

// One document per mobile number. The code itself is never stored — only an HMAC of it.
const otpSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, unique: true },
    codeHash: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    // Rolling one-hour window used to cap how many codes a number can receive.
    windowStartedAt: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 0 },
    ipAddress: { type: String, default: "" },
    // Document is removed an hour after the last send (keeps the hourly counter meaningful).
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
