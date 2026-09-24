const express = require("express");
const router = express.Router();
const Review = require("../../models/Review");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const User = require("../../models/User");
const limits = require("../../lib/rateLimits");
const { requireUser } = require("../../middlewares/auth");
const { asyncHandler, isObjectId, str, clampInt, HttpError } = require("../../lib/util");

const PAGE = 5;

async function publicProduct(id) {
  if (!isObjectId(id)) throw new HttpError(404, "محصول یافت نشد");
  const p = await Product.findOne({ _id: id, isPublished: true }).select("_id rating reviewsNum");
  if (!p) throw new HttpError(404, "محصول یافت نشد");
  return p;
}

router.get(
  "/:id/reviews",
  asyncHandler(async (req, res) => {
    const product = await publicProduct(req.params.id);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const filter = { product: product._id, status: "approved" };
    const [items, total, dist, mine] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).select("authorName rating text verifiedBuyer createdAt").lean(),
      Review.countDocuments(filter),
      Review.aggregate([{ $match: filter }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
      req.session.userId ? Review.findOne({ product: product._id, user: req.session.userId }).select("rating text status").lean() : null,
    ]);
    const distribution = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: dist.find((d) => d._id === r)?.n || 0 }));
    res.json({
      success: true,
      reviews: items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
      average: product.rating || 0,
      distribution,
      mine,
    });
  })
);

router.post(
  "/:id/reviews",
  requireUser,
  limits.review,
  asyncHandler(async (req, res) => {
    const product = await publicProduct(req.params.id);
    const rating = clampInt(req.body.rating, 0, 5, 0);
    const text = str(req.body.text, 1000).replace(/<[^>]*>/g, "");
    if (rating < 1) return res.status(422).json({ success: false, message: "لطفاً امتیاز (۱ تا ۵ ستاره) را انتخاب کنید", field: "rating" });
    if (text.length < 5) return res.status(422).json({ success: false, message: "نظرتان را کمی کامل‌تر بنویسید", field: "text" });

    const user = await User.findById(req.session.userId).select("fullName");
    const authorName = str(req.body.authorName, 40) || user?.fullName || "مشتری کیدل";
    const verifiedBuyer = !!(await Order.exists({ user: req.session.userId, "products.product": product._id, paymentStatus: "پرداخت شده" }));

    await Review.findOneAndUpdate(
      { product: product._id, user: req.session.userId },
      { $set: { rating, text, authorName, verifiedBuyer, status: "pending" } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    // Editing an approved review sends it back to moderation.
    await require("../../lib/reviews").recompute(product._id);
    res.json({ success: true, message: "نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود" });
  })
);

router.delete(
  "/:id/reviews/mine",
  requireUser,
  asyncHandler(async (req, res) => {
    const product = await publicProduct(req.params.id);
    await Review.deleteOne({ product: product._id, user: req.session.userId });
    await require("../../lib/reviews").recompute(product._id);
    res.json({ success: true, message: "نظر شما حذف شد" });
  })
);

module.exports = router;
