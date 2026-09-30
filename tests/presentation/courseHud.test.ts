// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CourseHud from '../../src/presentation/course/CourseHud.svelte';
let app: ReturnType<typeof mount>;
afterEach(async () => { await unmount(app); document.body.innerHTML = ''; });
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
it('focuses and traps the pause controls and wires resume, restart and exit', async () => {
  const resume = vi.fn(), restart = vi.fn(), exit = vi.fn();
  app = mount(CourseHud, { target: document.body, props: { run: { checkpoint: 1, elapsed: 63, falls: 2, finished: false }, status: 'paused', checkpointLabel: '斷橋彼端', onPause: vi.fn(), onResume: resume, onRestart: restart, onExit: exit } });
  await settle();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')];
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(buttons[2]);
  buttons.forEach(b => b.click());
  expect(resume).toHaveBeenCalledTimes(1); expect(restart).toHaveBeenCalledTimes(1); expect(exit).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLElement>('.course-hud')?.inert).toBe(true);
});
it('shows final time/falls and offers replay instead of resuming a finished run', async () => {
  app = mount(CourseHud, { target: document.body, props: { run: { checkpoint: 3, elapsed: 83, falls: 2, finished: true }, status: 'finished', checkpointLabel: '遺跡終點', onPause: vi.fn(), onResume: vi.fn(), onRestart: vi.fn(), onExit: vi.fn() } });
  await settle();
  const dialog = document.querySelector('[role=dialog]')!;
  expect(dialog.textContent).toContain('STAGE CLEAR'); expect(dialog.textContent).toContain('01:23');
  expect(dialog.textContent).toContain('再玩一次'); expect(dialog.textContent).not.toContain('繼續遊戲');
});

it('Space activates the HUD pause button without queuing a gameplay jump', async () => {
  const { createInput } = await import('../../src/presentation/babylon/input');
  const input = createInput(), pause = vi.fn();
  try {
    app = mount(CourseHud, { target: document.body, props: { run: { checkpoint: 0, elapsed: 0, falls: 0, finished: false }, status: 'playing', checkpointLabel: '草坡起跑', onPause: pause, onResume: vi.fn(), onRestart: vi.fn(), onExit: vi.fn() } });
    await settle();
    const button = document.querySelector<HTMLButtonElement>('[aria-label="暫停關卡"]')!; button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(pause).toHaveBeenCalledTimes(1); expect(input.consumeJump()).toBe(false);
  } finally { input.dispose(); }
});
