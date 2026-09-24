# QA record

Environment: Node 22, **MongoDB 8.0.23** (standalone), headless Chromium 140 (Playwright),
`PAYMENT_MOCK=1` (local fake gateway — never active in production), SMS codes captured in dev.

## Automated — `npm test` (node:test, needs a MongoDB at `TEST_DB_URL`)
13 integration tests, **13/13 passing, 10/10 repeated runs** (race tests included):

| Area | What is verified |
|---|---|
| SEO | robots.txt allows crawling, lists sitemap; unpublished products never exposed |
| OTP | code never in API response, stored as HMAC, Persian digits accepted, 60 s resend cooldown, wrong-code counter, lock after 5 attempts, expiry, single use |
| Cart | size/colour required only when the product has them, stock caps, guest cart merged on login, server-side pricing, shipping = 0 online (پس‌کرایه) |
| Discount | minimum-order check uses the **server** subtotal (client value ignored) |
| Checkout | validation errors per field, stock reserved, two parallel submits with the same key → **one** order |
| Payment | success callback marks paid once; duplicate/contradicting callback is a no-op; purchased lines leave the cart |
| Failure | failed payment releases stock (once, even if repeated) and keeps the cart |
| Abandoned | expired reservation released exactly once under concurrent sweepers |
| Race | two customers buying the last unit concurrently → exactly one succeeds; stock never negative |
| Reviews | login required, moderation, HTML stripped, verified-buyer flag, rating recalculated |
| Admin | permission 403s on API, no permission escalation, no super-admin creation by non-super, login lockout |
| CSRF/CORS | cross-origin writes rejected; no reflected CORS headers |

Migration was also run against a copy shaped like the old production data (legacy unique email
index, stray `stock` field, plaintext OTPs, old orders) and converted it correctly.

## Browser (Chromium, Playwright)
- **Viewports:** 320, 375, 414, 768, 1024, 1440 px × 18 pages → **no horizontal overflow, no JS errors**.
- **Accessibility (axe-core, WCAG 2 A/AA):** 0 violations on all storefront pages (375 & 1440 px),
  open overlays (login sheet, filter sheet, search with suggestions, menu drawer, size guide,
  review form), logged-in pages (cart, checkout, account, orders, order detail, payment failed)
  and admin pages (desktop + phone).
- **Flows driven end to end:** add to cart (size-required error → select → add), quantity change,
  discount code, guest → OTP login (wrong code shown, then success) → checkout validation →
  double submit → mock gateway → success page → refresh; failed payment → retry; admin login
  (bad password), all 18 admin pages, product creation with image upload, inventory ± adjust,
  over-withdrawal blocked, limited admin creation from a role preset.
- **Performance (Fast-3G + 4× CPU emulation, phone):** home FCP/LCP ≈ 1.0 s, shop/product ≈ 0.5 s,
  CLS ≤ 0.05. CSS 14 KB gzip (was 2.9 MB raw Tailwind build + Font Awesome CDN).

## Needs testing (could not be done in this environment)
| Item | Why |
|---|---|
| Real ZarinPal request/verify (sandbox then live) | needs `ZARINPAL_MERCHANT_ID`; amount/currency logic unchanged (Toman, `IRT`) |
| Real SMS delivery / WebOTP autofill | needs `SMS_API_KEY` |
| Safari / iOS Safari, Firefox, Edge, Android Chrome on devices | only headless Chromium available here. Pay attention to: sticky bars with the iOS keyboard open, `100dvh`, bottom sheets, safe-area insets |
| Enamad trust seal | external host blocked here |

## UI/UX Pro Max redesign pass (dark theme, clay style, audit fixes)
Run against the skill's full rule set (`references/quick-reference.md`) and Pre-Delivery Checklist.
- **Both themes** (system light / dark): 18 pages × 6 widths — no overflow, no JS errors; axe WCAG 2 A/AA
  **0 violations** in light and in dark on storefront pages, overlays, logged-in pages and admin (admin stays light).
- **Landscape phone** (844×390): no overflow; fixed chrome 118px.
- **Reduced motion:** hero animation disabled; decorative motion is finite otherwise.
- **200% text size:** no horizontal overflow; only intentional clamps (2-line product names, now with full-name tooltip).
- **New behaviours verified in browser:** cart Undo restores the removed line; cart count announced in a polite
  status region; recent searches; unsaved-changes guard keeps the sheet open on cancel; password show/hide;
  checkout error summary focus + links; checkout draft kept across reloads.
- Purchase flow, admin flow and `npm test` (13/13) re-run after the change.
- Product-card images now load 400/800px variants via `srcset` (e.g. 66 KB → 14 KB per card image).
