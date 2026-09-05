// @vitest-environment jsdom
//
// The only executable test of the modal focus machinery. Everything it covers -- inert on the scene
// UI, each modal taking focus on mount, focus returning to the trigger, Escape, and AUTO pausing --
// was wrong at least once during this PR and was caught each time by a human driving the browser.
// vite.config.ts pins environment: 'node' for the suite; this file opts itself into jsdom rather
// than changing that default, since every other test here is a pure function or a file-content guard.
//
// Two things jsdom will not do: enforce inert (it does not block focus), and reflect the inert
// PROPERTY to an attribute. Svelte sets the property, and that is what browsers act on, so these
// assert `.inert` rather than `hasAttribute('inert')` -- and they assert the state this code is
// responsible for setting, not the focus-blocking the browser then performs.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DialogueOverlay from '../../../src/presentation/dialogue/DialogueOverlay.svelte';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

// Mounting the overlay mounts Portrait, which would otherwise run the real VP9 probe: jsdom decodes
// nothing, so it only leaves a 2s timer and an unresolved promise outliving a file that finishes in
// a third of a second, plus a "Not implemented: play()" line in the console. Answered `false` here
// so that it resolves at once rather than never: this file is about focus, and a probe left hanging
// is only a way for one suite's leftovers to turn up in another's. Which portrait that renders is
// pinned in portraitSource.test.ts, not here.
vi.mock('../../../src/presentation/dialogue/vp9Alpha', () => ({
  supportsVp9Alpha: () => Promise.resolve(false),
}));

// jsdom does not implement matchMedia, and Portrait reads it to honour prefers-reduced-motion.
// Stubbed here rather than guarded in the component: every real browser has matchMedia, so a guard
// there would defend against a case only this environment has. (The component does branch on
// MediaQueryList.addEventListener, which pre-14 WebKit genuinely lacks -- that one is pinned in
// portraitSource.test.ts.) Reports "no preference", so motion is not the thing suppressing it.
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

const SCRIPT = ':: greet\n里昂: 你好。\n-> ask\n:: ask\n里昂: 走哪？\n* 左 -> l\n* 右 -> r\n:: l\n旁白: 左。\n:: r\n旁白: 右。\n';

const mounted: ReturnType<typeof mount>[] = [];

/** A frame of the real overlay, mounted into a fresh document body. */
function render(script = SCRIPT) {
  const { graph } = parse(script);
  const session = createDialogueSession(graph!);
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(DialogueOverlay, { target, props: { session } }));
  flushSync();
  return { session };
}

/** The task-deferred focus calls land after a macrotask; so does svelte's own flush. */
const settle = async () => { flushSync(); await new Promise((r) => setTimeout(r, 0)); flushSync(); };

const q = <T extends Element>(sel: string) => document.querySelector(sel) as T | null;
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

// Unmount rather than only clearing innerHTML. A live overlay keeps its effects, Line's typewriter
// interval and -- with a modal open -- Backlog's svelte:window keydown listener, which would then
// act on an Escape a later test dispatches. Isolation has to come from teardown, not test order.
afterEach(() => {
  while (mounted.length) unmount(mounted.pop()!);
  document.body.innerHTML = '';
});

describe('modal focus', () => {
  it('marks the scene UI inert only while a modal is open', async () => {
    render();
    await settle();
    expect(q<HTMLElement>('.scene-ui')!.inert).toBe(false);

    buttonNamed('LOG')!.click();
    await settle();
    expect(q<HTMLElement>('.scene-ui')!.inert).toBe(true);

    q<HTMLButtonElement>('.close')!.click();
    await settle();
    expect(q<HTMLElement>('.scene-ui')!.inert).toBe(false);
  });

  it('the backlog takes focus on open and hands it back on close', async () => {
    render();
    await settle();
    const log = buttonNamed('LOG')!;
    log.focus();
    expect(document.activeElement).toBe(log);

    log.click();
    await settle();
    // Focus must be on the panel's own control, not left on the trigger inert has just switched off.
    expect(document.activeElement).toBe(q('.close'));

    q<HTMLButtonElement>('.close')!.click();
    await settle();
    expect(document.activeElement).toBe(log);
  });

  it('Escape closes the backlog', async () => {
    render();
    await settle();
    buttonNamed('LOG')!.click();
    await settle();
    expect(q('.log')).not.toBeNull();

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(q('.log')).toBeNull();
    expect(q<HTMLElement>('.scene-ui')!.inert).toBe(false);
  });

  it('the choices modal takes focus on its first option', async () => {
    const { session } = render();
    await settle();
    session.advance();                       // greet -> ask, which branches
    await settle();
    expect(session.choices.length).toBe(2);
    const first = q<HTMLButtonElement>('.choice')!;
    expect(document.activeElement).toBe(first);
  });

  it('the dialogue line reaches assistive technology, and the typewriter does not', async () => {
    render();
    await settle();
    // The visible paragraph is hidden from AT because the typewriter mutates it per character.
    expect(q('.line')!.getAttribute('aria-hidden')).toBe('true');
    // The complete line is exposed in one piece, inside the live region.
    expect(q('.sr-only')!.textContent).toBe('你好。');
    expect(q('.content')!.getAttribute('aria-live')).toBe('polite');
  });

  it('the advance target is a real button, and .box carries no role that would prune it', async () => {
    render();
    await settle();
    expect(q('.hit')!.tagName).toBe('BUTTON');
    expect(q('.hit')!.getAttribute('aria-label')).toBe('advance dialogue');
    expect(q('.box')!.getAttribute('role')).toBeNull();
  });

  it('both modals are exposed as modal dialogs', async () => {
    const { session } = render();
    await settle();
    buttonNamed('LOG')!.click();
    await settle();
    const log = q('.log')!;
    expect(log.getAttribute('role')).toBe('dialog');
    expect(log.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(log.getAttribute('aria-labelledby')!)).not.toBeNull();

    q<HTMLButtonElement>('.close')!.click();
    await settle();
    session.advance();
    await settle();
    const panel = q('.panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    // The description must resolve to the line posing the question. The scrim is a wash now, so the
    // box behind it is not hidden -- but the panel is centred over it at most viewport sizes, so the
    // question is still the one thing a player answering cannot count on seeing (Choices.svelte).
    expect(document.getElementById(panel.getAttribute('aria-describedby')!)!.textContent).toBe('走哪？');
  });

  it('AUTO advances on its own, but not while a modal is open', async () => {
    vi.useFakeTimers();
    try {
      // Three plain lines: the default script branches after one advance, which makes choices.length
      // and modalOpen agree and the assertion below unable to tell them apart.
      const LINEAR = [':: a', '里昂: 一。', '-> b', ':: b', '里昂: 二。', '-> c', ':: c', '里昂: 三。', ''].join('\n');
      const { session } = render(LINEAR);
      // Step in slices with a flush between: advancing the whole span at once runs every timer
      // callback before svelte ever re-runs its effects, so the AUTO timeout is only *scheduled*
      // after time has already passed and never fires -- which made the assertion below vacuous.
      const tick = (ms: number) => {
        for (let t = 0; t < ms; t += 25) { vi.advanceTimersByTime(25); flushSync(); }
        flushSync();
      };
      tick(0);
      buttonNamed('AUTO')!.click();
      tick(0);

      // The typewriter finishes (24ms a character), then AUTO waits AUTO_ADVANCE_MS = 1200.
      const first = session.line;
      tick(200);
      tick(1300);
      expect(session.line).not.toBe(first);

      // With the backlog open, the same wait must change nothing: modalOpen gates the effect.
      const beforeLog = session.line;
      buttonNamed('LOG')!.click();
      tick(0);
      tick(5000);
      expect(session.line).toBe(beforeLog);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-focuses when one choice screen leads straight to another', async () => {
    // `x` answers with a line AND branches again, so choices.length never drops to zero: the {#if}
    // does not remount and `panel` does not change. Only the effect's dependency on `choices` makes
    // it run again.
    //
    // Three options collapsing to one is the shape that exposes it. The {#each} is unkeyed, so the
    // surviving button is REUSED — focus on the first option would appear to survive on its own and
    // the test would pass with the dependency removed. Focus has to be on a button the transition
    // destroys for the assertion to mean anything.
    const BRANCHING = [
      ':: greet', '里昂: 你好。', '-> ask',
      // The branching target is on the LAST option, so the button that is focused and clicked is
      // also one the transition destroys.
      ':: ask', '里昂: 走哪？', '* 甲 -> y', '* 乙 -> z', '* 丙 -> x',
      ':: x', '里昂: 再選。', '* 唯一 -> w',
      ':: y', '旁白: 乙。', ':: z', '旁白: 丙。', ':: w', '旁白: 完。', '',
    ].join('\n');
    const { session } = render(BRANCHING);
    await settle();
    session.advance();
    await settle();
    expect(session.choices.map((c) => c.label)).toEqual(['甲', '乙', '丙']);

    const options = [...document.querySelectorAll<HTMLButtonElement>('.choice')];
    expect(options).toHaveLength(3);
    options[2].focus();
    expect(document.activeElement).toBe(options[2]);

    options[2].click();          // -> x, which offers a single option; options[1] and [2] are destroyed
    await settle();
    expect(session.choices.map((c) => c.label)).toEqual(['唯一']);
    expect(options[2].isConnected).toBe(false);
    expect(document.activeElement).toBe(q('.choice'));
  });
});
