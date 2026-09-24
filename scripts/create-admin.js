// Creates (or resets the password of) a super admin. Never stores or prints default credentials.
// Usage: node scripts/create-admin.js            (interactive)
//        ADMIN_EMAIL=.. ADMIN_NAME=.. ADMIN_PASSWORD=.. node scripts/create-admin.js
const readline = require("readline");
const mongoose = require("mongoose");
const config = require("../config");
const Admin = require("../models/Admins");

const ask = (rl, q, hidden) =>
  new Promise((resolve) => {
    if (!hidden) return rl.question(q, (a) => resolve(a.trim()));
    process.stdout.write(q);
    const onData = (ch) => { if (["\n", "\r", "\u0004"].includes(String(ch))) process.stdin.removeListener("data", onData); else process.stdout.write("\x1B[2K\x1B[200D" + q + "*".repeat(rl.line.length)); };
    process.stdin.on("data", onData);
    rl.question("", (a) => { process.stdout.write("\n"); resolve(a); });
  });

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (process.env.ADMIN_EMAIL || (await ask(rl, "Email: "))).toLowerCase();
  const fullName = process.env.ADMIN_NAME || (await ask(rl, "Full name: "));
  const password = process.env.ADMIN_PASSWORD || (await ask(rl, "Password (min 10 chars, letters + digits): ", true));
  rl.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
  if (!(password.length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password))) throw new Error("Password too weak");
  await mongoose.connect(config.dbUrl);
  let admin = await Admin.findOne({ email });
  if (admin) {
    admin.password = password;
    admin.role = "super_admin";
    admin.isActive = true;
    admin.failedLoginCount = 0;
    admin.lockUntil = undefined;
    console.log("Updated existing admin → super_admin, password reset.");
  } else {
    admin = new Admin({ email, fullName: fullName.length >= 3 ? fullName : "مدیر سایت", password, role: "super_admin", permissions: [] });
    console.log("Created super admin.");
  }
  await admin.save();
  process.exit(0);
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
