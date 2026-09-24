// One-off: create 400/800px variants for every existing upload (safe to re-run).
const fs = require("fs");
const path = require("path");
const { makeVariants } = require("../lib/images");

const root = path.join(__dirname, "../public/uploads");
let done = 0;
async function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) await walk(p);
    else if (/\.webp$/i.test(name) && !/-w\d+\.webp$/i.test(name)) {
      try { await makeVariants(p); done++; } catch (e) { console.warn("skip", p, e.message); }
    }
  }
}
walk(root).then(() => console.log(`Variants ensured for ${done} images`));
