const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");

// Keeps Product.rating / reviewsNum in sync with approved reviews.
async function recompute(productId) {
  const [agg] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { $set: { rating: agg ? Math.round(agg.avg * 10) / 10 : 0, reviewsNum: agg ? agg.n : 0 } }
  );
}

module.exports = { recompute };
