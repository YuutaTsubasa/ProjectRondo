// The jsdom environment the two files that mount the real DialogueOverlay share: modalFocus.test.ts,
// which covers what the overlay FOCUSES, and dialogueCues.test.ts, what it SOUNDS. Both mount the
// same component tree, and each used to carry its own copy of the setup below. Two copies of a jsdom
// stub drift in one direction only: a third dependency this environment cannot serve, or a change to
// how the overlay is mounted, has to be found and applied twice, and the copy that is missed fails as
// an environment crash in one file alone.
//
// This module is the only place in the test tree that imports DialogueOverlay, which is what keeps
// the mock below reliable rather than a matter of import order. `vi.mock` is hoisted to the top of
// the file it is written in, so registering it here -- above this file's own import of the component
// -- runs before anything the component pulls in. A test file importing the component itself would
// hand that ordering back to the caller, where nothing states it.
//
// Named without `.test.`, so vite.config.ts' `include` does not collect it as a suite of its own.
import { vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DialogueOverlay from '../../../src/presentation/dialogue/DialogueOverlay.svelte';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

// Mounting the overlay mounts Portrait, which would otherwise run the real VP9 probe: jsdom decodes
// nothing, so it only leaves a 2s timer and an unresolved promise outliving files that finish in a
// third of a second, plus a "Not implemented: play()" line in the console. Answered `false` here so
// that it resolves at once rather than never: neither caller is about the probe, and one left hanging
// is only a way for one suite's leftovers to turn up in another's. Which portrait that renders is
// pinned in portraitSource.test.ts.
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

const mounted: ReturnType<typeof mount>[] = [];

/**
 * Mounts a frame of the real overlay, driven by `script`, into a fresh element on the document body.
 * Returns the session behind it and the `playCue` spy it was mounted with.
 *
 * The spy goes in whether the caller reads cues or not, so both files mount an identical tree: the
 * prop is optional and every call site inside the component is `playCue?.(...)`, so supplying one
 * changes nothing but whether the call is recorded.
 */
export function renderOverlay(script: string) {
  const { graph } = parse(script);
  const session = createDialogueSession(graph!);
  const playCue = vi.fn();
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(DialogueOverlay, { target, props: { session, playCue } }));
  flushSync();
  return { session, playCue };
}

/** The first match for `sel` in the mounted document, at whatever element type the caller asserts. */
export const q = <T extends Element>(sel: string) => document.querySelector(sel) as T | null;

/**
 * Teardown for an `afterEach`. Unmounts rather than only clearing innerHTML: a live overlay keeps its
 * effects, Line's typewriter interval and -- with a modal open -- Backlog's svelte:window keydown
 * listener, which would then act on an Escape a later test dispatches. Isolation has to come from
 * teardown, not from test order.
 */
export function resetOverlay() {
  while (mounted.length) unmount(mounted.pop()!);
  document.body.innerHTML = '';
}
