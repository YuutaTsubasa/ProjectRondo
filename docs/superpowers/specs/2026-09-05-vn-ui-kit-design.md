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

## 14. The glass was painting over the text

Round 5 found the dialogue line was invisible. `.pane`, added in section 12 to carry the clip, is
`position: absolute`; `.marks` and `<Line>`'s paragraph are static in-flow siblings after it. Within
a stacking context, positioned descendants paint after non-positioned content — so the glass and its
`backdrop-filter` were drawn *over* the text, not behind it.

This is the most instructive failure in the branch. Every check was green: 143 tests, `tsc`,
`svelte-check`, and my own screenshots — I had looked at the box and read the empty panel as "no
dialogue on screen yet" rather than as the defect. It also made every contrast figure here a claim
about a composite that did not exist, since `--c-ink` was under the glass rather than on it. The
content now sits in a positioned `.content` wrapper.

Four other things from the round, each real:

- **The choices scrim had no opacity floor.** At `rgba(--c-blue-soft, 0.55)` over the live scene its
  darkest composite is `rgb(67,88,140)`, where `.head`'s ink is **2.54:1** — the camera decided
  whether the heading was legible. It is now solid `--c-blue-soft` (ink at 6.99:1), which is also
  what the kit's own menu and save/load screens show. Nothing needs to be seen through a modal that
  has taken the whole screen.
- **The `❯` glyph was `--c-blue`** — the fill-only rule broken a third time. Even over the opaque
  ground it is 4.52:1, too close to the line to rest on; `--c-blue-deep` is 10.66:1.
- **Choices' focus state was byte-identical to its hover state**, with `outline: none`. Two rows
  could read as chosen at once, and forced-colors mode would have left no indicator at all.
- **The focus recipe and the fonts check were both too narrow.** The halo's three parts interlock —
  the spread must exceed offset plus width — so they are now `--focus-ring`, `--focus-ring-offset`
  and `--focus-halo`, defined once. And `tests/app/fonts.test.ts` only read the *first* family in
  each stack, so a fallback face with no `@font-face` passed unseen; it now reads every quoted
  family, proven against a planted one in second position.

## 15. Opaque panels have to take focus with them

Round 6: with the backlog open, Tab walked out of it onto the AUTO/SKIP/LOG tiles and the dialogue
box — all painted underneath an opaque full-screen panel — and Enter on the box advanced the session
behind the panel the reader was looking at. The only visible effect was a new row appearing in the
list they were reading. There was no Escape either, so the sole exit was to find the close button
again.

This is a regression the branch created rather than inherited. Before it, the backlog was a centred
panel over a 0.45 scrim and the box behind stayed visible, which made the wandering focus an oddity
rather than a silent state change; going full-bleed and opaque is what turned it into one. Section
14's opaque choices scrim has the same shape.

The scene UI now sits in a `.scene-ui` wrapper carrying `inert` whenever a modal is open — the
wrapper is geometrically identical to `.overlay`, so it exists only to hold that attribute — and the
backlog closes on Escape. Verified: with the log open, all four scene controls report
`closest('[inert]')`, only the close button is reachable, and Escape both closes the panel and lifts
the inert.

Worth recording separately: while fixing this I broke the markup mid-edit, and `svelte-check`
reported zero errors over the broken file while Vite's compiler rejected it. `vite build` is the
check that told the truth.

## 16. `inert` does not blur, so a modal has to take focus itself

Section 15 added `inert` and a save/restore pair, on the assumption that `inert` blurs whatever it
covers. **It does not** — Chrome leaves focus exactly where it was, which after the update is inside
the inert subtree: non-interactive, and out of the accessibility tree. So the modal opened with
focus parked on a dead control, nothing announced that a full-screen panel had arrived, and the
save/restore was returning focus that had never been taken.

The fix has two halves, and the first was missing entirely:

- **Each modal takes focus on mount** — the backlog on its close button, the choices panel on its
  first option. That is what makes the panel reachable without guessing at Tab, and it matters most
  for the choices modal, which cannot be dismissed and must be answered.
- **The trigger is captured in `$effect.pre`**, not `$effect`. A normal effect runs after the DOM
  update, by which point an engine that *does* implement the spec's focus fixup has already moved
  `activeElement` to `<body>` and the saved value is worthless. The pre-effect runs before `inert`
  is applied.

Verified end to end in Chrome: focus starts on LOG, moves to the close button inside the panel on
open (`closest('[inert]')` null), and returns to LOG after Escape.

## 17. Two ways focus still escaped, and why `requestAnimationFrame` was the wrong tool

Round 9 found the section-16 fix incomplete in two places.

**The choices modal opened with nothing focused, but only on the click path.** Svelte effects run in
the microtask after the DOM update, which is still inside the click that opened the modal; Chrome
then re-resolves focus for a click target `inert` has just switched off, landing on `<body>` and
undoing the focus the effect had just set. Opening the same modal via AUTO or SKIP worked, which is
why it survived a round — the failing path is the one a player uses.

The focus call is now deferred by a **task**, not a frame. `requestAnimationFrame` would also run
after the fixup, and was the first thing tried, but a hidden page never paints and so never fires
one: a modal opening in a backgrounded tab would never take focus at all. That is not a testing
artifact — it was found because the Browser pane was hidden and the rAF callback never ran, but it
describes a real user with the tab in the background.

**The `<canvas>` is a tab stop outside the overlay.** `.scene-ui`'s `inert` covers only the
overlay's own subtree, and the canvas is a sibling of `<DialogueOverlay>` in `App.svelte`. So Tab
walked out of both modals onto an element hidden behind an opaque panel that paints no focus
indicator. All game input is bound on `window` (`presentation/babylon/input.ts`), so the canvas never
needed to be focusable; it is now `tabIndex = -1`. The attribute alone is not enough — babylon sets
`tabIndex` itself during engine construction, so it is set again after `createHubScene` resolves.

Also: the `❯` in each choice is decorative but was not `aria-hidden`, so it was part of the
accessible name of every option — the one decorative glyph in the branch that reached an interactive
control's name.

## 18. The choices modal was visible, not announced

Round 10: the takeover was a plain `<div>` — no `role="dialog"`, no `aria-modal`, no accessible name
or description. Focus moved to the first option, so the *only* thing announced on open was that
option's label. `SELECT AN ACTION` and the prompt sat outside any labelled container and were never
read at all.

Which means section 14's fix — adding the prompt because "the player is answering a question they
cannot see" — was only half a fix. It solved the problem for people looking at the screen and left it
exactly in place for everyone else. The panel is now `role="dialog" aria-modal="true"` with
`aria-labelledby` on the heading and `aria-describedby` on the prompt, and `.head` is an `<h2>` so
browse mode has something to land on. Verified: both references resolve, and the description reads
back as the question itself.

Two smaller ones. The focus effect depended only on `panel`, which changes once when the `{#if}`
mounts — but a choice whose target *also* branches keeps `choices.length` above zero, so the block
never remounts; with an unkeyed `{#each}`, a shorter next list destroys the focused button and drops
focus to `<body>` while `inert` is still on. It now depends on `choices` as well. And the 09-04 plan
and spec are marked superseded: they described tokens this branch deleted and carried a "no layout
or behavioural change" constraint that is the opposite of what it does.

## 19. Why the choices modal took focus and the backlog did not

Round 11: the deferred focus in `Choices` still did not stick on the click path — `focusin` on the
option, then `focusout` on the same live node, settling on `<body>`. `Backlog`'s identical technique
worked. The comment claimed the two were the same; they were not.

The difference was structural, not timing. `<Backlog>` is mounted inside `{#if showLog}`, so it is a
**fresh mount** and its focus effect runs on mount. `<Choices>` was mounted unconditionally and hid
itself behind an inner `{#if}`, so the component persisted and its effect ran early enough for
Chrome to blur the result. `<Choices>` is now mounted conditionally too and the inner guard is gone.

**My round-9 verification of this was worthless and it is worth saying why.** I drove it with
`element.click()`, which dispatches no pointer events and so never triggers the pointer-focus
behaviour the whole defect depends on. It reported focus on the option and I believed it. The review
used real clicks and got the opposite result. Re-verified here with the Browser pane's own pointer
clicks: focus lands on `BUTTON.choice`, `closest('[inert]')` is null, and the dialog's description
reads back as the question.

Also: the backlog inerts everything behind it, takes focus and closes on Escape — it is a modal by
every behaviour the branch gives it — but was exposed as a plain `<section>` landmark. It is now
`role="dialog" aria-modal="true"` with a labelled heading, matching the fix `Choices` got in the
previous round. It had to become a `<div>` to carry the role; Svelte rejects `role="dialog"` on a
`<section>`.

## 20. The dialogue line had no path to assistive technology

Round 12: `.box` was `role="button"` with an `aria-label`, and `<Line>` rendered inside it. `button`
is one of the roles ARIA defines as having presentational children, so the paragraph was pruned from
the accessibility tree; and the `aria-label` replaced any name that could have come from contents.
Tabbing to the box announced "advance dialogue, button" and nothing else. There was no live region
either, so advancing announced nothing.

The whole branch had carefully `aria-hidden` its decoration — `.pane`, `.ring`, `.marks`,
`.advance`, `.rail` — and given both modals `role="dialog"` with names and descriptions, while the
primary content on screen reached assistive technology not at all.

The affordance and the content are now siblings. `.box` is a plain container; a `<button class="hit">`
stretched to `inset: 0`, last in the DOM, takes the clicks and carries the focus ring — so every
pixel including the padding and the arrow is still an advance target, which is what section 11
established. `.content` is an `aria-live="polite"` region.

`Line` needed a second change for that region to be usable: the typewriter mutates its text every
24ms, which inside a live region announces a character at a time. The visible paragraph is now
`aria-hidden`, and the complete line goes to assistive technology in one piece through a
visually-hidden sibling. A typewriter is a visual effect, not information.

## 21. A test for the part that kept breaking

Round 13's most useful finding had no line anchor: the modal focus machinery — `inert` on the scene
UI, the `$effect.pre` capture and restore, each modal focusing itself — had **no executable test**,
and it is the part of this branch that was wrong in five separate rounds. Every one of those was
caught by a person driving the browser. Under the project's own first lens ("behaviour is pinned by
a test written to specify it") the highest-churn behaviour in the diff was the one behaviour unpinned.

`tests/presentation/dialogue/modalFocus.test.ts` now mounts the real overlay and covers: inert
appearing and lifting with the modal, the backlog taking focus on open and returning it on close,
Escape, the choices modal focusing its first option, the dialogue line reaching assistive technology
while the typewriter does not, the advance target being a real button, and both modals carrying
dialog semantics. Proven to fail on the defects it targets — removing the `inert` binding fails two
cases, breaking the backlog's focus call fails a third.

Two environment facts it had to be built around. `vite.config.ts` pins `environment: 'node'` because
every other test here is a pure function or a file-content guard and jsdom costs seconds of setup;
this file opts itself in with `// @vitest-environment jsdom`. And svelte resolves to its **server**
build under vitest, where `mount()` throws — so `resolve.conditions` gains `browser`, scoped to test
mode so dev and build are untouched. jsdom also does not reflect the `inert` property to an
attribute, so the assertions read `.inert`, which is what svelte sets and what browsers act on.

Two smaller fixes from the same round. The choices panel had no scroll container: taller than the
viewport it overflowed past both edges with nothing reachable, in a modal that is deliberately
undismissable — the scrim scrolls now, and the panel centres with `margin: auto` rather than
`align-items`, which clips the start edge once content overflows. And `.hit`'s `onkeydown` was left
over from when it was a `div[role=button]`; on a real `<button>` it duplicated the UA's own handling
and moved Space activation from `keyup` to `keydown`, so holding Space repeat-advanced the dialogue.

## 22. The canvas was tabbable for the whole scene load

Round 14: `canvas.tabIndex = -1` ran in `createHubScene`'s `.then()`, but the thing it undoes happens
at the *start* of that call — `new Scene(engine)` reaches `attachControl` in its constructor and sets
`canvas.tabIndex = engine.canvasTabIndex`, default **1**, synchronously before the first `await`. So
from then until Havok's WASM, the knight and the trees had all loaded, the canvas carried a
*positive* tabindex, which sorts ahead of every `tabindex=0` element on the page. The overlay mounts
synchronously, so the intro dialogue and its LOG button are live for that whole window. It is reset
in both places now.

### The tests I added last round did not test anything

Round 14 also found that `modalFocus.test.ts`'s header claimed coverage of AUTO pausing that no case
exercised. Writing those two cases produced the more useful lesson: **my first version of both passed
with the behaviour deliberately broken.**

- The AUTO case advanced all fake timers in one call and flushed once at the end, so svelte never
  re-ran its effects *between* timer callbacks and the AUTO timeout was only ever scheduled after
  time had already passed. It also used the default script, which branches after one advance — so
  `choices.length === 0` and `!modalOpen` agreed and the assertion could not tell them apart. It now
  steps in 25ms slices with a flush between, on a three-line linear script.
- The choice-to-choice case went from two options to two. The `{#each}` is unkeyed, so the surviving
  button is reused and focus appears to survive on its own. It now goes from three options to one
  with focus on a button the transition destroys — the only shape where the effect's dependency on
  `choices` is observable.

Both are now proven to fail when the code they pin is reverted. This is the same defect the previous
round diagnosed — behaviour nobody had actually exercised — reproduced one commit after being told
about it, which is why it is written down rather than quietly fixed.

Also from this round: `afterEach` cleared `innerHTML` without unmounting, so every test left a live
overlay behind with its effects, its typewriter interval and its `svelte:window` Escape listener
still attached — isolation was coming from test ordering. It calls `unmount` now.
