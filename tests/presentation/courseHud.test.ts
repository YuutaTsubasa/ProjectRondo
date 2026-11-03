// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CourseHud from '../../src/presentation/course/CourseHud.svelte';
beforeEach(()=>{vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>vi.unstubAllGlobals());
let app: ReturnType<typeof mount>;
afterEach(async () => { await unmount(app); document.body.innerHTML = ''; });
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
it('focuses and traps pause controls including settings, and guards repeated exit actions', async () => {
  const resume = vi.fn(), restart = vi.fn(), exit = vi.fn();
  app = mount(CourseHud, { target: document.body, props: { run: { collected: [], health: 3, checkpoint: 1, elapsed: 63, falls: 2, finished: false }, status: 'paused', checkpointLabel: '斷橋彼端', onPause: vi.fn(), onResume: resume, onRestart: restart, onExit: exit } });
  await settle();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')];
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(buttons[buttons.length-1]);
  buttons.slice(0,3).forEach(b => b.click());
  expect(resume).toHaveBeenCalledTimes(1); expect(restart).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLElement>('.course-hud')?.inert).toBe(true);
});
it('shows final time/falls and offers replay instead of resuming a finished run', async () => {
  app = mount(CourseHud, { target: document.body, props: { run: { collected: [], health: 3, checkpoint: 3, elapsed: 83, falls: 2, finished: true }, status: 'finished', checkpointLabel: '遺跡終點', onPause: vi.fn(), onResume: vi.fn(), onRestart: vi.fn(), onExit: vi.fn() } });
  await settle();
  const dialog = document.querySelector('[role=dialog]')!;
  expect(dialog.textContent).toContain('STAGE CLEAR'); expect(dialog.textContent).toContain('01:23');
  expect(dialog.textContent).toContain('重新挑戰'); expect(dialog.textContent).not.toContain('繼續遊戲');
});

it('Space activates the HUD pause button without queuing a gameplay jump', async () => {
  const { createInput } = await import('../../src/presentation/babylon/input');
  const input = createInput(), pause = vi.fn();
  try {
    app = mount(CourseHud, { target: document.body, props: { run: { collected: [], health: 3, checkpoint: 0, elapsed: 0, falls: 0, finished: false }, status: 'playing', checkpointLabel: '草坡起跑', onPause: pause, onResume: vi.fn(), onRestart: vi.fn(), onExit: vi.fn() } });
    await settle();
    const button = document.querySelector<HTMLButtonElement>('[aria-label="暫停關卡"]')!; button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(pause).toHaveBeenCalledTimes(1); expect(input.consumeJump()).toBe(false);
  } finally { input.dispose(); }
});

it('uses character health for the meter and keeps checkpoint labels out of the health plate',async()=>{
 app=mount(CourseHud,{target:document.body,props:{run:{collected:[],health:2,checkpoint:1,elapsed:10,falls:0,finished:false},status:'playing',checkpointLabel:'斷橋彼端',onPause:vi.fn(),onResume:vi.fn(),onRestart:vi.fn(),onExit:vi.fn()}});
 await settle();const meter=document.querySelector('[role=meter]')!;
 expect(meter.getAttribute('aria-label')).toBe('生命');expect(meter.getAttribute('aria-valuenow')).toBe('2');expect(meter.getAttribute('aria-valuemax')).toBe('3');
 expect(document.querySelector('.vitals')?.textContent).not.toContain('斷橋彼端');expect(document.querySelector('[aria-label="紀錄點 1 / 3"]')).not.toBeNull();
});

it('uses the selected course title, coin target and rank thresholds on results',async()=>{
 const {getCourseStage}=await import('../../src/domain/course/courseStages');const stage=getCourseStage('course-3');
 app=mount(CourseHud,{target:document.body,props:{stage,run:{collected:[0,1],health:3,checkpoint:stage.gates.length-1,elapsed:59,falls:0,finished:true},status:'finished',checkpointLabel:stage.gates.at(-1)!.label,onPause:vi.fn(),onResume:vi.fn(),onRestart:vi.fn(),onExit:vi.fn()}});
 await settle();const dialog=document.querySelector('[role=dialog]')!;
 expect(dialog.textContent).toContain(stage.title);expect(dialog.textContent).toContain('2 / '+stage.coins.length);expect(dialog.textContent).toContain(stage.times[0]+' 秒內完成');
});

it('keeps the selected trial number on its pause screen',async()=>{
 const {getCourseStage}=await import('../../src/domain/course/courseStages');const stage=getCourseStage('course-5');
 app=mount(CourseHud,{target:document.body,props:{stage,run:{collected:[],health:3,checkpoint:0,elapsed:0,falls:0,finished:false},status:'paused',checkpointLabel:stage.gates[0].label,onPause:vi.fn(),onResume:vi.fn(),onRestart:vi.fn(),onExit:vi.fn()}});
 await settle();expect(document.querySelector('.chapter')?.textContent).toContain('05');
});
