// Stock reservation with atomic conditional updates.
// Works on a standalone MongoDB (no multi-document transactions needed): each decrement only
// succeeds if enough stock remains, and partial reservations are rolled back.
const Product = require("../models/Product");
const Order = require("../models/Order");

function aggregate(items) {
  const map = new Map();
  for (const it of items) {
    const id = String(it.productId || it.product);
    map.set(id, (map.get(id) || 0) + it.quantity);
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function syncOutOfStock(productId) {
  await Product.updateOne({ _id: productId, countInStock: { $lte: 0 } }, { $set: { isOutOfStock: true } });
  await Product.updateOne({ _id: productId, countInStock: { $gt: 0 } }, { $set: { isOutOfStock: false } });
}

/** Reserves all items or none. Returns { ok } or { ok:false, productId, available }. */
async function reserve(items) {
  const done = [];
  for (const { productId, quantity } of aggregate(items)) {
    const res = await Product.updateOne(
      { _id: productId, countInStock: { $gte: quantity } },
      { $inc: { countInStock: -quantity } }
    );
    if (res.modifiedCount !== 1) {
      for (const d of done) {
        await Product.updateOne({ _id: d.productId }, { $inc: { countInStock: d.quantity } });
        await syncOutOfStock(d.productId);
      }
      const p = await Product.findById(productId).select("countInStock name");
      return { ok: false, productId, name: p?.name, available: Math.max(0, p?.countInStock || 0) };
    }
    done.push({ productId, quantity });
    await syncOutOfStock(productId);
  }
  return { ok: true };
}

async function restock(items) {
  for (const { productId, quantity } of aggregate(items)) {
    await Product.updateOne({ _id: productId }, { $inc: { countInStock: quantity } });
    await syncOutOfStock(productId);
  }
}

/**
 * Returns an order's reserved stock exactly once (the flag flip is atomic, so concurrent
 * callbacks / the expiry sweeper cannot double-release).
 */
async function releaseOrder(orderId, reason) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, "reservation.released": false, paymentStatus: { $ne: "پرداخت شده" } },
    { $set: { "reservation.released": true, "reservation.releasedAt": new Date(), "reservation.releaseReason": reason } },
    { new: true }
  );
  if (!order) return false;
  await restock(order.products.map((p) => ({ productId: p.product, quantity: p.quantity })));
  return true;
}

module.exports = { reserve, restock, releaseOrder, aggregate };
