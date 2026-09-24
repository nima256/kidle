const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, trim: true, maxlength: 40, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: {
      type: String,
      trim: true,
      required: [true, "متن نظر الزامی است"],
      minlength: [5, "نظر باید حداقل ۵ کاراکتر باشد"],
      maxlength: [1000, "نظر نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد"],
    },
    // Reviews are published only after an admin approves them.
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    verifiedBuyer: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One review per customer per product (editing replaces it).
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
