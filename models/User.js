const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const { getPersianDate } = require("../helper/getPersianDate");
const validator = require("validator");

const userSchema = new mongoose.Schema(
  {
    // Passwordless (phone + OTP) accounts: only `mobile` is required.
    fullName: {
      type: String,
      trim: true,
      maxlength: [60, "نام نمی‌تواند بیشتر از ۶۰ کاراکتر باشد"],
      default: "",
    },
    mobile: {
      type: String,
      required: [true, "شماره موبایل الزامی است"],
      unique: true,
      validate: {
        validator: function (v) {
          return /^09\d{9}$/.test(v); // Iranian mobile format
        },
        message: "شماره موبایل معتبر نیست (فرمت: 09123456789)",
      },
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => !v || validator.isEmail(v),
        message: "ایمیل معتبر نیست",
      },
    },
    // Legacy field from the old password login. Kept so old documents stay valid; never used.
    password: {
      type: String,
      select: false,
    },
    savedAddress: {
      recipientName: { type: String, trim: true, default: "" },
      recipientPhone: { type: String, trim: true, default: "" },
      province: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
      postcode: { type: String, trim: true, default: "" },
    },
    lastLoginAt: Date,
    cart: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: [true, "محصول الزامی است"],
        },
        quantity: {
          type: Number,
          default: 1,
          min: [1, "تعداد نمی‌تواند کمتر از ۱ باشد"],
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        selectedColor: { type: String, default: "" },
        selectedSize: { type: String, default: "" },
      },
    ],
    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    role: {
      type: String,
      enum: ["user", "admin", "super_admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
      select: false,
    },
    createTarikh: {
      type: String,
      default: () => getPersianDate(),
    },
    updateTarikh: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.pre("save", function (next) {
  this.updateTarikh = getPersianDate();
  next();
});

userSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});

userSchema.virtual("orderCount").get(function () {
  return this.orders?.length || 0;
});

userSchema.index({ role: 1 });
// Email is optional, so the unique index must ignore documents without one.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
