# Kidle — Audit & Rewrite Plan

This document records what was found in the existing codebase (before the rewrite),
how each finding was classified, and what was decided.

Classification: **Confirmed** = verified by reading code / running it. **Likely** = strong
evidence, not reproduced. **Needs testing** = depends on production data or third parties.

## 1. Architecture (before)

- Express 5 + EJS, MongoDB via Mongoose, sessions in Mongo (`connect-mongo`).
- `index.js` (1.4k lines) contains most page routes; every route re-implements the menu
  category tree, cart count and user lookup (copy-pasted ~12 times).
- Views are 17 standalone EJS pages, each with its own `<head>`, inline CSS/JS, its own
  copy of the login/register/forgot-password modals, and its own toast implementation.
- CSS: a full **2.9 MB Tailwind v2 build** (`public/tailwind.min.css`) on every page; the
  admin loads that **plus** the Tailwind CDN JIT script **plus** a Tailwind v4 build.
  Font Awesome from a CDN (another ~100 KB CSS + fonts).
- Admin panel: one 6k-line EJS page with every feature inline.

## 2. Findings

### Security
| # | Finding | Status |
|---|---------|--------|
| S1 | `.env` committed to git (JWT secret, DB URL, session secret) | Confirmed — **rotate all values** |
| S2 | SMS provider API key hardcoded in `routes/mobile.js` / `authentication.js` URL path | Confirmed — **rotate** |
| S3 | ZarinPal merchant ID hardcoded | Confirmed (moved to env) |
| S4 | `adminSeed.js` wipes all admins and recreates `admin@example.com / admin123456`, `product123456` | Confirmed — if ever run in prod, those accounts are compromised |
| S5 | `forgotPassword` returns the OTP in the API response | Confirmed |
| S6 | OTP generated with `Math.random`, stored in plaintext, no resend cooldown (commented out) | Confirmed |
| S7 | Global CORS middleware reflects any `Origin` with `Allow-Credentials: true` → any site can make authenticated requests and read responses | Confirmed |
| S8 | Admin routes check "logged in" only; `permissions` / `hasPermission` never enforced | Confirmed |
| S9 | `/admin/upload-temp-image` stores any file type with its original extension under `/public` (e.g. `.html` → stored XSS on site origin) | Confirmed |
| S10 | `express.json({limit: '50mb'})` + `express.raw` on every route | Confirmed (DoS surface) |
| S11 | `/api/products/filtered` passes query objects straight into Mongo and builds a regex from raw input (NoSQL operator injection / ReDoS) | Confirmed |
| S12 | Discount endpoint trusts client-sent `subtotal` for minimum-order check | Confirmed |
| S13 | Session not regenerated on login (fixation); logout clears `connect.sid` while cookie is `sessionId` | Confirmed |
| S14 | Blog HTML rendered unescaped without sanitising | Confirmed (admin-only input, but matters once admins get limited roles) |
| S15 | No rate limit on admin login | Confirmed |

### Functional bugs
| # | Finding | Status |
|---|---------|--------|
| B1 | `public/robots.txt` = `Disallow: /` (no `User-agent`) and is served by `express.static` **before** the dynamic `/robots.txt` route | Confirmed |
| B2 | Stock: cart add checks `countInStock`, cart update and order check `product.stock` (undefined → every check `undefined < n` is false, so no check), order creation decrements **both** fields | Confirmed |
| B3 | Stock is decremented at order creation (before payment) and never restored on failed/cancelled/abandoned payment → inventory leakage | Confirmed |
| B4 | Cart is emptied before payment; a failed payment loses the cart | Confirmed |
| B5 | Discount `usedCount` incremented before payment | Confirmed |
| B6 | Payment verify: status 101 (already verified) treated as failure; duplicate callbacks can flip a paid order to "cancelled" | Confirmed |
| B7 | Success page is keyed on `req.session.OrderNum`, shows whatever is in session | Confirmed |
| B8 | `public/js/iran-locations.js` is **empty** → `Object.keys(iranLocations)` throws, province list never loads → checkout cannot be completed | Confirmed |
| B9 | Product page reviews call `/api/comments/*`, which does not exist | Confirmed |
| B10 | Views `500` and `error` are rendered in catch blocks but do not exist → secondary crash | Confirmed |
| B11 | Unpublished products leak on home, category, product page and filter API | Confirmed |
| B12 | Shop page loads **all** products and ignores pagination; filters are client-side | Confirmed |
| B13 | Product page says "حجم" (volume) for clothing sizes | Confirmed |
| B14 | Payment success/failure pages rendered under `/api/order/...`, with ad-hoc navbar setup | Confirmed |
| B15 | Cart add requires colour **and** size even for products that have neither | Confirmed |
| B16 | Error handler returns JSON for normal page requests | Confirmed |
| B17 | Admin product edit stores absolute image URLs (`img.src`) | Confirmed |
| B18 | Mobile menu JS duplicated per page; pages that don't include it have a dead hamburger | Likely (per page differences) |

### Kept (works, preserved)
- ZarinPal integration via `zarinpal-checkout` with currency `IRT` and `Amount = order.totalPrice` (Toman). **Unchanged.**
- Data models (Product, Category, Brand, Order, User, DiscountCode, Weblog) — only additive fields.
- URLs: `/`, `/shop`, `/category/:slug`, `/productDetails/:slug`, `/weblog/:slug`, `/cart`, `/userProfile`, content pages, `/api/order/verify` (payment callback), Torob API & sitemap.
- Visit analytics, recent-actions audit log.

## 3. Decisions

- **Stay on Express + EJS (server-rendered).** Best for SEO, no SPA hydration cost on phones,
  and the host (Passenger) needs no build pipeline at runtime. The frontend is rebuilt from
  scratch on a shared layout + component partials.
- **One CSS file**: Tailwind v4 with design tokens in `src/styles/app.css`, built to
  `public/css/app.css` (committed, ~40 KB gz-small). Old Tailwind builds and Font Awesome removed;
  icons are an inline SVG sprite.
- **Auth**: phone + OTP only. Users are created on first verified login. Passwords, signup,
  forgot/reset flows removed. Existing users keep their accounts (matched by mobile).
- **Guest cart** in session, merged into the user cart on login.
- **Stock**: `countInStock` is the only source of truth; `isOutOfStock` is derived.
  Inventory is **reserved** (atomic conditional decrement) when the order is created and the
  customer is sent to ZarinPal. Reservation lasts `RESERVATION_MINUTES` (default 30).
  Released on: failed/cancelled callback, expiry sweep (every minute), or when the same user
  starts a new checkout. A late successful payment on an expired order re-reserves if possible,
  otherwise the order is flagged for admin review (never silently lost).
- **Shipping = پس‌کرایه**: shipping cost is paid to the courier on delivery; online payable
  = items − discount. No shipping-cost math anywhere. Carrier is chosen by the admin.
- **Reviews**: fully implemented (`Review` model) with login, 1 review per user per product,
  admin moderation, verified-buyer badge, rate limit.
- **Admin**: rebuilt as a multi-page panel with role presets + granular permissions enforced
  server-side on every route.

## 4. Phases
0. Security & critical bugs · 1. Foundation/design system · 2. Shopping · 3. Purchase ·
4. Account & admin · 5. SEO/perf/a11y · 6. QA. See `docs/QA.md` for the test record.

## 5. Deployment checklist (manual, required)
1. Rotate **every** value that was in the committed `.env`, the SMS API key and (if seeded) admin passwords.
2. Set new env vars (see `.env.example`), notably `SMS_API_KEY`, `SMS_BODY_ID`, `ZARINPAL_MERCHANT_ID`.
3. Create the first admin: `node scripts/create-admin.js` (prompts for a strong password).
4. Consider purging `.env` from git history (`git filter-repo`) — rotation is still required.

## 6. UI/UX Pro Max review
The redesign was audited with the UI/UX Pro Max skill (v2.13) — `--design-system` for
"kids fashion ecommerce", plus targeted `ux`, `style`, `color`, `product` and `html-tailwind` searches.

**Adopted:** e-commerce pattern (Vibrant & Block-based / Feature-Rich Showcase) → colour-block promo
tiles on the home page; *no emoji as icons* → SVG garment icon set for categories with an admin icon
picker; *44 px touch targets / 8 px spacing* → enlarged hit areas on touch screens without enlarging
the visual controls; *focusable error summary* → linked, focused summary on checkout; *no hover-only
information* → keyboard-focusable, labelled admin chart bars; pointer cursor on option labels.

**Not adopted (deliberate):** the generated green/orange palette (the brief requires the pink identity;
the database has no pink-led palette, so the existing pink system is a stated fallback) and the
Cormorant/Montserrat pairing (no Persian glyphs — Vazirmatn kept). The style's "48 px gaps / 32 px+
type" was not applied because the brief asks for denser layouts.
