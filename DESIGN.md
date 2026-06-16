# Design & Motion System

Foundation extracted from the current `src/index.html` + `src/main.js` work. Source of truth for tokens, easings, patterns, and reusable utilities so future pages/sections stay consistent.

Everything below is implemented today on `src/`. Treat this doc as authoritative — if code drifts, update both.

---

## 1. Tokens (CSS vars on `:root`)

| Var | Default | Mobile (≤768px) | Purpose |
|---|---|---|---|
| `--gutter` | `clamp(24px, 2.4vw, 32px)` | (same, lower bound hit) | Single spacing unit — used for `padding` on `.content` and edge offsets on every absolute-positioned layer (brand, locale, cta). |
| `--ease-snap` | `cubic-bezier(0.16, 1, 0.5, 1)` | (same) | Default easing for all reveal motion. Snappy in, long tail out. |
| `--reveal-dur` | `200ms` | (same) | Base reveal duration. Multiplied for hero (title lines use `* 3` = 600ms). |
| `--pointer-radius` | `300px` | `200px` | Radius of cursor-tracked weight effect. Helper overlay is sized `calc(var(--pointer-radius) * 2)`. |

**Conventions**
- Single `:root` block at top of the stylesheet, immediately after the `@font-face`. No nested theme contexts.
- Mobile overrides go in a single `@media (max-width: 768px)` block — same breakpoint everywhere.
- All sizing tokens use `clamp()` between the figma reference breakpoints (390 mobile, 1440 desktop), not media-query jumps.

---

## 2. Typography

### Font

**Space Grotesk variable**, hosted via jsdelivr from the official GitHub release (NOT Google Fonts — Google strips the stylistic-set features). One `@font-face`, one woff2 (~49KB), full `wght` range 300–700.

```css
@font-face {
  font-family: "Space Grotesk";
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url("https://cdn.jsdelivr.net/gh/floriankarsten/space-grotesk@2.0.0/fonts/woff2/SpaceGrotesk%5Bwght%5D.woff2")
    format("woff2-variations");
}
```

Bracket characters URL-encoded for Safari safety.

### Features

Globally enabled on `body`:
- `font-feature-settings: "salt" 1` — single-story `a` (Florian Karsten alternate).

Available (not currently on, but already shipping in the woff2 — toggle per-element if needed):

| Feature | Effect | When to use |
|---|---|---|
| `ss02` | Alternate `g` (single-story) | Pair with `salt` for full geometric look |
| `ss03` | Alternate `y` | Tail variant |
| `ss04` | Alternate `B`, `D`, `J` | More geometric uppercase |
| `ss05` | Alternate `I` with serifs | When `I` needs to read distinct from `l`/`1` |
| `zero` | Slashed zero | If/when numbers appear |
| `onum` | Old-style figures (descenders) | Body copy with numbers |
| `case` | Case-sensitive punctuation positioning | All-caps strings |

### Type scale (figma-precise)

Two text tiers. Both interpolate linearly between the figma mobile breakpoint (vp 390) and desktop breakpoint (vp 1440); clamped outside that range.

**Hero (`.title`)** — interpolates between figma mobile (`36/40`) and figma desktop (`80/80`):

```css
font-size:   clamp(36px, calc(4.19vw + 19.66px), 80px);
line-height: clamp(40px, calc(3.81vw + 25.14px), 80px);
font-weight: 400;
letter-spacing: -0.02em;
text-wrap: balance;
```

The `letter-spacing: -0.02em` (-2%) scales with the font size automatically. `text-wrap: balance` evens out line widths on supporting browsers (Chrome 114+, Safari 17.5+, Firefox 121+); falls back to greedy wrap on older.

**Small text (`.brand`, `.locale`, `.cta`)** — fixed (figma is same value on both breakpoints):

```css
font-size: 16px;
line-height: 16px;
```

### Deriving new size tokens

Given two figma breakpoint values `(font_mobile, font_desktop)` at vp `(390, 1440)`:

```
slope = (font_desktop - font_mobile) / (1440 - 390)
intercept = font_mobile - slope * 390
formula = clamp(font_mobile px, calc({slope*100}vw + {intercept}px), font_desktop px)
```

Same for line-height with its own pair of figma values. Use this derivation rather than picking a round multiplier — figma's line-height ratio differs between sizes (1.111 at 36px, 1.0 at 80px).

---

## 3. Color

The site doesn't use a static palette. Background is driven by the active spectraGL preset's palette — `darkestHex(preset.colors)` (perceived-luminance min) is written to `document.body.style.backgroundColor` before the shader mounts, then the canvas fades in over it. See `darkestHex()` in `src/main.js`.

Foreground:
- Text: `#FFFFFF` (per figma — no shadow, no scrim).
- Idle state: `.content { opacity: 0.05 }` over the shader. Background remains visible at full intensity.

If a future section needs a fixed palette, add tokens here.

---

## 4. Layout & spacing

Foreground content lives inside `<main class="content">`, which is `position: fixed; inset: 0; padding: var(--gutter)` and sits at `z-index: 10` above the shader (`#bg`) and below the visual helper (`z-index: 20`).

Children are positioned absolutely against the content box (which has the gutter as padding):
- `.title` flows from top-left (no positioning needed)
- `.brand` — `top: var(--gutter); right: var(--gutter)` (desktop) / `top: 50%; transform: translateY(-50%)` (mobile)
- `.locale` — `right/bottom: var(--gutter)` + `writing-mode: vertical-rl; transform: rotate(180deg)` for bottom-to-top vertical text
- `.cta` — `left/bottom: var(--gutter)`

`.content` has `pointer-events: none` so the shader receives mouse events; `.cta` overrides with `pointer-events: auto` so links remain clickable.

**Rule of thumb for new elements**: position from gutter on all sides, not from arbitrary px values. Mobile-only repositioning belongs in the single `@media (max-width: 768px)` block.

---

## 5. Motion

### Easings

`--ease-snap` = `cubic-bezier(0.16, 1, 0.5, 1)` — the default. Sharp acceleration in first ~30%, long deceleration. Use for entrance, layer transitions, idle/wake.

For the pointer-radial weight effect, an **independent** cubic-bezier is defined in JS for spatial falloff (not time): `(0.35, -0.35, 0.45, 1.0)`. Negative `y1` gives the dip below base in the outer band. See §7.

### Durations

| Use | Duration | Notes |
|---|---|---|
| Small-element reveal (brand/locale/cta) | 200ms | `--reveal-dur` |
| Title-line reveal | 600ms | `--reveal-dur * 3` — slower so it feels more deliberate at large size |
| Idle dim / wake | 400ms | `.content { transition: opacity 400ms ease }` |
| Shader fade-in | 800ms | After 2× rAF post-spectraGL-mount |
| Per-char weight transition | 80ms linear | `.char { transition: font-weight 80ms linear }` — smooths cursor-driven changes |

### Stagger

100ms between elements. Order: each title line → brand → locale → cta. Implemented via `style.animationDelay = ENTRY_DELAY + i * STAGGER + "ms"`.

`ENTRY_DELAY` = 1000ms before the first element starts (lets the shader settle in alone first).

### Keyframes

Two reveal keyframes, both use `animation-fill-mode: both` so the `from` state is held during the delay (no flash).

```css
@keyframes reveal {           /* title lines — rises with blur+fade */
  from { transform: translateY(80px); opacity: 0; filter: blur(12px); }
  to   { transform: translateY(0);    opacity: 1; filter: blur(0); }
}

@keyframes reveal-fade {      /* small text — fade only, no rise */
  from { opacity: 0; filter: blur(12px); }
  to   { opacity: 1; filter: blur(0); }
}
```

Why the split: title rise is dramatic on big type; on 16px small text the rise reads as jitter. Class targeting:
- `.line-inner.reveal` → uses `reveal`
- `.reveal-inner.reveal` → switches to `reveal-fade` via `animation-name` override

### Entrance pattern

1. Apply `opacity: 0` to all reveal targets in CSS so first paint is empty over the shader.
2. After `document.fonts.load('400 1em "Space Grotesk"').then(() => document.fonts.ready)`, run the splitter and add `.reveal` classes with computed `animationDelay`.
3. `animation-fill-mode: both` holds the `from` state during the 1s delay — no flash when class is added.
4. After total entrance duration (last animation end + safety buffer + 2× rAF), set `entranceDone = true` and run downstream cache rebuilds.

Safety: a 4s fallback `setTimeout` runs the same path if `fonts.load` never resolves (offline / CDN blocked). Idempotent via `let didRun = false` guard.

---

## 6. State patterns

### Idle dim

```js
const IDLE_MS = 10000;  // 10 seconds of no input
```

After `entranceDone`, any `pointermove / pointerdown / keydown / wheel / touchstart / scroll` resets a timer. When timer expires, `.content.idle` toggles `opacity: 0.05` (CSS handles the 400ms ease). Any subsequent input removes the class.

`visibilitychange` clears the timer when the tab hides — don't dim a tab that isn't visible; reset normally when it returns.

---

## 7. Interaction: cursor-tracked variable weight

The single interactive element today. Reusable for any text where per-character variable-axis tracking would be useful.

### Layers

1. **Per-character split**: `splitTitleIntoLines()` first detects line breaks via `Range.getBoundingClientRect()` on the natural-wrapping text (NOT a per-word probe — that produced phantom breaks at whitespace boundaries). Each line's text is then further split into `<span class="char">` per code point.
2. **Position cache**: after the entrance settles, walk the `.char` spans and store `{el, cx, cy}` (viewport-coord centers). Rebuilt on resize/orientationchange and on the first pointermove after entrance.
3. **rAF-throttled apply**: a single `pointermove` listener stores cursor `(x, y)` and schedules `applyWeights()` for the next frame.
4. **Per-char weight**: for each cached char, compute `t = clamp(1 - distance/RADIUS, 0, 1)`, evaluate the spatial bezier, map to weight, clamp to font axis [300, 700], write to `el.style.fontWeight`. CSS `transition: font-weight 80ms linear` smooths frame-to-frame.

### Spatial easing (the bezier)

```js
const BEZ_X1 = 0.35;
const BEZ_Y1 = -0.35;   // negative → undershoot in outer band
const BEZ_X2 = 0.45;
const BEZ_Y2 = 1.0;
```

Negative `y1` is the load-bearing parameter — it's what makes the font dip below base weight just before the rim. Tuning guide:
- More negative `y1` → deeper dip (-0.5 = visible thinning, -1.0 = nearly hits min axis).
- Smaller `x1` → dip concentrated nearer the rim; larger `x1` → dip broader, further inward.
- Keep `(x2, y2)` near `(0.5, 1.0)` for a smooth peak.

### Visual helper

Toggle with the **backtick** key. A 600×600 (or 400×400 on mobile) fixed-position `<div class="helper">` follows the cursor. The element is half-masked (`mask-image: linear-gradient(to right, #000 50%, transparent 50%)`) so only the **left half** renders the gradient visualization; the right half stays clear to inspect the actual font effect on the text underneath.

The gradient is layered:
- A bright radial (white α scaled to positive bezier value) showing the peak.
- A dark radial (black α scaled to |negative bezier value| × 3, capped 0.7) showing the dip ring.

Both gradients are sampled from the same `easeBezier` at 16 stops at script init, so the helper is always faithful to whatever curve constants are set.

---

## 8. Reusable utilities (today, all inside the IIFE in `src/index.html`)

| Utility | What it does | Reuse for |
|---|---|---|
| `makeBezier(x1, y1, x2, y2)` | CSS-style cubic-bezier evaluator (Newton + bisection). Returns `f(x) -> y`. | Any spatial or temporal easing where you want CSS bezier semantics in JS. |
| `splitTitleIntoLines()` | Detects browser wrap via Range API, returns array of line-inner spans (each containing per-char spans). Re-entrant. | Per-line entrance animations on any wrapping copy block. |
| `rebuildCharCache()` | Walks `.char` spans, caches viewport centers. | Any pointer-driven per-char effect. |
| `applyWeights()` + `scheduleApply()` | rAF-throttled writes of computed `fontWeight` per cached char. | Pattern for any 60fps DOM property update across many elements. |
| `darkestHex(colors)` (in `src/main.js`) | Returns lowest-luminance hex from a palette array. | Pick a "safe" base color from any palette. |

When pulling these out into a separate module, keep them dependency-free (no external libs) — the project has no bundler.

---

## 9. Performance & accessibility

- **No bundler, no build for dev.** All runtime CSS + JS is inline in `src/index.html`. Don't introduce dependencies that require a build step.
- **`prefers-reduced-motion: reduce`** disables the pointer-driven weight effect (all chars stay at base). Entrance animation is **not** currently guarded — add a guard if/when entrance feels too aggressive for that user group.
- **Touch**: pointer events (not mouse events) so finger gestures track the same as cursor. `passive: true` on all listeners.
- **Pointer leave / cancel** resets weights to base — no orphan thick characters when the cursor exits.
- **Idle dim suspends** while the tab is hidden, resumes naturally on return.
- **One @font-face, one woff2.** No subset splits, no FOIT — `font-display: swap` + opacity gate handles the load window.

---

## 10. Extension checklist

When adding a new section / page / component:

- [ ] Spacing uses `var(--gutter)` (or a tier derived from it), not raw px.
- [ ] Type sizes use a `clamp(min, calc(<slope>vw + <intercept>px), max)` derived from two figma breakpoints — not a single fixed size.
- [ ] Reveal uses `var(--ease-snap)` / `var(--reveal-dur)` / `.reveal` class — or, if a different timing is required, add a new CSS variable to `:root` rather than hard-coding a value at the call site.
- [ ] If revealing a multi-element block, follow the 100ms stagger rule (or document why this section needs a different stagger).
- [ ] Mobile rules live in the single `@media (max-width: 768px)` block.
- [ ] If the element should respect idle dim, place it inside `.content`. If it should remain visible (e.g. a global nav), place it outside.
- [ ] Confirm figma values via grip MCP — don't approximate.
- [ ] No background-image or solid color slabs over the shader — keep the shader fully visible.
