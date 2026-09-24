// Idempotent startup migrations. Safe to run on every boot.
const mongoose = require("mongoose");

async function run() {
  const db = mongoose.connection.db;
  const users = db.collection("users");

  // 1) Email became optional: the old non-partial unique index would reject a second user
  //    without email. Replace it with a partial unique index.
  try {
    const idx = await users.indexes();
    const email = idx.find((i) => i.name === "email_1");
    if (email && !email.partialFilterExpression) {
      await users.dropIndex("email_1");
      console.log("[migrate] dropped legacy users.email_1 index");
    }
  } catch (e) {
    if (e.codeName !== "NamespaceNotFound") console.warn("[migrate] email index:", e.message);
  }

  // 2) Stock: countInStock is the single source of truth. Remove the stray `stock` field the old
  //    order code wrote, and re-derive isOutOfStock.
  const products = db.collection("products");
  await products.updateMany({ stock: { $exists: true } }, { $unset: { stock: "" } });
  await products.updateMany({ countInStock: { $lte: 0 } }, { $set: { isOutOfStock: true } });
  await products.updateMany({ countInStock: { $gt: 0 } }, { $set: { isOutOfStock: false } });

  // 3) Orders created before reservations existed: treat as already settled.
  await db.collection("orders").updateMany(
    { "reservation.released": { $exists: false } },
    { $set: { "reservation.released": true, "reservation.releaseReason": "legacy" } }
  );

  await Promise.all(
    ["User", "Order", "Otp", "Review", "Product", "Setting"].map((m) =>
      mongoose.model(m).createIndexes().catch((e) => console.warn(`[migrate] ${m} indexes:`, e.message))
    )
  );
}

module.exports = { run };
