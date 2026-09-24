# Design System Master File — Kidle

> **LOGIC:** When building a specific page, first check `design-system/kidle/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.
>
> Source of truth for values is `src/styles/app.css` (`@theme` + dark overrides). This file explains
> them. Generated with UI/UX Pro Max v2.13 (`"kids fashion ecommerce playful soft" --design-system`,
> variance 5, motion 3, density 6), then adapted to the brand brief — deviations are listed at the end.

**Category:** E-commerce (children's clothing) · **Audience:** parents, mostly on phones · **Direction:** RTL (Persian)
**Style:** Vibrant & Block-based (skill's e-commerce match) with Claymorphism depth (skill's children's-product style)
**Pattern:** Feature-Rich Showcase — hero value prop → categories → product rails → colour-block promos → trust → content

---

## Color (semantic tokens — never raw hex in templates)

| Role | Light | Dark | Token |
|---|---|---|---|
| Page background | `#FFFAFC` | `#151014` | `paper` |
| Card / panel | `#FFFFFF` | `#1F181D` | `surface` |
| Primary fill (CTA) | `#CC2F69` | `#CC2F69` | `brand-600` (white text, 4.9:1) |
| Primary pressed | `#A82254` / `#7D1B40` | same | `brand-press`, `brand-press-2` |
| Brand text / links | `#A82254` | `#FF9EC3` | `brand-700` |
| Brand tint (chips, soft blocks) | `#FFF3F7` / `#FFE4EE` | `#2A1520` / `#3A1A2A` | `brand-50`, `brand-100` |
| Text primary | `#1D161B` | `#FBF7F9` | `ink-950` / `ink-900` |
| Text muted (≥4.5:1) | `#6F636B` | `#A99DA4` | `ink-500` |
| Border | `#E9E2E6` | `#3A3036` | `ink-200` |
| Accent — play | `#FFC95C` | same | `butter-400` (dark text: `night-950`) |
| Success | `#17694B` on `#EEFAF5` | `#86E3BF` on `#10251D` | `mint-700` / `mint-50` |
| Danger | `#C62828` | `#FF8F8F` | `danger-600` |
| Always-dark surfaces (toasts, scrims, dark buttons) | `#2B2229` | same | `night-900` |

Functional colour is always paired with an icon or text (never colour alone).

## Typography

- **Font:** Vazirmatn FD (self-hosted WOFF2, Persian digits, `font-display: swap`) — 400 / 500 / 700 / 800.
- **Scale (rem):** 0.75 · 0.8125 · 0.875 · **1 (body, 16px)** · 1.125 · 1.25 · 1.5 · 1.875 · 2.375
- **Line height:** body 1.75, headings 1.25–1.5, `text-wrap: balance` on headings.
- **Weights:** headings 700–900, labels 500–600, body 400. Prices use tabular figures.
- Nothing below 12px.

## Spacing, radius, elevation

- Spacing: 4px grid (Tailwind scale); section rhythm 32–40px on phones, 40–48px on desktop (density 6 — denser than the skill default by brief).
- Radius: inputs/chips 12px · buttons 12–16px · cards 20px · colour blocks 28px.
- Elevation (clay): `--shadow-clay-sm` (resting cards/tiles), `--shadow-clay` (hover/raised), `--shadow-clay-btn` (primary button: inner highlight + soft pink drop). No ad-hoc shadows.
- Z-index: header 50 · sticky bars 55 · overlays/drawers 80–81 · toasts 90 · skip link 100.

## Motion

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 120ms | press scale (0.97) — transform only |
| `--dur-state` | 180ms | hover/selected colour changes |
| `--dur-enter` | 260ms, ease-out | sheets, drawers, overlays opening |
| `--dur-exit` | 170ms, ease-in | closing (≈65% of enter) |

Decorative motion is finite (hero clothesline swings twice) and disabled under `prefers-reduced-motion`.

## Components (see `src/styles/app.css` → `@layer components`)

`btn` (primary / secondary / soft / ghost / dark / danger; `sm`, default, `lg` only for the one primary CTA per screen) · `input/select/textarea` (16px text, 44px min height, error linked via `aria-describedby`) · `card` · `p-card` (product card) · `chip` · `opt` (size) · `swatch` (colour) · `badge` · `alert` · `tabs` · `overlay/sheet` (bottom sheet on phones, dialog on desktop) · `drawer` · `toast` (polite live region, optional Undo) · `action-bar` (sticky CTA above bottom nav) · `tile` (category colour block).

## Interaction & accessibility rules applied site-wide

- Touch: ≥44×44px hit area on touch screens (visual size may be smaller), ≥8px spacing, `touch-action: manipulation`.
- Focus: visible 2.5px ring; sticky header/bars never cover focused controls (`scroll-padding`).
- Forms: visible labels, inline error under field + focusable error summary on multi-error submit, `autocomplete`/`inputmode`, drafts kept for checkout, unsaved-changes guard on sheets and long editors.
- Navigation: identical header + bottom nav (5 items) on every storefront page; checkout uses a focused minimal header with a step indicator and a back link.
- Live updates: cart count changes are announced in one polite status region.
- Icons: one SVG sprite, 2px stroke Lucide-style family; no emoji.

## Deviations from the generated system (intentional)

| Generated | Used | Reason |
|---|---|---|
| Palette `#059669` green + `#EA580C` orange | Pink brand system above | Brief requires the pink identity; the skill's palette DB has no pink-led palette (stated fallback) |
| Cormorant + Montserrat | Vazirmatn FD | Recommended fonts have no Persian glyphs |
| 48px+ section gaps, 32px+ type | 32–48px sections, 30–38px display | Brief asks for less empty space / denser product grids |
| GSAP scroll reveals | none | Brief: no unnecessary animation; avoids a JS dependency |
