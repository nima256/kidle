// Responsive image variants for uploads: foo.webp → foo-w400.webp, foo-w800.webp.
// Templates use srcset()/thumb(); if a variant doesn't exist (older image), the original is used.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "../public");
const WIDTHS = [400, 800];
const exists = new Map(); // url -> { ok, at }

const variantUrl = (url, w) => url.replace(/\.webp$/i, `-w${w}.webp`);
const isUpload = (url) => typeof url === "string" && url.startsWith("/uploads/") && /\.webp$/i.test(url) && !/-w\d+\.webp$/i.test(url);

function has(url) {
  const hit = exists.get(url);
  if (hit && (hit.ok || Date.now() - hit.at < 5 * 60_000)) return hit.ok;
  const file = path.join(ROOT, url);
  const ok = file.startsWith(ROOT) && fs.existsSync(file);
  exists.set(url, { ok, at: Date.now() });
  return ok;
}

function srcset(url) {
  if (!isUpload(url)) return "";
  const parts = WIDTHS.filter((w) => has(variantUrl(url, w))).map((w) => `${variantUrl(url, w)} ${w}w`);
  return parts.length ? [...parts, `${url} 1400w`].join(", ") : "";
}

function thumb(url, w = 400) {
  return isUpload(url) && has(variantUrl(url, w)) ? variantUrl(url, w) : url;
}

async function makeVariants(absFile) {
  for (const w of WIDTHS) {
    const out = absFile.replace(/\.webp$/i, `-w${w}.webp`);
    if (fs.existsSync(out)) continue;
    await sharp(absFile).resize(w, Math.round(w * 1.25), { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  }
}

function variantFiles(absFile) {
  return WIDTHS.map((w) => absFile.replace(/\.webp$/i, `-w${w}.webp`));
}

module.exports = { srcset, thumb, makeVariants, variantFiles, isUpload };
