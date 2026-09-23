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
import { COURSE_GATES } from '../../src/domain/course/courseLayout';
import CourseSession from '../../src/app/CourseSession.svelte';
const stub = vi.hoisted(() => ({ build: vi.fn(), disposeEngine: vi.fn(), frame: (() => {}) as () => void }));
vi.mock('../../src/presentation/babylon/courseScene', () => ({ createCourseScene: stub.build }));
vi.mock('@babylonjs/core/Engines/engine', () => ({ Engine: class {
  runRenderLoop(fn: () => void) { stub.frame = fn; }
  resize() {} getDeltaTime() { return 20; } dispose() { stub.disposeEngine(); }
} }));
let app: ReturnType<typeof mount> | undefined;
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
afterEach(async () => { if(app) await unmount(app); app=undefined; document.body.innerHTML=''; vi.clearAllMocks(); vi.restoreAllMocks(); });
function level() {
  let position = new Vector3(0, 1.14, 0);
  return { scene: { render: vi.fn(), resetLastAnimationTimeFrame: vi.fn() }, player: { airborne: false, motion: { facing: {x:0,y:1} }, root: { rotation: { y:0 } }, capsulePosition: () => position,
    teleport: vi.fn((to: Vector3) => { position=to; }) }, follow: { snap: vi.fn() }, suspendInput: vi.fn(), dispose: vi.fn(), set: (p: {x:number;y:number;z:number}) => {position=new Vector3(p.x,p.y,p.z);} };
}
it('pauses physics, resumes, respawns and resets a completed run without reloading the scene', async () => {
  const course=level(), ready=vi.fn(); stub.build.mockResolvedValue(course);
  app=mount(CourseSession,{target:document.body,props:{onReady:ready,onFailure:vi.fn(),onExit:vi.fn()}}); await settle();
  expect(ready).toHaveBeenCalledTimes(1);
  stub.frame(); expect(course.scene.render).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await settle();
  stub.frame(); expect(course.scene.render).toHaveBeenCalledTimes(1); expect(document.body.textContent).toContain('PAUSED');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await settle();
  course.set(COURSE_GATES[1].center); stub.frame(); await settle();
  course.set({x:0,y:-13,z:90}); stub.frame(); await settle();
  expect(course.player.teleport).toHaveBeenLastCalledWith(new Vector3(...Object.values(COURSE_GATES[1].spawn)));
  course.set(COURSE_GATES[2].center); stub.frame(); course.set(COURSE_GATES[3].center); stub.frame(); await settle();
  expect(document.body.textContent).toContain('STAGE CLEAR'); const frames=course.scene.render.mock.calls.length;
  stub.frame(); expect(course.scene.render).toHaveBeenCalledTimes(frames);
  [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('再玩一次'))!.click(); await settle();
  expect(stub.build).toHaveBeenCalledTimes(1); expect(document.body.textContent).not.toContain('STAGE CLEAR');
  expect(document.body.textContent).toContain('00:00'); expect(document.body.textContent).toContain('草坡起跑');
});
it('defers engine teardown until a pending course build is disposed after unmount', async () => {
  const course=level(), ready=vi.fn(), failure=vi.fn();
  let resolve!: (value: unknown) => void; stub.build.mockReturnValue(new Promise(r=>{resolve=r;}));
  app=mount(CourseSession,{target:document.body,props:{onReady:ready,onFailure:failure}}); await settle();
  await unmount(app); app=undefined;
  expect(stub.disposeEngine).not.toHaveBeenCalled();
  resolve(course); await settle();
  expect(course.dispose).toHaveBeenCalledTimes(1); expect(stub.disposeEngine).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
});

/** A real Babylon clip, driven by the mounted session's render callback. Pin only the clock;
 * constant-animation mode would hide the wall-clock jump this regression is intended to catch. */
function animatedLevel() {
  let now = 1000;
  vi.spyOn(PrecisionDate, 'Now', 'get').mockImplementation(() => now);
  const engine = new NullEngine();
  engine.getDeltaTime = () => 20;
  const scene = new Scene(engine);
  scene.activeCamera = new TargetCamera('camera', new Vector3(0, 0, -10), scene);
  const bone = new TransformNode('bone', scene);
  const animation = new Animation('jumpPose', 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT);
  animation.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
  const group = new AnimationGroup('jump', scene);
  group.addTargetedAnimation(animation, bone);
  group.start(false);
  // The builder has already evaluated a pose before it hands the scene to CourseSession.
  scene.render(); now += 20; scene.render();
  return {
    ...level(), scene, bone,
    advanceClock(ms: number) { now += ms; },
    dispose() { scene.dispose(); engine.dispose(); },
  };
}

it.each(['resume', 'restart', 'visibility'] as const)('excludes paused wall time from a real animation on %s', async (action) => {
  const course = animatedLevel();
  stub.build.mockResolvedValue(course);
  app = mount(CourseSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn() } });
  await settle();
  course.advanceClock(20); stub.frame();
  const before = course.bone.position.y;
  if (action === 'visibility') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
  } else {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
  await settle();
  course.advanceClock(800); stub.frame();
  expect(course.bone.position.y).toBe(before);
  if (action === 'restart') {
    [...document.querySelectorAll('button')].find(button => button.textContent?.includes('重新開始'))!.click();
  } else {
    if (action === 'visibility') vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
  await settle();
  course.advanceClock(20); stub.frame();
  expect(course.bone.position.y - before).toBeCloseTo(0.02, 6);
  expect(course.bone.position.y).toBeLessThan(0.1);
});

it('does not charge scene loading time to a clip evaluated before the course becomes ready', async () => {
  const course = animatedLevel();
  const before = course.bone.position.y;
  let resolve!: (value: unknown) => void;
  stub.build.mockReturnValue(new Promise(done => { resolve = done; }));
  app = mount(CourseSession, { target: document.body, props: { onReady: vi.fn(), onFailure: vi.fn() } });
  await settle();
  course.advanceClock(800);
  resolve(course); await settle();
  course.advanceClock(20); stub.frame();
  expect(course.bone.position.y - before).toBeCloseTo(0.02, 6);
});
