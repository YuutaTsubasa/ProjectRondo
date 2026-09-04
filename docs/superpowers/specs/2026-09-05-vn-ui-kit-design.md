# VN UI kit — design

Rebuild the AVG/dialogue UI as the "VN UI Kit — Light" the user supplied
(`VN Parts - Light.dc.html` for the parts, `VN Screens - Light.dc.html` for the composition).

This is not a colour retune. The kit's geometry is the deliverable: octagonal panels with an inset
ring, a parallelogram name tag that overlaps the box, diamond markers, an arrow advance indicator,
a dashed rail. Those are new markup, not new values.

## 1. What the kit is

Fifteen part families. Three map onto components the app already has; most do not:

| Kit part | App component | This pass |
|---|---|---|
| DIALOGUE BOX | `DialogueOverlay` + `Line` | rebuild |
| NAME BOX / name tag | `Nameplate` | rebuild |
| CHOICE BOX | `Choices` | rebuild |
| HUD 72x72 buttons | `Controls` | rebuild |
| scene tint + scanlines | — | new, in `DialogueOverlay` |
| — | `Backlog` | recompose in the kit's vocabulary; the kit has no backlog part |
| TOP HUD chapter card | — | deferred, see 5 |
| BOTTOM BAR, SLIDERS, TOGGLES, SMALL BUTTONS, SLOT ITEM, WINDOW FRAME, UI ACCENTS, DECORATION LINES, SCROLL BAR, MISC, BACKGROUND SNAPSHOTS | — | deferred, see 5 |

Reference resolution is 960x540. The app renders at the window size, so positions are taken as the
kit's proportions rather than its pixels where the two disagree.

## 2. Palette

Light theme, measured from the kit by frequency:

```
--c-blue:      #1f45ff   accents, rails, the filled name tag, the inset ring
--c-ink:       #0a1440   all text and hairlines
--c-blue-soft: #7aa0ff   the secondary variant's ring and rail
--c-pale:      #eef2ff   solid pale fills
--surface-glass: rgba(255, 255, 255, 0.62)
--surface-blur:  blur(12px)
```

Three colours in the kit are deliberately **not** tokenised. `#3c3c3c` appears only in the artboard
captions beneath each part ("choice_normal.png"), never inside a 960x540 frame — it is annotation,
not UI. `#9aa4c4` and `#c3cdf0` are the disabled choice state's text and hairline, which section 5
defers for want of a disabled flag. Adding any of the three now would ship a token nothing uses,
which is the defect the previous branch had to correct twice.

**No lime and no yellow.** Both existed in the previous BLUE HORIZON sheet and in this kit's *Dark*
variant (`#ccff00`), not in Light. `--c-lime` and `--c-yellow` are removed rather than left dead.

The glass is one value throughout the kit — `rgba(255,255,255,0.62)` with `blur(12px)` — replacing
the 0.72/24px this branch's predecessor settled on.

## 3. Type

- `--font-headline` — **Chakra Petch 700**. The name tag, HUD labels, panel headers. Restored from
  this repo's own history (commit 370eb88); it was deleted one branch ago and is now needed again.
- `--font-body` — Noto Sans TC. Dialogue and choice text. Unchanged.

Poppins and JetBrains Mono are removed: nothing in the kit uses them, and a shipped font nothing
references is what `tests/app/fonts.test.ts` exists to catch.

- `--font-display` — **Archivo Black 400**. The backlog's stroked LOG title.

An earlier draft of this spec said Archivo Black was deliberately not added, on the grounds that it
appeared only in deferred work. That was wrong: it was written after reading the dialogue screen
only. The backlog screen (`backlog_full`) uses it for a stroked 120px LOG, and the backlog is in
scope, so the face is needed and is shipped.

## 4. Geometry

The parts that are structure rather than colour:

- **Dialogue box** — octagon via `clip-path: polygon(...)` cutting 18px from each corner, with a
  2px inset ring drawn as a second `clip-path` using the `evenodd` fill rule over a `--c-blue` fill.
  Five `◆` markers top-left (three `--c-blue`, two `--c-ink`), an arrow SVG bottom-right, and a
  dashed vertical rail on the right edge.
- **Name tag** — parallelogram (`polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)`), `--c-blue`
  fill with white text, Chakra Petch 700 at `letter-spacing: 5px`, positioned to overlap the box's
  top edge rather than sit above it.
- **Choice** — a 1px `--c-blue` frame with 4px padding around an inner glass block. Hover fills the
  inner block `--c-blue` with white text and cuts its bottom-right corner 10px.
- **HUD button** — 72x72 glass square, icon over a 15px Chakra Petch 700 label.
- **Caret** — the kit's blinking `▌` during the typewriter reveal. The typewriter itself already
  exists (`Line.svelte`, 24ms/char, click-to-complete); only the caret is new.

## 5. Deferred, and why

Each of these lacks state to bind to. None is a styling decision:

- **Choice `selected` and `disabled`.** `DialogueChoice` is `{ label, target }`
  (`src/domain/dialogue/dialogueChoice.ts`) — no disabled flag, no selection that outlives the
  click. `hover` is real and is built; the other two are not implementable without a domain change.
- **Chapter card** (CHAPTER 01 / MORNING). No chapter or time-of-day state exists.
- **The big outlined display title.** No title-card state.
- **Main menu and Save/Load screens.** No save system, no clock. These are subsystems, not UI work.

## 6. Non-goals

- No behavioural change. The typewriter, AUTO, SKIP, LOG and choice selection all keep their current
  semantics; only `Line`'s caret is added, and it is presentational.
- No Dark theme. The kit ships one, but a second theme means splitting tokens into semantic names
  and per-theme values, which is its own change.
- No new components beyond the five rebuilt and the scene overlay.

## 7. Verification

- The existing hex guard still applies: no hard-coded hex in `src/presentation/dialogue/`.
- `tests/app/fonts.test.ts` must be updated to the new family set and will fail on any orphan font
  file, which is how Poppins and JetBrains Mono are kept from lingering.
- `tests/app/tokens.test.ts`'s expected token list changes with the palette.
- Contrast: `--c-ink` on the 0.62 glass is a lower alpha than the 0.72 measured last branch, so the
  bound must be recomputed rather than assumed to carry over.
- **The result must be looked at.** The previous branch shipped without a single screenshot because
  the Browser pane could not be displayed; that is the one acceptance item to insist on here.

## 8. Measurements

Contrast against the kit's glass, computed over the full range of possible backdrops (the panel is
0.62 opaque white, so it spans `rgb(158,158,158)` when the scene is black to pure white when it is
white). Measured 2026-09-05.

| Foreground | darkest panel | over lit grass | brightest panel |
|---|---|---|---|
| `--c-ink` | **6.61** | 12.51 | 17.69 |
| `--c-blue` | 2.34 | 4.43 | 6.26 |
| white on a solid `--c-blue` block | — | — | **6.26** |

Two conclusions bind the implementation:

- **`--c-ink` clears 4.5:1 for any scene** (6.61 at the floor), so it is the text colour throughout.
  The margin is thinner than the previous branch's 9.50 because this glass is 0.62 rather than 0.72
  and this ink is lighter (`#0a1440` has a blue channel of 64 against `#0b1020`'s 32) — it still
  clears, but there is no room to weaken the glass further.
- **`--c-blue` fails as text again** — 2.34 at the floor, 4.43 even over lit grass, both under 4.5:1.
  This is the same trap the previous branch fell into and had to fix at final review. Blue is a fill
  only: rails, the ring, the name tag's background, the diamonds. Where the kit puts text on blue it
  is *white on a blue block* (6.26:1), which is the safe direction and is what the choice hover does.

## 9. Where the build departed from the kit, and why

Three deliberate deviations, each measured or reasoned rather than preferred:

- **The backlog panel is opaque `--c-pale`, not 0.62 glass.** The kit draws it on the same glass as
  everything else, but the kit's mock sits on a light checkerboard while the app sits on a live 3D
  scene. On glass over a dark scene the kit's own blue speaker names fall to 2.34:1; on solid
  `--c-pale` they are **5.60:1**. Going opaque is what makes the kit's colour choice work. A
  full-screen log has nothing to gain from showing the scene through it.
- **The scene carries no blue wash.** The kit tints the scene behind the UI. Two things were wrong
  with reproducing it: the kit's `mix-blend-mode: multiply` cannot work from inside `.overlay`,
  whose `z-index: 10` creates a stacking context that isolates the blend from the canvas; and once
  rendered as plain alpha over a live 3D hub it read as a filter over the whole game rather than as
  UI. The scanlines went the same way for the same reason. Nothing of the UI's is drawn over the
  scene now: the overlay is the panels and nothing else.

The kit's HUD icons **are** shipped, in the `hud` data block at the foot of `VN Screens - Light`
(`{ label, icon: svg(path) }`), and are used verbatim for AUTO, SKIP and LOG. An earlier draft of
this spec said the kit shipped no icon paths and built the buttons label-only; that was wrong, and
was written after reading only the markup, not the data the markup iterates over. The fourth icon,
MENU, has no counterpart in the app and is not used. They stroke with `currentColor`, so the icon
follows AUTO's lit state without a second rule.

One bug found by looking rather than by testing: the timeline node circles were clipped by the
scrolling list's `overflow`, because a node at a negative `left` falls outside its scroll container.
The spine moved from a border on the list to a pseudo-element on each entry, which also makes it
scroll with the content.
