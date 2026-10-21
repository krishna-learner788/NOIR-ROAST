# NOIR ROAST — Design System

Version 1.0 · Stack: Vite + React 19 + Framer Motion 14 (no UI framework assumed; plain CSS variables / CSS Modules or Tailwind both work from these tokens).

Source: generated with the UI UX Pro Max workflow (`--design-system`, `--domain typography`, dials variance 4 / motion 4 / density 3), then curated against the creative brief. See "Deviations from tool output" at the end.

---

## 1. Brand Personality & Visual Direction

**One line:** A candlelit tasting room, printed as a magazine.

| Trait | Expression |
|---|---|
| Quiet confidence | Few words, large type, long pauses of empty space. Never shouting, no exclamation marks, no discount language. |
| Craft | Close-up texture (crema, bean surface, kraft, foil stamping). Details such as hairline rules and small-caps labels signal care. |
| Warmth in the dark | Dark espresso is the "room"; cream is the "paper"; caramel/copper is the "lamplight". |
| Editorial | Asymmetric but ordered layouts, numbered chapters (01 / 02), captions, pull quotes, drop caps, issue-style metadata (Origin, Altitude, Roast date). |

**Voice:** Short, sensory, precise. "Washed Ethiopian. Bergamot, honey, dark cherry." Not "Amazing coffee you'll love!"

**Rhythm of the page:** Alternate **Espresso** (dark, immersive) and **Cream** (light, reading/product) bands. Never more than two consecutive sections in the same mode.

**Signature motifs (use sparingly, one per section max):**
- Hairline rule (1px) with a small label in tracked caps.
- Section numerals in serif italic ("01", "02").
- A single copper accent (a rule, an underline, a dot) — never a fill area.
- Photo captions in small caps.

---

## 2. Color Palette

All colors are tokens. **Components never use raw hex** — only CSS variables.

### 2.1 Core palette

| Token | HEX | Role |
|---|---|---|
| `--espresso-950` | `#120B07` | Deepest background (hero, footer), photo letterbox |
| `--espresso-900` | `#1A110C` | **Primary dark background** |
| `--espresso-800` | `#2A1B13` | Raised dark surface (cards on dark, nav on scroll) |
| `--espresso-700` | `#3D2A1E` | Hairlines/borders on dark, hover surface on dark |
| `--roast-600` | `#5A4030` | Disabled/secondary strokes on dark |
| `--cream-50` | `#FAF5EC` | Lightest surface, highlights |
| `--cream-100` | `#F3E9DC` | **Primary light background and text on dark** |
| `--cream-200` | `#E7D9C6` | Raised/alt light surface, cards on cream |
| `--cream-300` | `#D3C1A8` | Borders/hairlines on cream |
| `--caramel-400` | `#C08A55` | **Accent on dark** (links, eyebrow labels, button fill) |
| `--caramel-600` | `#8A5A2B` | **Accent on cream** (text-safe) |
| `--copper-500` | `#B87333` | Restrained detail: rules, icons, focus ring, bullet dots |
| `--ink-900` | `#24150D` | **Primary text on cream** |
| `--ink-600` | `#5C4638` | Secondary text on cream |
| `--sand-300` | `#B9A793` | Secondary text on espresso |

### 2.2 Semantic tokens

| Semantic | On dark sections | On cream sections |
|---|---|---|
| `--bg` | `--espresso-900` | `--cream-100` |
| `--bg-raised` | `--espresso-800` | `--cream-200` |
| `--text` | `--cream-100` | `--ink-900` |
| `--text-muted` | `--sand-300` | `--ink-600` |
| `--accent` | `--caramel-400` | `--caramel-600` |
| `--border` | `--espresso-700` | `--cream-300` |
| `--detail` | `--copper-500` | `--copper-500` |
| `--focus` | `--caramel-400` | `--ink-900` |
| `--danger` | `#E5806B` | `#A63A24` |
| `--success` | `#8FB58A` | `#3F6B3A` |

Implement as `[data-theme="dark"]` / `[data-theme="light"]` scoped on each **section**, not the page. The site has no user-toggle dark mode; sections are themed.

### 2.3 Verified contrast (WCAG)

| Pair | Ratio (approx.) | Use |
|---|---|---|
| `cream-100` on `espresso-900` | ~15:1 | Body & headings on dark ✅ |
| `sand-300` on `espresso-900` | ~8:1 | Muted text on dark ✅ |
| `caramel-400` on `espresso-900` | ~6.2:1 | Links/labels on dark ✅ |
| `copper-500` on `espresso-900` | ~4.6:1 | Large text / icons / rules only |
| `ink-900` on `cream-100` | ~15:1 | Body on cream ✅ |
| `ink-600` on `cream-100` | ~7:1 | Muted on cream ✅ |
| `caramel-600` on `cream-100` | ~4.8:1 | Accent text on cream ✅ |
| `espresso-900` on `caramel-400` | ~6.2:1 | Primary button label ✅ |
| `caramel-400` on `cream-100` | ~2.5:1 | ❌ **Never** use for text on cream |

Re-verify with a contrast tool when implementing; adjust the token, not the usage.

### 2.4 Usage rules

1. **Proportion per viewport:** ~60% espresso/cream surfaces, ~30% type and imagery, ≤10% caramel/copper.
2. **Copper is jewelry.** Rules, small icons, dots, underline on hover. Never a large fill or body text.
3. **Caramel fills** only the single primary CTA per view.
4. **No gradients** except a functional one: a subtle dark scrim (`espresso-950` 0→70% opacity) over photography to guarantee text legibility. No decorative gradients, no gradient text, no glow.
5. **No pure black or pure white.** Darkest is `#120B07`, lightest `#FAF5EC`.
6. Color never carries meaning alone — pair errors/success with icon + text.

---

## 3. Typography

### 3.1 Font choices

| Role | Family | Weights | Why |
|---|---|---|---|
| Display / headings | **Cormorant** (Google Fonts; suggested by UI UX Pro Max "Luxury Serif" pairing) | 400, 500, 600 + italic 400/500 | High-contrast, fashion-magazine elegance; italics for emphasis |
| Body / UI / nav | **Montserrat** (same pairing) | 300, 400, 500, 600 | Clean geometric sans; stays legible small |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
```

```css
--font-display: 'Cormorant', 'Cormorant Garamond', Georgia, serif;
--font-sans: 'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif;
```

`font-display: swap` (via the URL `display=swap`). Preload no more than the two most-used files. If Cormorant renders too thin at small sizes, **never use it below 24px**; below that, use Montserrat.

### 3.2 Type scale (fluid, `clamp`)

| Style | Font / weight | Size (mobile → desktop) | Line height | Tracking | Case |
|---|---|---|---|---|---|
| Display XL (hero) | Cormorant 500 | `clamp(3.5rem, 9vw, 8rem)` | 0.95 | -0.02em | Sentence/Title |
| H1 | Cormorant 500 | `clamp(2.75rem, 6vw, 5.5rem)` | 1.0 | -0.015em | Title |
| H2 | Cormorant 500 | `clamp(2.25rem, 4.5vw, 4rem)` | 1.05 | -0.01em | Title |
| H3 | Cormorant 600 | `clamp(1.5rem, 2.5vw, 2.25rem)` | 1.15 | 0 | Title |
| H4 / product name | Cormorant 600 | `1.5rem` | 1.2 | 0 | Title |
| Pull quote | Cormorant 400 *italic* | `clamp(1.75rem, 3.5vw, 3rem)` | 1.2 | 0 | Sentence |
| Lead paragraph | Montserrat 300 | `clamp(1.125rem, 1.4vw, 1.25rem)` | 1.7 | 0 | Sentence |
| Body | Montserrat 400 (300 on dark ≥ 18px only) | `1rem` (16px min) | 1.7 | 0 | Sentence |
| Small / caption | Montserrat 400 | `0.875rem` | 1.5 | 0.01em | Sentence |
| Eyebrow / label | Montserrat 500 | `0.75rem` (12px) | 1.4 | 0.22em | UPPERCASE |
| Nav link | Montserrat 500 | `0.8125rem` (13px) | 1 | 0.16em | UPPERCASE |
| Button | Montserrat 600 | `0.8125rem` (13px) | 1 | 0.18em | UPPERCASE |
| Numerals ("01") | Cormorant 400 italic | `clamp(1.25rem, 2vw, 1.75rem)` | 1 | 0 | — |
| Price / data | Montserrat 500, `font-variant-numeric: tabular-nums` | `1rem` | 1.4 | 0.02em | — |

### 3.3 Typography rules

- Headings: Cormorant only. One italic word/phrase per heading at most, for emphasis (e.g., "The *slow* art of the dark roast").
- Use `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs.
- Measure: body 55–70 characters (`max-width: 62ch`); lead 50ch; headings up to 18ch for display.
- Never justify. Never center paragraphs longer than 3 lines.
- Uppercase only for eyebrows, nav, buttons (always tracked ≥ 0.16em).
- Body text never below 16px; labels never below 12px.
- Contrast hierarchy: heading `--text`, body `--text` at normal weight, supporting `--text-muted`.
- Optional drop cap on the first editorial paragraph: Cormorant 500, 4 lines tall, `--accent`.

---

## 4. Spacing, Layout, Grid & Breakpoints

### 4.1 Spacing scale (4px base, generous by design)

| Token | px | Use |
|---|---|---|
| `--space-1` | 4 | Icon-text nudge |
| `--space-2` | 8 | Tight inline gaps |
| `--space-3` | 12 | Label → field |
| `--space-4` | 16 | Default gap |
| `--space-6` | 24 | Card padding (mobile), gutters |
| `--space-8` | 32 | Card padding (desktop) |
| `--space-12` | 48 | Between heading and content |
| `--space-16` | 64 | Between groups |
| `--space-24` | 96 | Section padding (mobile) |
| `--space-32` | 128 | Section padding (tablet) |
| `--space-40` | 160 | Section padding (desktop) |
| `--space-56` | 224 | Hero/chapter breaks |

Section vertical padding: `clamp(96px, 14vw, 160px)`. Whitespace is a feature: if a section feels full, remove something rather than shrink spacing.

### 4.2 Breakpoints (mobile-first)

| Name | Min width | Columns | Gutter | Side margin |
|---|---|---|---|---|
| `base` | 0 (design at 375) | 4 | 16 | 20 |
| `sm` | 640 | 4 | 20 | 24 |
| `md` | 768 | 8 | 24 | 40 |
| `lg` | 1024 | 12 | 24 | 56 |
| `xl` | 1280 | 12 | 32 | 64 |
| `2xl` | 1536 | 12 | 32 | auto (container capped) |

### 4.3 Content widths

| Token | Max width | Use |
|---|---|---|
| `--w-prose` | 62ch (~640px) | Paragraphs |
| `--w-narrow` | 720px | Single-column editorial, forms |
| `--w-content` | 1200px | Standard sections |
| `--w-wide` | 1440px | Hero, full-bleed galleries with margins |
| Full-bleed | 100% | Photography bands only |

### 4.4 Layout principles

- 12-col grid on desktop; favor **asymmetric spans** (5/7, 4/8, 3/9) with generous offsets over 50/50 splits.
- Image + text pairings alternate sides down the page.
- Align to the grid or break it **on purpose** (one overlapping/offset image per page at most).
- Use `100dvh` (not `100vh`) for hero. Min tap target 44×44 px. No horizontal scroll at 320px.
- z-index scale: `0 base · 10 sticky elements · 20 nav · 40 overlays/drawers · 100 modal · 1000 toast`.

---

## 5. Buttons, Cards, Borders, Shadows, Radii

### 5.1 Corner radii (restrained — editorial, not "app")

| Token | px | Use |
|---|---|---|
| `--radius-0` | 0 | **Default**: photos, cards, buttons, inputs |
| `--radius-sm` | 2 | Tags, small chips |
| `--radius-md` | 4 | Modals, drawers |
| `--radius-full` | 999 | Only dots, avatar-like badges, cart count |

No rounded-xl cards. No pill buttons. Square-edged = print heritage.

### 5.2 Buttons

Common: height 52px (44 min on compact), padding `0 32px`, Montserrat 600 / 13px / uppercase / tracking 0.18em, radius 0, 1px border, `cursor: pointer`, transition 250ms on color/background/border only.

| Variant | Default | Hover | Active | Where |
|---|---|---|---|---|
| **Primary** | bg `--caramel-400`, text `--espresso-900`, border same | bg `--cream-100`, text `--espresso-900` | scale 0.98 | One per view (Shop, Add to bag) |
| **Secondary (outline)** | transparent, text `--text`, 1px `--text` @ 40% | border → 100%, bg `--text` @ 6% | scale 0.98 | Secondary actions |
| **Text link-button** | text `--accent`, no border, 1px copper underline offset 6px | underline animates left→right (scaleX), arrow nudges +4px | — | "Discover the origin →" |
| **On cream primary** | bg `--espresso-900`, text `--cream-100` | bg `--caramel-600` | scale 0.98 | Primary on light sections |

States: **focus-visible** 2px `--focus` outline, 3px offset (never removed). **Disabled** opacity 0.45, `cursor: not-allowed`, `aria-disabled`. **Loading**: label replaced by a 3-dot pulse, button disabled, width locked. Icons: Lucide/Phosphor line icons, 1.5px stroke, 20px, `aria-hidden` next to text.

### 5.3 Cards

- **Product card:** no container fill. Image on `--bg-raised` (4:5 ratio), name (H4), tasting notes (small caps line), price right-aligned. Hover: image scale 1.03 inside overflow-hidden frame (600ms), secondary image crossfade if available, name underline in copper.
- **Editorial / journal card:** image 3:2, eyebrow (category + read time), H3, 2-line excerpt. Hairline top border.
- **Feature card (on dark):** `--espresso-800` fill, 1px `--border`, padding 32–40px, radius 0.
- Cards separate by **space and hairlines**, not shadows.

### 5.4 Borders & dividers

- Hairline: 1px `--border`. Section dividers: hairline with a centered 6px copper dot or small-caps label.
- Image frames: none by default; optional 1px inset `--copper-500` @ 40% offset 12px behind the image for gift/feature shots (max one per page).

### 5.5 Shadows

Almost none. Depth comes from tone and photography.

| Token | Value | Use |
|---|---|---|
| `--shadow-none` | none | Default |
| `--shadow-float` | `0 24px 48px -24px rgba(18,11,7,0.55)` | Product pack-shot lifted off the surface, modals |
| `--shadow-nav` | `0 1px 0 var(--border)` | Sticky nav (hairline, not blur-shadow) |

No colored shadows, no glow, no inner shadows.

### 5.6 Forms

Visible label above (eyebrow style), underline-only inputs (1px bottom border → 2px `--accent` on focus), 52px high, helper text beneath, error text + icon below the field linked via `aria-describedby`; validate on blur. Newsletter: single input + inline arrow button.

---

## 6. Motion Principles (Framer Motion)

**Philosophy:** Slow, weighted, and quiet — like pouring, not bouncing. Motion reveals content or confirms interaction; it never decorates. Animate at most 1–2 elements per view at once.

### 6.1 Tokens

```js
// src/motion/tokens.js  (to be created at build time)
export const ease = {
  out:   [0.22, 1, 0.36, 1],    // entrances (expo-ish out)
  inOut: [0.65, 0, 0.35, 1],    // page / large transitions
  in:    [0.55, 0, 1, 0.45],    // exits
};
export const dur = { micro: 0.2, ui: 0.3, reveal: 0.8, image: 1.1, page: 0.6 };
export const stagger = 0.08;     // seconds between siblings (max 6 items staggered)
```

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Hover color/underline | 200–250ms | `out` | CSS transition, not Framer |
| Button press | 120ms | `out` | `whileTap={{scale:0.98}}` |
| Text/section reveal | 800ms | `ease.out` | opacity 0→1, y 24→0 |
| Image reveal | 1100ms | `ease.out` | clip-path inset(8% → 0) + scale 1.08→1 |
| Menu / drawer | 400ms in / 280ms out | `inOut` / `in` | Exit ≈ 65% of enter |
| Page transition | 600ms | `inOut` | Fade + 12px y shift; dark curtain optional |
| Stagger | 80ms per child | — | Cap at 6 children |

### 6.2 Scroll reveal (default behavior)

- Use `whileInView` with `viewport={{ once: true, margin: "-12% 0px" }}`. **Reveal once**; never re-hide.
- Default variant: `{ opacity: 0, y: 24 } → { opacity: 1, y: 0 }`.
- Headings: reveal line-by-line (split by line, 80ms stagger), no per-letter effects.
- Images: clip-path wipe upward + slight scale settle.
- Hairline rules: `scaleX 0→1`, origin left, 900ms.
- Animate **only `transform`, `opacity`, `clip-path`**. Never width/height/top/left.
- Reserve image space with `aspect-ratio` so reveals never shift layout (CLS < 0.1).

### 6.3 Where Framer Motion is used (and where it is not)

**Use it for:** scroll reveals (`whileInView`), hero entrance, subtle hero image parallax (`useScroll` + `useTransform`, ≤ 8% travel, hero and one feature image only), `AnimatePresence` for mobile menu/cart drawer/route transitions, `layout` for filter/tab underline indicator, sticky nav state change.

**Do NOT use it for:** simple hover color changes (CSS), constant looping animations, cursor followers, scroll-jacking, per-letter text spin-ins, floating beans/particles, bouncy springs on content, anything that blocks reading.

### 6.4 Hover effects

- Links: copper underline draws left→right (250ms).
- Product image: scale 1.03, 600ms, `ease.out`, inside overflow-hidden frame.
- Primary button: color swap only (no movement). Arrow icons slide 4px.
- No tilt, no magnetic buttons, no glow.

### 6.5 Motion rules

1. Respect `prefers-reduced-motion`: wrap the app in `<MotionConfig reducedMotion="user">`; with reduce, transforms/parallax are removed and reveals become instant or simple opacity fades ≤ 200ms. Content must be fully readable in final state.
2. Animations are interruptible and never block input.
3. Exit faster than enter (~65%).
4. Same tokens everywhere — no ad-hoc durations.
5. Pause/disable parallax and scrubbing offscreen and on touch devices where it harms performance.
6. Hero entrance on load ≤ 1.4s total before everything is readable.

---

## 7. Photography & Image Guidelines

**Look:** cinematic still life. Low-key lighting, single warm directional source (window or soft-box from side/back), deep shadows left intentionally dark, visible texture, shallow depth of field, color grade toward warm browns with slightly lifted blacks. Feels like a Kinfolk × specialty-roaster editorial.

**Subjects (priority order):**
1. Macro textures: bean surface and oils, crema, steam, grounds, pour-over bloom.
2. Product shots: matte black/kraft bags and tins on dark stone, wood or linen; angled 3/4 view, shot at human eye-level, generous negative space.
3. Process & craft: roaster drum, hands scooping beans, scale + kettle, cupping spoons (hands cropped, faces minimal).
4. Ritual & atmosphere: a cup on a window ledge, morning light, ceramic and steam.
5. Origin/landscape: used sparingly, cinematic and muted, never postcard-bright.

**Selection checklist (all must pass):**
- [ ] Real photography or photorealistic and consistent grading; no stock clichés (smiling barista thumbs-up, isolated white-background beans, neon latte art, heart-shaped foam spam).
- [ ] Palette harmony: dominant tones are espresso/cream/amber; no saturated blues/greens/pinks.
- [ ] Clear negative space for overlay text OR no overlay at all.
- [ ] Sharp focal point; one subject per frame.
- [ ] Beans look like specialty (even, medium-dark roast, matte-to-slight sheen), not oily-black burnt.
- [ ] No visible third-party logos; no fake text.

**Technical:**
- Formats: AVIF → WebP → JPEG fallback via `<picture>`; hero ≤ 250KB, others ≤ 150KB at display size.
- Provide `srcset`/`sizes` at 640 / 1024 / 1600 / 2400w; hero `fetchpriority="high"`, everything below the fold `loading="lazy" decoding="async"`.
- Always declare `width`/`height` or `aspect-ratio`.
- Aspect ratios: hero 16:9 desktop / 4:5 mobile; product 4:5; editorial 3:2; detail 1:1; ultra-wide band 21:9.
- Text over images: apply `espresso-950` scrim 40–70% on the text side; verify 4.5:1 on the composed result.
- `alt` text describes content ("Dark-roast beans spilling from a matte black bag onto slate"); decorative images use `alt=""`.
- Placeholder while loading: solid `--espresso-800` (no spinners, no blur-up gimmicks beyond a plain fade).
- Photography is the hero: never cover with more than ~30% UI.

---

## 8. Accessibility & Mobile Rules

**Accessibility (WCAG 2.2 AA minimum):**
- Contrast: text ≥ 4.5:1, large text/UI components/icons ≥ 3:1 (see §2.3 for approved pairs).
- Visible `:focus-visible` ring on every interactive element (2px, 3px offset, never `outline: none` without replacement). Sticky nav must not obscure focused elements (`scroll-padding-top` = nav height).
- Semantic HTML: one `<h1>` per page, sequential headings, `<nav>`, `<main>`, `<footer>`, `<button>` for actions and `<a>` for navigation. "Skip to main content" link first in DOM.
- Full keyboard operability; logical tab order; menus/drawers trap focus, close on Esc, restore focus.
- Icon-only buttons get `aria-label`; decorative icons `aria-hidden`.
- Color is never the only signal (errors/success include icon + text).
- Forms: visible labels, `autocomplete` attributes, inline error with `aria-describedby`, error summary focus after failed submit.
- Reduced motion honored (§6.5). No auto-playing audio; any auto-playing video is muted, loops under 10s, has a pause control, and is replaced with a still under reduced motion.
- Respect zoom to 200% and text scaling; never disable pinch-zoom.
- Target size ≥ 44×44 px on touch (24×24 absolute minimum on desktop).

**Mobile-first rules:**
- Design at 375px first; verify at 320, 375, 768, 1024, 1440; check landscape.
- Single column below `md`. Images stack above text. Section padding 96px, side margin 20px.
- Type scale already fluid; hero Display never smaller than 56px (3.5rem).
- Navigation: logo left, menu button right ("Menu" label + icon, 44px), full-screen espresso overlay with large serif links (H2 size), stacked, 60px tap rows. Desktop nav ≥ `lg`: logo center or left, links uppercase tracked, cart right.
- No hover-dependent interactions; every hover reveal has a tap/focus equivalent.
- Parallax disabled below `md`; scroll reveals shortened (y: 16, 600ms).
- Sticky mobile "Add to bag" bar on product pages only, with safe-area bottom padding.
- Use `100dvh`, `touch-action: manipulation`, and avoid horizontal scroll (long words: `overflow-wrap: anywhere`).
- Performance targets: LCP < 2.5s, CLS < 0.1, INP < 200ms; lazy-load below-fold images and split heavy sections.

---

## 9. Reusable Component Principles

1. **Tokens only.** Every color, space, radius, duration, easing comes from tokens (CSS variables + `motion/tokens`). No raw hex or magic numbers in components.
2. **Theme by section.** A `<Section theme="dark|light">` wrapper sets `data-theme`; children read semantic tokens and never know the theme.
3. **Small, composable primitives.** `Section`, `Container`, `Eyebrow`, `Heading`, `Text`, `Button`, `LinkArrow`, `Rule`, `Figure` (image + caption + reveal), `Reveal` (scroll-reveal wrapper), `ProductCard`, `JournalCard`, `Nav`, `Drawer`, `Field`.
4. **One motion wrapper.** All reveals go through a single `<Reveal variant="fade-up | image | line | rule" delay>` so timing stays consistent and reduced-motion is handled once.
5. **Content-agnostic.** Components take props/children; no hard-coded copy. Image components require `alt`, `width`/`height` or `ratio`.
6. **Every interactive component defines** default · hover · focus-visible · active · disabled · loading (and error where relevant) states.
7. **One primary action per view.** Secondary actions are visually subordinate (outline or text).
8. **Responsive by default.** Each component is specified for 375 first; no component relies on hover or fixed pixel widths.
9. **Accessible by contract.** Props enforce a11y (e.g., `IconButton` requires `label`).
10. **Restraint test:** before adding a flourish, ask "does it clarify, guide, or reward?" If not, remove it.

**Suggested file organisation (for the build phase, not created yet):**
`src/styles/tokens.css`, `src/motion/tokens.js`, `src/components/ui/*`, `src/components/sections/*`, `src/pages/*`.

---

## 10. Anti-Patterns (Do Not)

- Generic AI landing patterns: centered hero + gradient blob + three identical icon cards + "Trusted by" logo strip.
- Gradients as decoration, glassmorphism/backdrop-blur panels, neon glows, glowing borders.
- Large rounded cards, pill buttons, drop shadows on every card.
- Emoji as icons; mixed icon sets or stroke widths.
- Bright white or pure black backgrounds; saturated accent colors.
- Stock-photo clichés; photos of mugs on bright white tables.
- Bouncy springs, floating coffee beans, parallax everywhere, scroll-jacking, per-letter animation, custom cursors.
- Centered long paragraphs; more than two typefaces; body text under 16px.
- Discount-style copy and urgency banners.

---

## 11. Deviations from Tool Output

The UI UX Pro Max `--design-system` run returned: pattern *Scroll-Triggered Storytelling*, style *Liquid Glass*, light neutral palette (`#1C1917` / `#A16207`), and *Cormorant + Montserrat* typography.

- **Adopted:** Cormorant + Montserrat, the scroll-storytelling pattern (chapters with reveal-once motion), the contrast/reduced-motion/responsive checklist, the tool's cautions on parallax and scrub, and the "stagger" motion tier (re-implemented in Framer Motion with an expo-out ease instead of the GSAP `back.out` bounce).
- **Rejected:** *Liquid Glass* (translucent/blurred panels conflict with the brief's no-glassmorphism rule and its dark editorial direction); the light-neutral/gold palette (replaced with the brief's espresso, cream, caramel, copper system); GSAP (project uses Framer Motion).
- **Extended:** The tool's accent `#A16207` was replaced by `caramel-400/600` and `copper-500` to meet contrast on both dark and cream backgrounds.

---

*Status: awaiting approval. No source files have been modified or created; implementation has not started.*

---

## 12. Addendum — "The Roast" scroll-driven 3D journey (Our Craft section)

One persistent Three.js scene (procedural instanced coffee beans, no model assets) pinned behind the Craft chapters. Native scroll is the only driver; the camera flies down a bean tunnel while beans roast from green to dark.

- **Chapters:** 01 Sourcing (cool mist, green beans) → 02 Roasting (copper haze, embers) → 03 First crack at 196 °C (ember flash) → 04 Rest (fog warms to golden light, then to `--cream-100`, handing off seamlessly to the cream Origins section).
- **Palette:** scene colours come from the existing tokens (espresso, copper, caramel, cream); no new brand colours. The scrim/vignette over the canvas is functional (text contrast), per section 2.4.
- **Type:** chapter titles use H1-scale Cormorant; HUD temperature uses tabular figures. Final chapter switches to ink text on cream.
- **Motion rules:** damped scroll value (exponential, ~5.2) for the camera; undamped for text. Exit/enter windows are data in `CraftJourney.jsx`.
- **Performance budget:** desktop ~1,300 beans (~460k tris), mobile 720 beans (~100k tris), 1–2 draw calls, DPR cap 1.75 / 1.25, render loop pauses off-screen or when the tab is hidden, quality governor lowers DPR if frames exceed ~26 ms. The 3D code is a lazy chunk loaded ~1200 px before the section.
- **Fallbacks:** `prefers-reduced-motion`, data-saver, or no WebGL render the original static editorial Craft layout (`CraftStatic.jsx`) with the same copy and anchor.
