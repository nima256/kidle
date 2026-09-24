# Kidle — children's clothing store

Express 5 + EJS (server-rendered) + MongoDB. Tailwind v4 design system compiled to one CSS file.

## Run locally
```bash
npm install
cp .env.example .env          # fill SESSION_SECRET; leave SMS/ZarinPal empty for local dev
npm run build:css             # after editing templates or src/styles/app.css
node scripts/seed-demo.js     # optional demo catalogue (refuses to run in production)
node scripts/create-admin.js  # first super admin (prompts for a strong password)
npm run dev
```
Local development without an SMS key prints OTP codes to the server log. `PAYMENT_MOCK=1`
(non-production only) replaces ZarinPal with a local test gateway at `/dev/fake-gateway`.

## Test
`TEST_DB_URL=mongodb://127.0.0.1:27017/kidle_test npm test` — see `docs/QA.md`.

## Layout
| Path | Purpose |
|---|---|
| `app.js`, `index.js` | app composition / entry (Passenger uses `index.js`) |
| `config.js` | every environment variable |
| `lib/` | business logic: `cart`, `orders` (checkout + payment), `inventory` (reservation), `otp`, `payment` (ZarinPal), `listing` (filters), `permissions`, `migrations` |
| `routes/pages.js` | storefront pages · `routes/api/*` JSON APIs · `routes/admin/*` admin panel |
| `views/partials` | layout, header, bottom nav, overlays, product card |
| `src/styles/app.css` | design tokens + components → `public/css/app.css` |
| `public/js` | `app.js` (global), page scripts, `admin.js` |

## Business rules worth knowing
- **Stock:** `countInStock` is the only source of truth. Stock is reserved when the customer is
  sent to the gateway and released on failure, cancellation or after `RESERVATION_MINUTES`.
- **Shipping:** پس‌کرایه — never charged online. Carrier is chosen per order in the admin.
- **Admin permissions** are enforced on the server for every route; `super_admin` has all.

See `docs/REDESIGN_PLAN.md` for the audit and deployment checklist.
