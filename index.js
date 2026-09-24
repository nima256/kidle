// Entry point (also used by Passenger).
const mongoose = require("mongoose");
const config = require("./config");
const { createApp } = require("./app");
const migrations = require("./lib/migrations");
const orders = require("./lib/orders");

// Register every model before migrations touch them.
["User", "Order", "Otp", "Review", "Product", "Setting", "Category", "Brand", "Weblog", "DiscountCode", "Admins"].forEach((m) =>
  require(`./models/${m}`)
);

async function start() {
  try {
    await mongoose.connect(config.dbUrl, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection failed, retrying in 5s:", err.message);
    return setTimeout(start, 5000);
  }

  await migrations.run().catch((e) => console.error("[migrate] failed:", e));

  // Release stock held by abandoned / expired checkouts.
  setInterval(() => {
    orders.expireReservations().catch((e) => console.error("[reservations]", e.message));
  }, 60_000).unref();

  const app = createApp();
  app.listen(config.port, () => console.log(`Kidle running on http://localhost:${config.port}`));
}

start();
