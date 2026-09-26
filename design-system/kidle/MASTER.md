# Design System Master File — Kidle "Atelier"

> **LOGIC:** When building a specific page, first check `design-system/kidle/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.
>
> Source of truth for values is `src/styles/app.css` (`@theme` + `@layer components`). This file explains them.
> Built with the UI/UX Pro Max skill (`.claude/skills/ui-ux-pro-max`): `--design-system` for
> "children kids fashion clothing e-commerce premium boutique warm playful elegant", plus `style`, `color`,
> `landing`, `typography` and `ux` searches. Where the generated system conflicts with the brief it is noted at the end.

**Category:** children's fashion e-commerce · **Audience:** parents, mostly on phones · **Direction:** RTL (Persian)
**Style:** Editorial fashion (skill: *Exaggerated Minimalism* / *Editorial Grid* for fashion) softened with one playful
signature shape — the **arch** — instead of cartoon graphics or clay shadows.
**Personality:** Playful + premium fashion + simple. Warm cream canvas, plum ink, pink used as an accent.

---

## Colour (semantic tokens — never raw hex in templates)

| Role | Value | Token | Notes |
|---|---|---|---|
| Canvas | `#FAF6F1` | `cream` / `paper` | warm cream, not pink-tinted |
| Soft panel / image well | `#F3ECE4` / `#E9DFD4` | `linen-100` / `linen-200` | product image background, promo panels |
| Surface | `#FFFFFF` | `surface` | forms, panels, sheets |
| Text primary | `#22151C` | `ink-950` | plum-black, 16.4:1 on cream |
| Text muted | `#6E5D66` | `ink-500` | ≥5.2:1 on cream / linen / white |
| Lines | `#E6DCD5` | `ink-200` | hairlines instead of shadows |
| **Brand accent (Kidle Rose)** | `#B02A58` | `brand-600` | CTA fill (white text 6.3:1), sale prices, eyebrow labels |
| Rose deep / tint | `#8E1F47` / `#FDF0F3` | `brand-700` / `brand-50` | links & text / soft highlight |
| Secondary accent (sage) | `#DDE7DB` / `#3F5B45` | `sage-100` / `sage-700` | collections, success, trust icons |
| Playful accent (apricot) | `#FCE7D8` / `#9A4A18` | `apricot-100` / `apricot-700` | low-stock, warnings |
| Info (sky) | `#E3ECF3` / `#2F5673` | `sky-100` / `sky-700` | order status |
| Danger | `#B3261E` on `#FDECEA` | `danger-600` / `danger-50` | |
| Rating | `#E9A23B` | `star` | |

**How pink is used:** primary conversion buttons, sale prices/badges, eyebrows, the logo arch and a few
editorial panels (sale promo). Everything else is neutral cream/plum so pink stays meaningful.
Legacy token names (`butter`, `mint`, `night`, `lilac`) are aliases onto this palette for the admin panel.

## Typography

| Level | Face | Size | Class |
|---|---|---|---|
| Display (hero) | El Messiri 700 | clamp(1.875 → 3.5rem), lh 1.18 | `.t-display` |
| Page heading | El Messiri 700 | clamp(1.625 → 2.25rem) | `.t-page` |
| Section heading | El Messiri 700 | clamp(1.375 → 1.875rem) | `.t-section` |
| Card / sheet title | El Messiri 700 | 1.1875rem | `.t-title`, `.sheet-title` |
| Eyebrow label | Vazirmatn 700, rose-700 + rule | 13px | `.eyebrow` |
| Product title (card) | Vazirmatn 500 | 14–15px, 2-line clamp | `.pcard-title` |
| Body | Vazirmatn 400 | 16px, lh 1.75 | base |
| Caption / meta | Vazirmatn | 12–13px (12px floor) | `.hint`, `.pcard-meta` |
| Price | Vazirmatn 700, tabular | 15–28px | `.price`, `.price-old`, `.off-pill` |
| Button | Vazirmatn 700 | 13–16px | `.btn` |

- **El Messiri** (OFL, self-hosted, 12 KB per weight) is loaded with a `unicode-range` that *excludes digits*:
  it draws Arabic numerals, so all numbers fall back to **Vazirmatn FD** (Persian digits). Latin also falls back.
- Letter-spacing is never applied to Persian text (it breaks joining).

## Spacing, radius, elevation

- 4px grid. Page gutter 16 / 24 / 32px (`--gutter`). Section rhythm `--section-y` = clamp(40px → 68px):
  compact and breathable — no giant empty bands.
- Product grid: 2 cols (phone) → 3 (≥640px) → 4 (≥1280px); column gap 12–20px, row gap 28–36px.
- Radius: 6px (thumbs) · 10px (inputs, product images) · 14px (panels) · 18–24px (promo blocks, sheets) · pill (buttons, chips).
- **Arch** (`.arch`): 999px top corners — category tiles, hero frame, empty-state art, account avatar, logo.
- Elevation: hairline borders by default. Shadows only for floating layers (`shadow-md` hero frame, `shadow-lg` sheets/toasts/dock).
- Z-index: sticky toolbar 30 · header 40 · dock 45 · action bar 46 · overlays 80–81 · toasts 90 · progress/skip link 100.

## Motion

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 110ms | press scale 0.97 (transform only) |
| `--dur-state` | 180ms | hover / selected colour changes |
| `--dur-enter` | 280ms ease-out | sheets, drawer, mega menu, accordion |
| `--dur-exit` | 180ms ease-in | closing (exit faster than enter) |

Micro-interactions: second-image swap on product hover, quick-add button → check mark, cart badge pop, OTP cell
pop/shake, top navigation progress bar, hero copy rise-in (once). All disabled by `prefers-reduced-motion`.

## Components (`src/styles/app.css` → `@layer components`)

Layout `wrap` `section` `bleed` · Type `t-display` `t-page` `t-section` `eyebrow` `lead` `sec-head` `see-all` ·
Buttons `btn` + `btn-primary` (rose) `btn-dark` (plum) `btn-outline` `btn-light` `btn-ghost` `btn-soft` `btn-danger`, sizes `btn-sm` / default / `btn-lg`; `icon-btn` ·
Forms `field` `label` `input` `select` `textarea` `hint` `field-error` `check` `switch` `toggle-row` `otp`/`otp-cell` ·
Surfaces `panel` (`card` alias) `panel-soft` `choice` · Badges `badge-*`, `chip`, `chip-remove`, `off-pill` ·
Commerce `pcard` (+ `pcard-media`, `pcard-add`, `pcard-sizes`, `pcard-lg`) `pgrid` `cat-card` `opt` `swatch` `qty` `price*` ·
Navigation `announce` `site-header` `nav-link` `mega` `header-search` `dock` `drawer` `seg` `tabs` `steps` `step-num` ·
Overlays `overlay` `sheet` (bottom sheet ≤640px, dialog above) `search-ov` `filter-panel` `toast` `action-bar` ·
States `state` `state-art` (`is-success` / `is-danger` / `is-warn`) `skeleton` `nav-progress` `alert-*` · Content `prose-kid` `acc` `table`.

Partials: `header`, `bottom-nav` (dock), `overlays` (menu drawer, search, OTP login, quick add, toasts), `product-card`,
`footer`, `breadcrumbs`, `checkout-items`, `account-nav`, `post-card`, `order-status`, `logo`.

## UX rules applied site-wide

- **Mobile first.** Floating dark dock (Home · Categories · Search · Cart · Account) on every storefront page < 1024px;
  sticky buy/checkout bars sit above it. Checkout hides the dock and uses a minimal header (back to cart · logo · secure).
- **Touch:** ≥44×44px hit areas on coarse pointers (invisible hit-area extension for compact controls), 16px inputs (no iOS zoom),
  `inputmode`/`autocomplete`/`enterkeyhint` on every form field.
- **Size, never volume:** the UI always says «سایز». Size options show the size *and* the age it fits; selected state is inverted (plum fill).
- **Quick add:** cards add directly when there is one option, otherwise open a bottom sheet with colour + size.
- **Auth:** phone + OTP only, asked when the customer proceeds to checkout (or writes a review). Guests can browse and fill the cart.
- **Filters:** desktop sticky sidebar (changes apply instantly; price on submit); phones/tablets a full-height sheet with a live
  "Show N products" count. Active filters appear as removable chips in the sticky toolbar.
- **Feedback:** inline field errors linked with `aria-describedby`, focusable error summary on checkout, toasts with Undo / View cart,
  one polite live region for cart count, skeletons for async content, designed empty / error / payment states.
- **Accessibility:** WCAG 2.2 AA — axe-core reports 0 violations on all storefront pages and open overlays (375 & 1440px),
  visible 2px focus ring, WAI-ARIA tabs with arrow keys, focus trapped in overlays and returned on close, back gesture closes overlays.
- **No horizontal scroll** at 320–1440px (`html { overflow-x: clip }` for off-canvas layers).

## Deviations from the generated system (intentional)

| Generated | Used | Reason |
|---|---|---|
| Style: *Liquid Glass* | Editorial fashion + arch motif | Skill rates Liquid Glass "moderate-poor performance, text-contrast risk"; the brief asks for fast, clean, premium |
| Palette: stone `#1C1917` + gold CTA | Plum ink + Kidle Rose CTA + sage/apricot | The brief requires the pink identity; the dark-neutral + single-accent *structure* of the generated palette is kept |
| Fonts: Baloo 2 / Comic Neue | El Messiri + Vazirmatn FD | Generated fonts have no Persian glyphs and read childish; El Messiri was chosen after rendering 9 Persian-capable faces |
| 400–600ms fluid animations | 110–280ms | Skill's UX rules (150–300ms micro-interactions) and the brief's "fast, subtle" |
| Dark mode (previous system) | Removed | A premium fashion storefront keeps one controlled light palette; halves the QA surface |
