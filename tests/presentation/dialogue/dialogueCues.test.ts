// @vitest-environment jsdom
//
// What the overlay SOUNDS, as opposed to what it focuses (modalFocus.test.ts, whose harness this
// borrows). Every number here was verified by hand in a browser when it was written and by nothing
// else: the throttle's arithmetic, the character the first tick lands on, and which of the three
// events around a click sound a move are all invisible to a type checker and silent when they drift.
// The PR that added them had to describe the reveal as ticking on chars 1, 4 and 7; it ticks on
// 3, 6 and 9, and that is the kind of drift this file exists to catch.
//
// The overlay is mounted for real and `playCue` is a spy in the prop the app passes: nothing here
// mocks the components under test, so a cue reaching the spy is a cue that would reach `soundBank`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DialogueOverlay from '../../../src/presentation/dialogue/DialogueOverlay.svelte';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

// Both stubs are here for the reasons modalFocus.test.ts gives at length: Portrait would otherwise
// run the real VP9 probe, which jsdom answers never, and reads matchMedia, which jsdom lacks.
vi.mock('../../../src/presentation/dialogue/vp9Alpha', () => ({
  supportsVp9Alpha: () => Promise.resolve(false),
}));
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** The reveal's own interval, and the throttle it feeds. Both are Line.svelte's defaults. */
const CHAR_MS = 24;

// Nine characters, so the throttle has room to land three ticks inside one line.
const NINE = '一二三四五六七八九';
const SCRIPT = [':: greet', `里昂: ${NINE}`, '-> ask', ':: ask', '里昂: 走哪？', '* 左 -> l', '* 右 -> r', ':: l', '旁白: 左。', ':: r', '旁白: 右。', ''].join('\n');

// Both options of `ask` lead to `again`, which is itself a choice node. That is the shape the panel
// is NOT remounted in -- `session.choices.length` never reaches zero, so DialogueOverlay's {#if}
// holds, and <Choices> re-focuses itself in place instead. `intro.dlg` has no such node today.
const CHAINED = [':: greet', `里昂: ${NINE}`, '-> ask', ':: ask', '里昂: 走哪？', '* 左 -> again', '* 右 -> again', ':: again', '里昂: 真的？', '* 是 -> l', '* 否 -> r', ':: l', '旁白: 左。', ':: r', '旁白: 右。', ''].join('\n');

const mounted: ReturnType<typeof mount>[] = [];

function render(script = SCRIPT) {
  const { graph } = parse(script);
  const session = createDialogueSession(graph!);
  const playCue = vi.fn();
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(DialogueOverlay, { target, props: { session, playCue } }));
  flushSync();
  return { session, playCue };
}

/** Timers under vitest's control, flushed after each slice so svelte's effects see each step. */
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += CHAR_MS) { vi.advanceTimersByTime(CHAR_MS); flushSync(); }
  flushSync();
};

const q = <T extends Element>(sel: string) => document.querySelector(sel) as T | null;
/** The characters the typewriter has drawn, without the blinking caret it appends while revealing. */
const revealed = () => q('.line')!.textContent!.replace('▌', '');
const cues = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(([cue]) => cue as string);
const countOf = (spy: ReturnType<typeof vi.fn>, cue: string) => cues(spy).filter((c) => c === cue).length;

afterEach(() => {
  while (mounted.length) unmount(mounted.pop()!);
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('the typing cue', () => {
  it('sounds once per throttle window, on the third character and every third after it', () => {
    vi.useFakeTimers();
    const { playCue } = render();
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
    const { playCue } = render();
    tick(0);
    tick(CHAR_MS * 3);
    expect(countOf(playCue, 'ui.type')).toBe(1);

    // The press sounds its own tick; the six characters it then draws at once must not sound six
    // more, which is the burst the throttle exists to prevent.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(revealed()).toBe(NINE);
    expect(countOf(playCue, 'ui.type')).toBe(2);
  });

  it('sounds the press whether it finishes the line or starts the next one', () => {
    vi.useFakeTimers();
    const { session, playCue } = render();
    tick(0);
    tick(CHAR_MS * NINE.length);
    const finished = countOf(playCue, 'ui.type');
    const line = session.line;

    // The line is complete, so this press advances rather than revealing -- the same event as far as
    // the player is concerned, and it sounds the same.
    q<HTMLButtonElement>('.hit')!.click();
    flushSync();
    expect(session.line).not.toBe(line);
    expect(countOf(playCue, 'ui.type')).toBe(finished + 1);
  });

  it('stays silent while the choices cover the box', () => {
    vi.useFakeTimers();
    const { session, playCue } = render();
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
});

describe('the choice cues', () => {
  /** Stops at the choice node with its options on screen and the spy cleared. */
  const atChoices = () => {
    vi.useFakeTimers();
    const rendered = render();
    tick(0);
    rendered.session.advance();
    tick(1000);
    const options = [...document.querySelectorAll<HTMLButtonElement>('.choice')];
    expect(options).toHaveLength(2);
    expect(document.activeElement).toBe(options[0]);
    rendered.playCue.mockClear();
    return { ...rendered, options };
  };

  it('does not sound the panel taking its own focus', () => {
    vi.useFakeTimers();
    const { session, playCue } = render();
    tick(0);
    session.advance();
    tick(1000);

    // Focus has landed on the first option by now, and that is the panel opening rather than the
    // player moving: `relatedTarget` on that focus event is outside the panel.
    expect(document.activeElement).toBe(q('.choice'));
    expect(countOf(playCue, 'ui.move')).toBe(0);
  });

  it('sounds a move once when the keyboard walks to the next option', () => {
    const { playCue, options } = atChoices();

    options[1].focus();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // Back again is another move; two moves, not one silenced by having been here before.
    options[0].focus();
    expect(countOf(playCue, 'ui.move')).toBe(2);
  });

  it('sounds a move once when the pointer selects another option, and not twice around the click', () => {
    const { session, playCue, options } = atChoices();

    // The pointer moves the selection rather than sounding beside it, so entering the option both
    // focuses it and sounds exactly one move.
    options[1].dispatchEvent(new Event('pointerenter'));
    flushSync();
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
    const { session, playCue } = render(CHAINED);
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
    options[1].dispatchEvent(new Event('pointerenter'));
    flushSync();
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

  it('sounds nothing when the pointer re-enters the option it already selected', () => {
    const { playCue, options } = atChoices();

    options[1].dispatchEvent(new Event('pointerenter'));
    flushSync();
    expect(countOf(playCue, 'ui.move')).toBe(1);

    // The pointer wandering off and back does not move the selection -- focus never left option 1 --
    // so there is nothing to sound.
    options[1].dispatchEvent(new Event('pointerenter'));
    flushSync();
    expect(countOf(playCue, 'ui.move')).toBe(1);
  });
});
