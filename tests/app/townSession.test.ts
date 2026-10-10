// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { PrecisionDate } from '@babylonjs/core/Misc/precisionDate';
import TownSession from '../../src/app/TownSession.svelte';
import App from '../../src/app/App.svelte';
const stub = vi.hoisted(() => ({ build: vi.fn(), load: vi.fn(), disposeEngine: vi.fn(), frame: (() => {}) as () => void }));
vi.mock('../../src/app/loadGameSession', () => ({ loadGameSession: stub.load }));
vi.mock('../../src/presentation/town/townScene', () => ({ createTownScene: stub.build }));
vi.mock('@babylonjs/core/Engines/engine', () => ({ Engine: class {
  runRenderLoop(fn: () => void) { stub.frame = fn; }
  resize() {} dispose() { stub.disposeEngine(); }
} }));
let app: ReturnType<typeof mount> | undefined;
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
const button = (name: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.includes(name))!;
const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
function town() {
  return { scene: { render: vi.fn(), resetLastAnimationTimeFrame: vi.fn() },
    suspendInput: vi.fn(), reset: vi.fn(), getLocationLabel: vi.fn(() => '住宅街 / RESIDENTIAL STREET'), dispose: vi.fn() };
}
afterEach(async () => {
  if (app) await unmount(app); app = undefined; document.body.innerHTML = '';
  vi.clearAllMocks(); vi.restoreAllMocks();
});
it.each(['resume', 'reset', 'hidden'] as const)('pauses rendering and discards stale simulation time on %s', async action => {
  const level = town(), ready = vi.fn(); stub.build.mockResolvedValue(level);
  app = mount(TownSession, { target: document.body, props: { onReady: ready, onFailure: vi.fn() } }); await settle();
  expect(ready).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(document.querySelector('canvas'));
  expect(document.body.textContent).toContain('住宅街 / RESIDENTIAL STREET');
  stub.frame(); expect(level.scene.render).toHaveBeenCalledOnce();
  if (action === 'hidden') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    stub.frame(); // A hidden frame must pause even before visibilitychange is delivered.
  } else escape();
  await settle();
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  expect(level.suspendInput).toHaveBeenLastCalledWith(true);
  stub.frame(); expect(level.scene.render).toHaveBeenCalledOnce();
  if (action === 'reset') button('返回入口').click();
  else {
    if (action === 'hidden') vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    escape();
  }
  await settle();
  expect(level.suspendInput).toHaveBeenLastCalledWith(false);
  expect(document.activeElement).toBe(document.querySelector('canvas'));
  expect(level.reset).toHaveBeenCalledTimes(action === 'reset' ? 1 : 0);
  const rebases = level.scene.resetLastAnimationTimeFrame.mock.calls.length;
  stub.frame(); expect(level.scene.render).toHaveBeenCalledOnce();
  expect(level.scene.resetLastAnimationTimeFrame).toHaveBeenCalledTimes(rebases + 1);
  level.getLocationLabel.mockReturnValue('海濱廣場 / SEAFRONT PLAZA');
  stub.frame(); await settle();
  expect(level.scene.render).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain('海濱廣場 / SEAFRONT PLAZA');
  expect(stub.build).toHaveBeenCalledOnce();
});
it('traps pause dialog focus, clears input when leaving and disposes scene before engine', async () => {
  const level = town(), exit = vi.fn(), order: string[] = [];
  level.dispose.mockImplementation(() => { order.push('scene'); });
  stub.disposeEngine.mockImplementation(() => { order.push('engine'); });
  stub.build.mockResolvedValue(level);
  app = mount(TownSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn(), onExit: exit } }); await settle();
  button('暫停漫遊').click(); await settle();
  const dialog = document.querySelector('[role=dialog]')!;
  expect(document.activeElement).toBe(button('繼續漫遊'));
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(button('系統設定'));
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(dialog.querySelector('button'));
  button('返回主選單').click();
  expect(exit).toHaveBeenCalledOnce(); expect(level.suspendInput).toHaveBeenLastCalledWith(true);
  await unmount(app); app = undefined;
  expect(order).toEqual(['scene', 'engine']);
});
it('starts paused when loading completes while the page is hidden', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const level = town(); stub.build.mockResolvedValue(level);
  app = mount(TownSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn() } }); await settle();
  expect(level.suspendInput).toHaveBeenLastCalledWith(true);
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  stub.frame(); expect(level.scene.render).not.toHaveBeenCalled();
});
it.each(['resolve', 'reject'] as const)('waits for pending build to %s after unmount before engine teardown', async outcome => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const level = town(), ready = vi.fn(), failure = vi.fn();
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  stub.build.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
  app = mount(TownSession, { target: document.body, props: { onReady: ready, onFailure: failure } }); await settle();
  await unmount(app); app = undefined;
  expect(stub.disposeEngine).not.toHaveBeenCalled();
  if (outcome === 'resolve') resolve(level); else reject(new Error('cancelled load'));
  await settle();
  expect(level.dispose).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0);
  expect(stub.disposeEngine).toHaveBeenCalledOnce();
  expect(ready).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
});
it('reports a live loading failure and releases the engine on teardown', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('town unavailable'), failure = vi.fn(), ready = vi.fn();
  stub.build.mockRejectedValue(error);
  app = mount(TownSession, { target: document.body, props: { onReady: ready, onFailure: failure } }); await settle();
  expect(failure).toHaveBeenCalledWith(error); expect(ready).not.toHaveBeenCalled();
  await unmount(app); app = undefined;
  expect(stub.disposeEngine).toHaveBeenCalledOnce();
});

it('keeps focus in the pause dialog when the full app finishes loading in a hidden page', async () => {
  const level = town(); stub.build.mockResolvedValue(level); stub.load.mockResolvedValue({ default: TownSession });
  app = mount(App, { target: document.body }); await settle();
  button('進入主選單').click(); await settle();
  button('額外內容').click(); await settle();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  button('白色王城').click(); await settle();
  button('進入選擇內容').click(); await settle(); await settle();
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  expect(document.activeElement).toBe(button('繼續漫遊'));
});

// Use a real Babylon animation: checking render counts alone misses wall-clock pose jumps.
function animatedTown() {
  let now = 1000;
  vi.spyOn(PrecisionDate, 'Now', 'get').mockImplementation(() => now);
  const engine = new NullEngine();
  engine.getDeltaTime = () => 20;
  const scene = new Scene(engine);
  scene.activeCamera = new TargetCamera('camera', new Vector3(0, 0, -10), scene);
  const bone = new TransformNode('bone', scene);
  const clip = new Animation('walkPose', 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT);
  clip.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
  const group = new AnimationGroup('walk', scene);
  group.addTargetedAnimation(clip, bone); group.start(false);
  scene.render(); now += 20; scene.render();
  return { ...town(), scene, bone, advance(ms: number) { now += ms; },
    dispose() { scene.dispose(); engine.dispose(); } };
}
it.each(['resume', 'reset', 'visibility'] as const)('excludes paused wall time from a real animation on %s', async action => {
  const level = animatedTown(); stub.build.mockResolvedValue(level);
  app = mount(TownSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn() } }); await settle();
  level.advance(20); stub.frame();
  const before = level.bone.position.y;
  if (action === 'visibility') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
  } else escape();
  await settle();
  level.advance(800); stub.frame(); expect(level.bone.position.y).toBe(before);
  if (action === 'reset') button('返回入口').click();
  else {
    if (action === 'visibility') vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    escape();
  }
  await settle();
  level.advance(20); stub.frame(); expect(level.bone.position.y).toBe(before);
  level.advance(20); stub.frame(); expect(level.bone.position.y - before).toBeCloseTo(0.02, 6);
});
it('rebases a pre-evaluated animation after asynchronous loading', async () => {
  const level = animatedTown(), before = level.bone.position.y;
  let resolve!: (value: unknown) => void;
  stub.build.mockReturnValue(new Promise(done => { resolve = done; }));
  app = mount(TownSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn() } }); await settle();
  level.advance(800); resolve(level); await settle();
  level.advance(20); stub.frame(); expect(level.bone.position.y - before).toBeCloseTo(0.02, 6);
});
