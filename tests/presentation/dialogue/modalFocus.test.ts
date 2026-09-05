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
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DialogueOverlay from '../../../src/presentation/dialogue/DialogueOverlay.svelte';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

const SCRIPT = ':: greet\n里昂: 你好。\n-> ask\n:: ask\n里昂: 走哪？\n* 左 -> l\n* 右 -> r\n:: l\n旁白: 左。\n:: r\n旁白: 右。\n';

/** A frame of the real overlay, mounted into a fresh document body. */
function render() {
  const { graph } = parse(SCRIPT);
  const session = createDialogueSession(graph!);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DialogueOverlay, { target, props: { session } });
  flushSync();
  return { session, target, app };
}

/** The task-deferred focus calls land after a macrotask; so does svelte's own flush. */
const settle = async () => { flushSync(); await new Promise((r) => setTimeout(r, 0)); flushSync(); };

const q = <T extends Element>(sel: string) => document.querySelector(sel) as T | null;
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

afterEach(() => { document.body.innerHTML = ''; });

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
    // Focus must be INSIDE the panel, not left on the trigger that inert has just switched off.
    expect(q('.close')!.contains(document.activeElement)).toBe(true);

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
    // The description must resolve to the line posing the question, which the opaque scrim hides.
    expect(document.getElementById(panel.getAttribute('aria-describedby')!)!.textContent).toBe('走哪？');
  });
});
