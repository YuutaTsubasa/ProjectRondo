# UI token system — design

Establish a design-token layer for ProjectRondo's UI and re-skin the existing AVG/dialogue
components onto it, following the "BLUE HORIZON — AVG UI SYSTEM" style sheet the user supplied.

Layout is **not** in scope. Every component keeps its current position, size, and structure; only
the visual vocabulary changes. No new components are built.

## 1. The problem

The eight dialogue components under `src/presentation/dialogue/` carry **21 hard-coded hex
literals across 5 distinct values**:

| Value | Count | What it is |
|---|---|---|
| `#d8ff00` | 9 | lime accent |
| `#0b0b0d` | 4 | near-black text |
| `#0000ff` | 4 | pure blue rail |
| `#f2f3f5` | 2 | off-white text |
| `#eef0f2` | 2 | off-white board |

Nothing names these, nothing shares them, and nothing stops the sixth value from appearing. The
style sheet supplies a different palette, so every one of the 21 has to be touched regardless —
which makes this the moment to put a name in front of each.

### 1a. The components are not one visual system

Two independent inconsistencies exist today and are invisible until the values are lined up.

**Polarity.** Five components are dark, two are light:

| Component | Surface | Text |
|---|---|---|
| `DialogueOverlay` `.box` | `rgba(10,10,12,.55)` dark glass | — |
| `Line` | — | `#f2f3f5` near-white |
| `Choices` `.choice` | `rgba(10,10,12,.62)` dark glass | `#f2f3f5` |
| `Backlog` `.log` | `rgba(10,10,12,.6)` dark glass | `rgba(238,240,242,.85)` |
| `Controls` `button` | `rgba(255,255,255,.72)` **light** glass | `#0b0b0d` |
| `Nameplate` `.body` | `#eef0f2` **light** board | `#0b0b0d` |

The nameplate sits directly on top of the dialogue box, so a light board on a dark box is the
most visible instance. It reads as two UIs, because it is.

**Glass parameters.** Five glass surfaces, five different sets of numbers, none of them derived
from the others:

| Where | Backdrop alpha | Blur | Saturate |
|---|---|---|---|
| `DialogueOverlay` `.box` | .55 | 28px | 140% |
| `Choices` `.scrim` | .55 | 12px | 120% |
| `Choices` `.choice` | .62 | 26px | 140% |
| `Backlog` `.log` | .60 | 30px | 140% |
| `Controls` button | .72 | 18px | 160% |

### 1b. Two fonts are shipped and effectively unused

`public/fonts/` carries `chakra-petch-700.woff2` (9.9 KB) and `archivo-800.woff2` (14 KB). Both
are self-hosted for two components each. Neither survives the re-skin.

## 2. Goals and non-goals

**Goals**

- One named source of truth for colour, type, and surface treatment.
- Zero hard-coded hex in `src/presentation/dialogue/`, enforced by a test.
- The eight components read as one visual system.
- The dialogue box stays legible over the bright outdoor hub scene — measured, not assumed.

**Non-goals**

- Layout, sizing, spacing, or animation changes.
- New components from the style sheet (quick menu, system menu, slider, toggle, status panel).
  The style sheet shows them; this pass does not build them.
- Theming or a dark-mode switch. One theme.
- Any behavioural change. This is a re-skin: no component gains a new state, branch, or input.
- Any change outside `src/presentation/dialogue/`, `src/app/`, and `public/fonts/`.

## 3. Approach: CSS custom properties

Tokens live in `src/app/tokens.css` as custom properties on `:root`, imported once from
`main.ts`. Components consume them through `var(--...)` inside their existing scoped `<style>`
blocks.

Considered and rejected: a TypeScript token module (values would have to cross into CSS through
inline styles or a runtime write to `document.documentElement.style`, both worse than a
stylesheet); and Svelte `:global` in `App.svelte` (same effect, but hides the tokens inside a
component instead of naming a file for them).

## 4. Design

### 4a. Colour tokens

```
--c-blue:   #145BFF   replaces #0000ff
--c-lime:   #B6FF00   replaces #d8ff00
--c-pale:   #E8F1FF   replaces #eef0f2
--c-white:  #FFFFFF
--c-yellow: #FFF200
--c-ink:    #0b1020   replaces #0b0b0d and #f2f3f5
```

Roles:

- `--c-blue` — structure. Rails, ticks, small UI text on light surfaces.
- `--c-lime` — affirmative / active. **Fill only** (see 4d).
- `--c-yellow` — attention / undecided. **Currently unused** (see 4f).
- `--c-pale` — tinted off-white board; the direct replacement for `#eef0f2`.
- `--c-white` — pure white; consumed by `--surface-glass`, never used raw.
- `--c-ink` — text on light surfaces. It takes over `#f2f3f5`'s two sites as well, because
  those are text on panels that flip light (see 4e).

### 4b. Font tokens

```
--font-headline   Poppins 700/800          new, OFL, self-hosted
--font-body       Noto Sans TC             existing, unchanged
--font-ui         JetBrains Mono 400/700   new, OFL, self-hosted
```

The style sheet names Nexa Bold, which is commercial. Poppins was chosen from a four-way
comparison (Outfit / Poppins / Space Grotesk / Chakra Petch) rendered in the positions the
headline face actually occupies.

`chakra-petch-700.woff2` and `archivo-800.woff2` are deleted along with their `@font-face`
blocks. Nothing else references them.

### 4c. Surface tokens

```
--surface-glass    background of a glass panel
--surface-blur     backdrop-filter value
--surface-border   1px border colour
```

One set of values replaces the five in 1a. The two modal scrims are deliberately excluded — see
4e.

### 4d. Lime is a fill, never text

Lime against white is roughly 1.2:1 — `#d8ff00` computes to 1.15:1 and the replacement
`#B6FF00` to 1.21:1, so changing the token does not rescue it. Two places use lime as *text*
today, and both become illegible once the panels flip light:

- `DialogueOverlay` `.hint` — 12px `color: #d8ff00` -> `--c-blue`
- `Backlog` `.who` — speaker name -> `--c-blue`

Every other lime occurrence is a block, tick, rail, or cut corner and simply becomes `--c-lime`.

### 4e. The panels flip light; the scrims stay dark

Per 1a, five components are dark today. All of them become light glass with `--c-ink` text.

The two modal scrims — `Choices` `rgba(6,7,10,.55)` and `Backlog` `rgba(6,7,10,.45)` — stay
dark. A scrim's job is to push the 3D scene back behind a modal; a light scrim over a bright
outdoor scene would raise the background luminance rather than lower it, and the knight would
wash out. This is an intentional exception and is commented as one in `tokens.css`.

### 4f. `--c-yellow` is defined and unused, on purpose

The style sheet's backlog renders `REI` in blue and `???` in yellow-green, which reads as a
known/unknown speaker distinction. **It is not implementable as a re-skin.** `Speaker` is a
branded string (`src/domain/dialogue/speaker.ts:3`) and the domain has no unknown-speaker state;
an empty speaker is a parse error (`src/domain/dialogue/script/parser.ts:44`). The style sheet's
`???` is an ordinary name a script author typed, not a state the code can detect. Implementing
it would mean either comparing against the literal `'???'` inside `Backlog.svelte` — encoding a
script convention in a component, and new behaviour rather than a re-skin — or changing the
domain, which section 2 excludes.

So `--c-yellow` is defined for palette completeness and consumed by nothing. `tokens.css` says
so, and says that the first component to use it is what fixes its meaning.

### 4g. Component mapping

| Component | Changes | Flips |
|---|---|---|
| `DialogueOverlay` | `.box` glass -> surface tokens; `.mark.on` -> `--c-lime`; `.hint` -> `--c-blue` + `--font-ui`; `.overlay` font -> `--font-body`; `.mark` dim -> ink alpha | yes |
| `Line` | `#f2f3f5` -> `--c-ink` | yes |
| `Choices` | `.choice` glass -> surface tokens; text -> `--c-ink`; `.rail` -> `--c-blue`; hover rail and `.head .mark` -> `--c-lime`; `.head` text -> ink alpha; `'Archivo'` -> `--font-ui` | yes |
| `Backlog` | `.log` glass -> surface tokens; header gradient -> `--c-lime` / `--c-pale`; `.rail` -> `--c-blue`; `.title` -> `--font-headline`; `.who` -> `--c-blue`; `.text` -> ink alpha | yes |
| `Nameplate` | rail and tick -> `--c-blue`; cut corner -> `--c-lime`; board -> `--c-pale`; text -> `--c-ink`; `'Chakra Petch'` -> `--font-headline` | already light |
| `Controls` | glass -> surface tokens; text -> `--c-ink`; `.active .mark` -> `--c-lime`; `'Archivo'` -> `--font-ui` | already light |
| `Portrait` | none — no colour, only a drop-shadow | — |
| `App` | none | — |

## 5. Verification

### 5a. No hard-coded hex (automated)

A vitest case scans `src/presentation/dialogue/*.svelte` and fails on any `#rgb` / `#rrggbb`
literal. `tokens.css` is the only place a hex may appear.

**Limit, stated plainly:** this catches hard-coded hex. It does **not** catch a token used with
the wrong meaning — `--c-yellow` on a confirm button passes green. Token semantics are a review
concern, not a test concern.

### 5b. Dialogue-box contrast (measured; this is the one that can overturn the design)

Text pixels are not measured — antialiasing mixes edge greys in and the number means nothing.
Instead the box's **composited backdrop** is sampled in an empty region and its WCAG ratio
against `--c-ink` is computed.

- Sample where the scene behind is **sky** — the brightest case.
- 20px body text is not WCAG "large" (that needs 24px regular / 18.66px bold), so the threshold
  is **4.5:1**.
- Below threshold, `--surface-glass` alpha rises and the measurement repeats.

`scene.animationsEnabled = false` before sampling — otherwise the scene moves between reads.
See `docs/HANDOFF.md` section 7 for the catalogue of ways this project's pixel harness has
produced false readings.

### 5c. Fonts actually load (silent-failure guard)

A wrong `src` path falls back to `system-ui` without an error, and the result looks plausible.
`document.fonts.check('700 16px Poppins')` and the same for JetBrains Mono must both return
`true`.

### 5d. Byte budget

Chakra Petch and Archivo removed (-24 KB); Poppins 700/800 and JetBrains Mono 400/700 added.
Estimated net around +45 KB; the actual figure is recorded in section 6 after implementation.
Noto Sans TC (~2 MB) is untouched.

### 5e. Screenshots

Before/after for: dialogue box, `Choices` open, `Backlog` open. Evidence for the user, not an
automated check.

### 5f. Existing suite

All 131 existing tests stay green (21 files, measured 2026-09-04).

## 6. Measurements

Recorded during implementation.

## 7. Follow-ups deliberately left out

- The remaining style-sheet components (quick menu, system menu, slider, toggle, status panel).
- Applying tokens outside the dialogue system.
- Any layout change implied by the style sheet.
- A real unknown-speaker state in the dialogue domain, which is what `--c-yellow` would need
  before 4f's blue/yellow distinction could be built.
