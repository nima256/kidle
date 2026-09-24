const mongoose = require("mongoose");
const { getPersianDate } = require("../helper/getPersianDate");

const recentActionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    targetType: {
      type: String,
      required: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    targetName: {
      type: String,
      required: true
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    adminName: {
      type: String,
      required: true
    },
    details: {
      type: String,
      default: ''
    },
    ipAddress: {
      type: String
    },
    createdAt: {
      type: String,
      default: () => getPersianDate()
    },
    createdAtTimestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// ایندکس برای جستجوی سریع
recentActionSchema.index({ createdAtTimestamp: -1 });
recentActionSchema.index({ adminId: 1 });
recentActionSchema.index({ action: 1 });

const RecentAction = mongoose.model("RecentAction", recentActionSchema);
module.exports = RecentAction;