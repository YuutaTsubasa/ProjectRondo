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

## 10. `--c-blue-deep`, and the mistake that produced it

Section 8 concluded that `--c-blue` is a fill only, and `tokens.css` says so. The first
implementation then used it for a typing caret and two focus rings — a glyph and two indicators,
none of them fills. A review of the PR caught all three.

`--c-blue` is 2.34:1 on the darkest panel this glass can produce, against a 4.5:1 threshold for the
caret and 3:1 for the focus rings. `--c-blue-deep: #0a1f6b` is **5.52:1** there and still reads as
blue rather than as ink, so the kit's intent — those elements are blue — survives the fix.

Two related things changed with it. `Controls`' hover moved from `--c-blue` to `--c-blue-deep` for
the same reason: hovering a label should not make it harder to read. And the focus state on those
buttons gained a real outline; it previously set `outline: none` and changed only the text colour,
which is not a focus indicator at all for anyone who cannot separate the two colours.

The lesson is narrow and worth keeping: writing the rule down in `tokens.css` did not stop me from
breaking it four lines of CSS later. The measurement caught it the first time only because I ran it;
the second time it took a reviewer.

## 11. The advance target, and why the tests could not see it

The rewrite left the dialogue box mostly unclickable and nothing caught it. The old markup made
`.box` a column flex with an inner `.hit { flex: 1 }`, so the hit target filled the box; the rebuild
dropped both, leaving `.hit` only as tall as the line. Measured in the running app, `.hit` covered
47% of the box — and the advance arrow, the affordance that tells the player to click, sat in the
dead band below it.

Keyboard advance kept working, because focus lands on the target element itself. That is why the
suite, `tsc` and `svelte-check` were all green over it: nothing here tests pointer geometry, and
nothing can, without driving a browser.

The fix is not to restore the flex trick. `.box` carries `padding: 20px 24px 28px` and the arrow is
positioned inside that bottom padding, which a flex child cannot reach. The box itself is now the
button — `role`, `tabindex` and both handlers moved onto it, and `.hit` is gone. Verified by probing
`elementFromPoint` at the arrow's centre and at all four padding bands.

Alongside it, `@types/node` moved out of the main project into `tsconfig.test.json`. It was not the
theoretical reach the previous branch parked it as: with `node` in the shared `types` list,
`ReturnType<typeof setInterval>` in `Line.svelte` resolved to Node's `Timeout` instead of the DOM's
`number`. `pnpm typecheck` now runs both projects.

## 12. `clip-path` clips the outline too

Round 3 found that the dialogue box had no visible keyboard focus indicator, and had never had one.
`clip-path` clips an element's entire rendering, outline included; `outline-offset: 4px` puts the
ring outside the border box, which is exactly the region an inset octagon clip removes. So the ring
was specified, computed, and never painted — which means round 2's change of its colour from
`--c-blue` to `--c-blue-deep` improved a ring nobody could see, and the contrast figure recorded for
it described nothing.

The fix is structural: `.box` no longer carries the clip. A `.pane` layer beneath the content holds
the glass and the octagon silhouette, leaving `.box` unclipped so its outline paints. Verified by
applying the ring inline on the running app and screenshotting it, since a synthetic Tab in this
environment does not drive `:focus-visible`.

Two smaller things from the same round. The nameplate had `pointer-events: auto` while being
entirely decorative, so the 14px strip where it deliberately overlaps the box was dead in both
directions — it neither advanced the dialogue nor reached the scene. Section 11's verification
missed it because the top padding band is precisely where the tag sits. And `tests/app/fonts.test.ts`
claimed to check "the families the tokens name" while never opening `tokens.css`; it now does, so a
`--font-*` token whose family has no `@font-face` fails instead of falling back in silence.

## 13. A focus ring has no fixed backdrop

Section 12 moved the clip so the box's outline could paint. Round 4 pointed out the figure justifying
its colour was still measured against the wrong thing: `outline-offset` puts the ring beyond `.box`'s
border box, and the glass is `.pane` at `inset: 0`, so the ring paints on the **live 3D scene** — not
on the panel `--c-blue-deep`'s 5.52:1 was measured against. Over lit grass it was fine; over water,
or where the box overlaps the portrait's own drop shadow, it fell to roughly 1.4-2.8:1.

No single colour fixes that, because the backdrop changes with the camera. Both focus indicators —
the dialogue box and the HUD tiles — now carry a white halo (`box-shadow: 0 0 0 7px`) with the ring
sitting inside it, so the ring's adjacent colour is the halo rather than the scene. The indicator
carries its own contrast, which is what WCAG 2.4.11 asks for and what a measurement against any one
backdrop cannot deliver.

Two smaller items from the round. `--c-ink-rgb` was declared, documented as backing a hairline, and
pinned by two tests, while nothing in `src/` used it — the rule it was added for belonged to the
superseded token plan. Removed. And the kit's dashed rail was written out twice, identically, in
`DialogueOverlay` and `Backlog`: only its colour was tokenised, so the dash rhythm was two hand-kept
copies that no guard here could see drift. It is now `--rail-dash`, defined once.
