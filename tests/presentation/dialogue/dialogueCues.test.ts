// @vitest-environment jsdom
//
// What the overlay SOUNDS, as opposed to what it focuses (modalFocus.test.ts, with which this shares
// overlayHarness.ts -- the VP9 and matchMedia stubs, the mount and the unmount). Every number here
// was verified by hand in a browser when it was written and by nothing else: the throttle's
// arithmetic, the character the first tick lands on, and which of the three events around a click
// sound a move are all invisible to a type checker and silent when they drift. The PR that added
// them had to describe the reveal as ticking on chars 1, 4 and 7; it ticks on 3, 6 and 9, and that
// is the kind of drift this file exists to catch.
//
// The overlay is mounted for real and `playCue` is a spy in the prop the app passes: nothing here
// mocks the components under test, so a cue reaching the spy is a cue that would reach `soundBank`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { renderOverlay, q, resetOverlay } from './overlayHarness';

/** The reveal's own interval: Line.svelte's default for its `charMs` prop. */
const CHAR_MS = 24;
/**
 * Line.svelte's own `TYPE_MIN_MS`: the shortest gap between two typing ticks, whichever of the two
 * generators asks for one. DialogueOverlay's `typeCue` is where that bound is applied, so it spans
 * the reveal and the press on the box rather than holding inside one `<Line>`.
 */
const TYPE_MIN_MS = 70;
/** Choices.svelte's own `MOVE_MIN_MS`: the shortest gap between two move cues. */
const MOVE_MIN_MS = 100;

// Nine characters, so the throttle has room to land three ticks inside one line.
const NINE = '一二三四五六七八九';
const SCRIPT = [':: greet', `里昂: ${NINE}`, '-> ask', ':: ask', '里昂: 走哪？', '* 左 -> l', '* 右 -> r', ':: l', '旁白: 左。', ':: r', '旁白: 右。', ''].join('\n');

// Both options of `ask` lead to `again`, which is itself a choice node. That is the shape the panel
// is NOT remounted in -- `session.choices.length` never reaches zero, so DialogueOverlay's {#if}
// holds, and <Choices> re-focuses itself in place instead. `intro.dlg` has no such node today.
const CHAINED = [':: greet', `里昂: ${NINE}`, '-> ask', ':: ask', '里昂: 走哪？', '* 左 -> again', '* 右 -> again', ':: again', '里昂: 真的？', '* 是 -> l', '* 否 -> r', ':: l', '旁白: 左。', ':: r', '旁白: 右。', ''].join('\n');

// One line and nothing after it, so a press on the finished line ends the dialogue instead of
// starting another one.
const ONE_LINE = [':: greet', `里昂: ${NINE}`, ''].join('\n');

/** Timers under vitest's control, flushed after each slice so svelte's effects see each step. */
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += CHAR_MS) { vi.advanceTimersByTime(CHAR_MS); flushSync(); }
  flushSync();
};

/** The characters the typewriter has drawn, without the blinking caret it appends while revealing. */
const revealed = () => q('.line')!.textContent!.replace('▌', '');
const cues = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(([cue]) => cue as string);
const countOf = (spy: ReturnType<typeof vi.fn>, cue: string) => cues(spy).filter((c) => c === cue).length;

// The fake timers are this file's own -- every test here installs them -- so they are put back here
// rather than in the shared teardown.
afterEach(() => {
  resetOverlay();
  vi.useRealTimers();
});

describe('the typing cue', () => {
  it('sounds once per throttle window, on the third character and every third after it', () => {
    vi.useFakeTimers();
    const { playCue } = renderOverlay(SCRIPT);
    tick(0);

    // Walk the line a character at a time and record which characters were on screen when a tick
    // sounded. TYPE_MIN_MS is 70 and the reveal draws a character every 24, so the throttle pays out
    // on the third of each three -- 72ms, the first multiple of 24 at or past 70.
    const soundedOn: number[] = [];
    let heard = 0;
    for (let char = 1; char <= NINE.length; char++) {
      tick(CHAR_MS);
      if (countOf(playCue, 'ui.type') > heard) {
        heard = countOf(playCue, 'ui.type');
        soundedOn.push(char);
        // The tick belongs to the character it sounds with, not to one either side of it.
        expect(revealed()).toBe(NINE.slice(0, char));
      }
    }

    expect(soundedOn).toEqual([3, 6, 9]);
    // And the line is finished, so nothing is left to sound afterwards.
    tick(500);
    expect(countOf(playCue, 'ui.type')).toBe(3);
  });

  it('makes no sound for the characters a reveal-all draws', () => {
    vi.useFakeTimers();
    const { playCue } = renderOverlay(SCRIPT);
    tick(0);
    tick(CHAR_MS * 3);
    expect(countOf(playCue, 'ui.type')).toBe(1);

    // Stand the press one whole window past that tick so the gate below grants it: what this pins is
    // what the reveal-all DRAWS, and the press landing inside the window is the test after it.
    // `advanceTimersByTime` rather than `tick()`, because `tick()` walks in whole CHAR_MS slices and
    // 70 is not a multiple of 24 -- chars 4 and 5 are drawn on the way there and neither reaches the
    // reveal's own accumulator, so the last tick is still the one on char 3.
    vi.advanceTimersByTime(TYPE_MIN_MS);
    flushSync();
    expect(revealed()).toBe(NINE.slice(0, 5));
    expect(countOf(playCue, 'ui.type')).toBe(1);

    // The press sounds its own tick; the four characters it then draws at once must not sound four
    // more, which is the burst the throttle exists to prevent.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(revealed()).toBe(NINE);
    expect(countOf(playCue, 'ui.type')).toBe(2);
  });

  it('holds the press back behind a reveal tick it would otherwise land on top of', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    tick(CHAR_MS * 3);
    expect(countOf(playCue, 'ui.type')).toBe(1);

    // The two ticks are generated in different components -- the reveal in <Line>, the press here --
    // and play the same 60 ms sample, so nothing inside either one can keep them off each other. A
    // press that reveals-all is the commonest press in a typewriter UI and lands wherever it lands
    // inside the reveal's 72 ms cycle; this one lands directly on the tick just paid out. It makes
    // no second sound: the player has already heard a tick for it, the reveal it interrupts stops
    // with it, and what a second one would add is the smeared double-hit rather than an answer.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(revealed()).toBe(NINE);
    expect(countOf(playCue, 'ui.type')).toBe(1);

    // One tick short of the window and it is still held -- which, with the press a whole window out
    // in the test above, stands on both sides of TYPE_MIN_MS itself rather than merely inside some
    // window. This press advances the line rather than revealing one, so the hold is not a property
    // of the reveal-all either.
    vi.advanceTimersByTime(TYPE_MIN_MS - 1);
    flushSync();
    const line = session.line;
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(session.line).not.toBe(line);
    expect(countOf(playCue, 'ui.type')).toBe(1);
  });

  it('sounds the press whether it finishes the line or starts the next one', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    tick(CHAR_MS * NINE.length);
    // The ninth character sounded as it was drawn, and the press shares that tick's window, so stand
    // clear of it: this is about a press ADVANCING sounding like a press revealing, not about the
    // window they share, which the test above pins from both sides.
    vi.advanceTimersByTime(TYPE_MIN_MS);
    flushSync();
    const finished = countOf(playCue, 'ui.type');
    const line = session.line;

    // The line is complete, so this press advances rather than revealing -- the same event as far as
    // the player is concerned, and it sounds the same.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(session.line).not.toBe(line);
    expect(countOf(playCue, 'ui.type')).toBe(finished + 1);
  });

  it('sounds the press that ends the dialogue, though that one puts no text on screen', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(ONE_LINE);
    tick(0);
    tick(CHAR_MS * NINE.length);
    expect(revealed()).toBe(NINE);
    // Clear of the last character's tick, for the reason the test above gives.
    vi.advanceTimersByTime(TYPE_MIN_MS);
    flushSync();
    const finished = countOf(playCue, 'ui.type');

    // The third thing a press can do, and the one the box's comment used to leave out: the line is
    // complete and it is the last one, so the press falls through reveal() and advance() into
    // finish(), where App.svelte's {#if} takes the overlay away. It sounds like the other two --
    // the tick answers the press, not what the press turned out to do.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(session.isFinished).toBe(true);
    expect(countOf(playCue, 'ui.type')).toBe(finished + 1);
  });

  it('stays silent while the choices cover the box', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    tick(CHAR_MS * NINE.length);
    playCue.mockClear();

    // The choice node carries the prompt AND the options, so <Line> remounts with the prompt at the
    // moment <Choices> opens. The reveal runs on behind the panel; it must not be heard, since the
    // panel shows that same text in full and the player cannot skip it.
    session.advance();
    tick(0);
    expect(session.choices.length).toBe(2);
    tick(1000);
    expect(revealed()).toBe('走哪？');
    expect(countOf(playCue, 'ui.type')).toBe(0);
  });

  it('makes no sound for a press on the box while the choices are open', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    tick(CHAR_MS * NINE.length);
    session.advance();
    tick(1000);
    expect(session.choices.length).toBe(2);
    const line = session.line;
    playCue.mockClear();

    // The other half of the silence under the modal: the reveal above is one, a press is the other.
    // `inert` is what stops this press in a browser and jsdom implements none of it, so the click
    // reaches `onBoxClick` and lands on the `session.choices.length > 0` guard -- which is where
    // this half actually lives, and which now gates a `ui.type` that did not exist when it was
    // written to keep a press from advancing the session behind the panel. Both halves have to
    // hold: a box that ticked under the choices would be answering a press the player cannot make.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(cues(playCue)).toEqual([]);
    // And the guard still does the job it was written for.
    expect(session.line).toBe(line);
    expect(session.choices.length).toBe(2);
  });
});

describe('the choice cues', () => {
  /** Stops at the choice node with its options on screen and the spy cleared. */
  const atChoices = () => {
    vi.useFakeTimers();
    const rendered = renderOverlay(SCRIPT);
    tick(0);
    rendered.session.advance();
    tick(1000);
    const options = [...document.querySelectorAll<HTMLButtonElement>('.choice')];
    expect(options).toHaveLength(2);
    expect(document.activeElement).toBe(options[0]);
    rendered.playCue.mockClear();
    return { ...rendered, options };
  };

  /**
   * The pointer physically moving over an option, which is the only thing that selects one.
   * `bubbles`, unlike the enter below: `pointermove` is one of the events svelte delegates to the
   * mount root, so a non-bubbling one reaches no handler and the test would pass on nothing.
   */
  const pointerOver = (option: HTMLButtonElement) => {
    option.dispatchEvent(new Event('pointermove', { bubbles: true }));
    flushSync();
  };

  /**
   * A `pointerenter` with no `pointermove` before it: the element under a STATIONARY pointer
   * changed. The browser sends exactly this when the scrim scrolls -- a wheel, or the scroll Tab
   * performs to bring its target into view -- and it is why the handler is on `pointermove`.
   */
  const draggedUnderPointer = (option: HTMLButtonElement) => {
    option.dispatchEvent(new Event('pointerenter'));
    flushSync();
  };

  it('leaves the selection where it is when a scroll drags another option under the pointer', () => {
    const { playCue, options } = atChoices();

    // The pointer has chosen a row, and that sounded.
    pointerOver(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // The scrim scrolls, so a wheel taken to read the rest of a long list slides the options past a
    // pointer that never left its chair. None of that is the player choosing: the selection stays
    // where the player put it, and nothing sounds.
    draggedUnderPointer(options[0]);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);
  });

  it('does not undo a keyboard move when the scroll it caused lands an option under the pointer', () => {
    const { playCue, options } = atChoices();

    // Tab scrolls its target into view, and that scroll fires the enter above on whichever option
    // ends up under the resting pointer. The selection Tab just made has to survive it, with the one
    // cue Tab earned and no second one on top.
    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    draggedUnderPointer(options[0]);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);
  });

  it('sounds nothing when the panel opens under a pointer that does not move', () => {
    const { playCue, options } = atChoices();

    // The panel appeared under the pointer and Chrome re-resolved hover afterwards, so option 1 gets
    // an enter for a pointer that never moved. The mount focus keeps option 0 and nothing sounds --
    // no flag needed for the opening, because a pointer lying still sends no `pointermove` at all.
    draggedUnderPointer(options[1]);
    expect(document.activeElement).toBe(options[0]);
    expect(countOf(playCue, 'ui.move')).toBe(0);

    // And the moment the player actually moves, the selection follows and sounds once.
    pointerOver(options[1]);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);
  });

  it('keeps the pointer\'s option, silently, when the move beats the mount focus', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    session.advance();
    // Flushed but not advanced: the panel is mounted and its mount-focus task is queued, so a
    // pointer moving inside that task races it. The move wins, and it is the arrival that gives the
    // panel its first selection, so it is the opening and silent.
    tick(0);
    const options = [...document.querySelectorAll<HTMLButtonElement>('.choice')];
    expect(options).toHaveLength(2);
    expect(document.activeElement).not.toBe(options[0]);
    playCue.mockClear();

    pointerOver(options[1]);
    expect(document.activeElement).toBe(options[1]);

    // And the mount focus is cancelled rather than pulling the selection back to the first option.
    tick(1000);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(0);
  });

  it('sounds the pointer moving onto another option after the keyboard has moved the selection', () => {
    const { playCue, options } = atChoices();

    // A mouse brought in after walking the list is a move like any other: two selections changed by
    // the player, two cues. A window apart, so this is about where the move came from and not about
    // the throttle below.
    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    tick(MOVE_MIN_MS);
    pointerOver(options[0]);
    expect(document.activeElement).toBe(options[0]);
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('sounds the way back in after focus has left the options without leaving the modal', () => {
    const { playCue, options } = atChoices();

    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // The opening is told from a move by whether an option has held the selection yet, and not by
    // where `relatedTarget` says focus arrived from. That reading -- "from outside the panel means
    // the panel had none, which is only ever the opening" -- was false: focus can leave the options
    // without leaving the modal, and every route back in then looked like the mount focus and went
    // silent. A press on the scrim is cancelled now (modalFocus.test.ts), but that closes one route
    // rather than the class of them, and the rule has to hold whichever way focus was lost.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    tick(MOVE_MIN_MS);
    options[0].focus();
    expect(document.activeElement).toBe(options[0]);
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('does not sound the panel taking its own focus', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(SCRIPT);
    tick(0);
    session.advance();
    tick(1000);

    // Focus has landed on the first option by now, and that is the panel opening rather than the
    // player moving: no option had held the selection before it, which is the whole of the test.
    expect(document.activeElement).toBe(q('.choice'));
    expect(countOf(playCue, 'ui.move')).toBe(0);
  });

  it('sounds a move once when the keyboard walks to the next option', () => {
    const { playCue, options } = atChoices();

    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // Back again is another move; two moves, not one silenced by having been here before. A window
    // apart: a player walking a list by pressing a key at a time never gets near MOVE_MIN_MS, and
    // this test is about the move, not about the throttle.
    tick(MOVE_MIN_MS);
    options[0].focus();
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('sounds one move for a sweep that crosses the list faster than the cue is long', () => {
    const { playCue, options } = atChoices();

    // A `pointermove` fires for every pixel the pointer travels, so a mouse wiggled over the
    // boundary between two options changes the selection as fast as it reports -- tens of
    // milliseconds apart, against a 300 ms sample the bank plays as a fresh instance each time
    // rather than restarting. Ten crossings inside one window is one sound, not ten stacked.
    for (let i = 0; i < 10; i++) pointerOver(options[i % 2]);
    expect(countOf(playCue, 'ui.move')).toBe(1);
    // And the selection itself is not throttled -- only the sound is. It followed every one of them.
    expect(document.activeElement).toBe(options[1]);

    // A window, not a latch: once it has passed, the next move sounds like any other.
    tick(MOVE_MIN_MS);
    pointerOver(options[0]);
    expect(document.activeElement).toBe(options[0]);
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('holds the window to exactly MOVE_MIN_MS -- silent one tick short of it, sounding the tick it closes', () => {
    const { playCue, options } = atChoices();

    // `tick()` walks in whole CHAR_MS slices, which would round any boundary here up to the next
    // multiple of 24 and hide the real edge. Advancing the fake clock directly is what lets this
    // test stand a millisecond either side of MOVE_MIN_MS itself, rather than merely inside some
    // window -- see the file header on why that gap is exactly what this suite has been missing.
    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    vi.advanceTimersByTime(MOVE_MIN_MS - 1);
    flushSync();
    pointerOver(options[0]);
    expect(document.activeElement).toBe(options[0]);
    expect(countOf(playCue, 'ui.move')).toBe(1);

    vi.advanceTimersByTime(1);
    flushSync();
    pointerOver(options[1]);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('sounds a move once when the pointer selects another option, and not twice around the click', () => {
    const { session, playCue, options } = atChoices();

    // The pointer moves the selection rather than sounding beside it, so moving onto the option both
    // focuses it and sounds exactly one move.
    pointerOver(options[1]);
    expect(document.activeElement).toBe(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // Clicking the option the pointer already selected fires no focus event, so the confirm is not
    // preceded by a second move.
    options[1].click();
    flushSync();
    expect(cues(playCue)).toEqual(['ui.move', 'ui.confirm']);
    expect(session.choices.length).toBe(0);
  });

  it('sounds nothing extra when answering one question opens the next', () => {
    vi.useFakeTimers();
    const { session, playCue } = renderOverlay(CHAINED);
    tick(0);
    session.advance();
    tick(1000);
    const options = [...document.querySelectorAll<HTMLButtonElement>('.choice')];
    expect(document.activeElement).toBe(options[0]);

    // Select the SECOND row first, which is the half of this that used to sound differently: the
    // panel stays mounted, re-focuses the first option of the new question, and that arrival comes
    // from another option inside the panel. Answering on the first row leaves focus where it already
    // was and fires no focus event at all, so the two rows only agree if the re-focus is silent --
    // one player action, one sound, whichever row it was taken on.
    pointerOver(options[1]);
    expect(document.activeElement).toBe(options[1]);
    playCue.mockClear();

    // Flushed before the clock is advanced, not after: the re-focus is scheduled by an effect, and
    // an `advanceTimersByTime` that runs first would move past a timeout that does not exist yet.
    options[1].click();
    flushSync();
    tick(CHAR_MS);
    expect(session.choices.length).toBe(2);
    expect(cues(playCue)).toEqual(['ui.confirm']);

    // And the re-focus still happens: the selection is on the new question's first option, not left
    // on the row the player just answered, which is what the effect exists for.
    expect(document.activeElement).toBe(options[0]);
    expect(options[0].textContent).toContain('是');
  });

  it('sounds nothing while the pointer keeps moving inside the option it already selected', () => {
    const { playCue, options } = atChoices();

    pointerOver(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // A `pointermove` fires for every pixel the pointer travels, and the ones that stay on the same
    // option do not move the selection -- focus never left option 1 -- so there is nothing to sound.
    pointerOver(options[1]);
    pointerOver(options[1]);
    expect(countOf(playCue, 'ui.move')).toBe(1);
  });
});
