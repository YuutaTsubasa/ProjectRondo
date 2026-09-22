// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createInput } from '../../src/presentation/babylon/input';
import { createPlayer } from '../../src/presentation/babylon/playerController';
import type { FollowCamera } from '../../src/presentation/babylon/followCamera';
import type { Crystals } from '../../src/presentation/babylon/crystals';
const physics = vi.hoisted(() => ({ supported: true }));
vi.mock('@babylonjs/core/Physics/v2/characterController', async () => {
  const { Vector3 } = await import('@babylonjs/core/Maths/math.vector');
  return { CharacterSupportedState: { SUPPORTED: 2 }, PhysicsCharacterController: class {
    position: Vector3; velocity = Vector3.Zero();
    constructor(spawn: Vector3) { this.position = spawn.clone(); }
    checkSupport() { return { supportedState: physics.supported ? 2 : 0, averageSurfaceNormal: Vector3.Up() }; }
    getPosition() { return this.position; } setPosition(p: Vector3) { this.position.copyFrom(p); }
    getVelocity() { return this.velocity; } setVelocity(v: Vector3) { this.velocity.copyFrom(v); }
    integrate(dt: number) { this.position.addInPlace(this.velocity.scale(dt)); }
    dispose() {}
  } };
});
vi.mock('../../src/presentation/babylon/homingReticle', () => ({ createHomingReticle: () => ({ showAt() {}, hide() {} }) }));
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); physics.supported = true; });
const key = (type: string, key: string) => window.dispatchEvent(new KeyboardEvent(type, { key, cancelable: true }));
function rig(targets = [new Vector3(0,1,-1.5)]) {
  const engine = new NullEngine(); engine.getDeltaTime = () => 1000/60;
  const scene = new Scene(engine), root = new TransformNode('player', scene), input = createInput();
  const follow = { camera: { position: new Vector3(0,1,5), getTarget: () => new Vector3(0,1,0) }, planarBasis: () => ({ right: {x:1,y:0}, forward: {x:0,y:-1} }) } as unknown as FollowCamera;
  const flash = vi.fn();
  const player = createPlayer(scene, root, follow, input, { positions: targets, flash } as unknown as Crystals, new Vector3(0,1,0));
  const frame = () => scene.onBeforeRenderObservable.notifyObservers(scene);
  cleanup.push(() => { player.dispose(); input.dispose(); scene.dispose(); engine.dispose(); });
  return { player, frame, flash, input };
}
it('uses J for a grounded slash and flashes a crystal once, without jumping', () => {
  const r = rig(); key('keydown','j'); r.frame();
  expect(r.player.swordSeconds).toBe(0); expect(r.player.motion.homing).toBeNull(); expect(r.player.motion.velocity.y).toBeCloseTo(0);
  for(let i=0;i<35;i++) r.frame();
  expect(r.flash).toHaveBeenCalledTimes(1); expect(r.flash).toHaveBeenCalledWith(0);
  expect(r.player.swordSeconds).toBeNull();
});
it('keeps Space double jump independent of a target, then uses J for shield Homing', () => {
  const r = rig(); key('keydown',' '); r.frame();
  physics.supported = false; key('keyup',' '); r.frame(); key('keydown',' '); r.frame();
  expect(r.player.airJumped).toBe(true); expect(r.player.motion.velocity.y).toBe(9); expect(r.player.motion.homing).toBeNull();
  key('keyup',' '); r.frame(); key('keydown',' '); r.frame();
  expect(r.player.airJumped).toBe(false); expect(r.player.motion.velocity.y).toBeLessThan(9);
  key('keydown','j'); r.frame();
  expect(r.player.motion.homing).not.toBeNull(); expect(r.player.swordSeconds).toBeNull();
});
it('swings in mid-air with no target and clears action/contact state on respawn', () => {
  const r = rig([]); key('keydown',' '); r.frame(); physics.supported=false;
  key('keydown','j'); r.frame(); expect(r.player.swordSeconds).toBe(0);
  r.player.teleport(new Vector3(0,1,0)); physics.supported=true;
  expect(r.player.swordSeconds).toBeNull(); expect(r.player.airJumped).toBe(false); expect(r.player.homingBounced).toBe(false);
  key('keyup',' '); key('keydown',' '); r.frame();
  expect(r.player.motion.velocity.y).toBe(9);
});

it('gives airborne J priority even when Space requests a coyote jump on the same frame', () => {
  const r = rig(); r.frame(); physics.supported = false;
  key('keydown',' '); key('keydown','j'); r.frame();
  expect(r.player.motion.homing).not.toBeNull(); expect(r.player.swordSeconds).toBeNull();
  expect(r.player.airJumped).toBe(false);
});
