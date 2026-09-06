import { describe, it, expect } from 'vitest';
import { step, isHomingFrame } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { vec3, ZERO3, scale, sub } from '../../../../src/domain/math/vec3';
import { fromRaw } from '../../../../src/domain/kernel/normalizedPlanarDirection';
import { vec2 } from '../../../../src/domain/math/vec2';

const P = 6;
const AIRBORNE: CharacterMotion = { ...IDLE, isGrounded: false, velocity: vec3(0, -2, 0) };
const pressTowards = (offset: ReturnType<typeof vec3>): MovementInput => ({ ...NONE_INPUT, homingTarget: offset });

describe('homing dash', () => {
  it('does not start from the ground — the same press is an ordinary jump there', () => {
    const r = step(IDLE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).toBeNull();
  });

  it('starts when airborne and a target offset is supplied', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).not.toBeNull();
    // `HomingDash` carries only `elapsed` (see its doc comment) — check that, not a `remaining` this
    // interface no longer has.
    expect(r.homing!.elapsed).toBeCloseTo(1 / 60, 6);
  });

  it('travels at homingSpeed along the offset direction', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.velocity.z).toBeCloseTo(-C.homingSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.y).toBeCloseTo(0, P);
  });

  it('suspends gravity while dashing', () => {
    const dt = 1 / 60;
    const start = vec3(0, 0, -6);
    const dashing = step(AIRBORNE, pressTowards(start), C, dt);
    // Presentation re-supplies the live offset every frame the dash is in flight (see
    // presentation's `homingLock`) — never NONE_INPUT's null, which means "nothing to report" and ends
    // the dash. `HomingDash` carries only `elapsed` (see its doc comment), so track the closing offset
    // the same way presentation does: subtract however far this frame's own velocity would have
    // carried the capsule.
    const offset = sub(start, scale(dashing.velocity, dt));
    const next = step(dashing, pressTowards(offset), C, dt);
    // A plain airborne frame would subtract gravity*dt from velocity.y; a dash must not.
    expect(next.velocity.y).toBeCloseTo(0, P);
  });

  it('ignores steering input while dashing', () => {
    const dt = 1 / 60;
    const start = vec3(0, 0, -6);
    const dashing = step(AIRBORNE, pressTowards(start), C, dt);
    const offset = sub(start, scale(dashing.velocity, dt));
    const steered = step(dashing, { ...pressTowards(offset), direction: fromRaw(vec2(1, 0)) }, C, dt);
    expect(steered.velocity.x).toBeCloseTo(0, P);
    expect(steered.velocity.z).toBeCloseTo(-C.homingSpeed, P);
  });

  it('bounces straight up on arrival and clears the dash', () => {
    // One frame long enough to cover the whole 6-unit offset, short enough to stay under
    // homingMaxDuration (0.6s) so the timeout does not also fire on this frame — see the
    // pre-flight correction to this brief.
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 0.3);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
    expect(r.isGrounded).toBe(false);
  });

  it('aborts at homingMaxDuration and lets gravity resume — target too far to reach in time, but the offset genuinely keeps shrinking', () => {
    // A target far outside `homingRange` cannot really be selected in play, but the domain does not
    // know that; this checks the timeout still fires for an honestly-closing dash that simply cannot
    // finish in 0.6s. Presentation would supply this by re-deriving the offset each frame from world
    // position; simulated here by tracking the offset locally and subtracting each frame's own
    // velocity*dt from it — `HomingDash` itself no longer carries `direction`/`remaining` to read back.
    const dt = 1 / 60;
    let offset = vec3(0, 0, -1000);
    let m: CharacterMotion = step(AIRBORNE, pressTowards(offset), C, dt);
    for (let i = 0; i < 200 && m.homing; i++) {
      offset = sub(offset, scale(m.velocity, dt));
      m = step(m, pressTowards(offset), C, dt);
    }
    expect(m.homing).toBeNull();
    const falling = step(m, NONE_INPUT, C, dt);
    expect(falling.velocity.y).toBeLessThan(0);
  });

  it('aborts at homingMaxDuration when the supplied offset stops shrinking — a capsule blocked by terrain', () => {
    // This is the case that was impossible before the fix: dead reckoning always resolved "arrival"
    // within homingRange / homingSpeed = 0.5s, strictly before homingMaxDuration's 0.6s, so a blocked
    // dash bounced off the obstacle instead of timing out. A frozen live offset — the capsule pinned
    // against a wall while the target it can't reach stays put — must now reach the timeout instead.
    const BLOCKED_OFFSET = vec3(0, 0, -6);
    let m: CharacterMotion = step(AIRBORNE, pressTowards(BLOCKED_OFFSET), C, 1 / 60);
    expect(m.homing).not.toBeNull(); // sanity: the dash actually started
    for (let i = 0; i < 200 && m.homing; i++) m = step(m, pressTowards(BLOCKED_OFFSET), C, 1 / 60);
    expect(m.homing).toBeNull();
    expect(m.velocity.x).toBeCloseTo(0, P);
    expect(m.velocity.y).toBeCloseTo(0, P); // aborted, not bounced — no (0, homingBounceSpeed, 0)
    expect(m.velocity.z).toBeCloseTo(0, P);

    const falling = step(m, NONE_INPUT, C, 1 / 60);
    expect(falling.velocity.y).toBeLessThan(0); // gravity resumed
  });

  it('still arrives and bounces when the offset keeps shrinking across several frames — the normal path is unchanged', () => {
    const dt = 1 / 60;
    let offset = vec3(0, 0, -6);
    let m: CharacterMotion = step(AIRBORNE, pressTowards(offset), C, dt);
    for (let i = 0; i < 200 && m.homing; i++) {
      offset = sub(offset, scale(m.velocity, dt));
      m = step(m, pressTowards(offset), C, dt);
    }
    expect(m.homing).toBeNull();
    expect(m.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
    expect(m.velocity.x).toBeCloseTo(0, P);
    expect(m.velocity.z).toBeCloseTo(0, P);
    expect(m.isGrounded).toBe(false);
  });

  it('ends the dash safely, not on stale data, when a frame supplies no offset mid-dash', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const lost = step(dashing, NONE_INPUT, C, 1 / 60);
    expect(lost.homing).toBeNull();
    expect(lost.velocity).toEqual(vec3(0, 0, 0));
  });

  it('does not restart the dash from scratch when the live offset changes frame to frame — it corrects course instead', () => {
    // Spec §4: the dash is genuinely homing now, not a straight line fixed at entry. A new offset next
    // frame steers it; it must not be treated as a fresh press (which would reset `elapsed` to 0).
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const redirected = step(dashing, pressTowards(vec3(6, 0, 0)), C, 1 / 60);
    expect(redirected.homing).not.toBeNull();
    expect(redirected.homing!.elapsed).toBeGreaterThan(dashing.homing!.elapsed);
    expect(redirected.velocity.x).toBeCloseTo(C.homingSpeed, P);
    expect(redirected.velocity.z).toBeCloseTo(0, P);
  });

  it('can chain: after a bounce a new press starts a new dash', () => {
    const bounced = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 0.3);
    const again = step(bounced, pressTowards(vec3(0, 6, 0)), C, 1 / 60);
    expect(again.homing).not.toBeNull();
    expect(again.velocity.y).toBeCloseTo(C.homingSpeed, P);
  });

  it('does nothing when the press comes with no target', () => {
    const r = step(AIRBORNE, NONE_INPUT, C, 1 / 60);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeLessThan(0); // still just falling
  });

  it('bounces immediately on a zero-length offset at entry, agreeing with the same offset arriving mid-dash', () => {
    // Entry is not filtered for a zero-length offset, so it agrees with `stepHoming`'s handling of the
    // same offset reached mid-flight: both arrive and bounce, rather than an entry-frame zero silently
    // degrading into an ordinary jump.
    const r = step(AIRBORNE, pressTowards(ZERO3), C, 1 / 60);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
  });

  it('turns facing to the planar projection of a sideways dash direction', () => {
    const r = step(AIRBORNE, pressTowards(vec3(6, 0, 0)), C, 1 / 60);
    expect(r.facing.x).toBeCloseTo(1, P);
    expect(r.facing.y).toBeCloseTo(0, P);
  });

  it('leaves facing unchanged for a straight-up dash, whose planar projection is zero', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 6, 0)), C, 1 / 60);
    expect(r.facing).toEqual(AIRBORNE.facing);
  });
});

// Presentation cannot always tell that a dash ran by looking at what `step` returned, so it asks
// beforehand instead. These pin the cases where the two answers differ.
describe('isHomingFrame', () => {
  it('is false on the ground, where the same press is an ordinary jump', () => {
    expect(isHomingFrame(IDLE, pressTowards(vec3(0, 0, -6)))).toBe(false);
  });

  it('is false airborne with no target to fly to', () => {
    expect(isHomingFrame(AIRBORNE, NONE_INPUT)).toBe(false);
  });

  it('is true for a dash already in flight, whatever this frame supplies', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(dashing.homing).not.toBeNull();
    expect(isHomingFrame(dashing, NONE_INPUT)).toBe(true);
  });

  it('is true for a dash that starts AND arrives inside one frame — the case the result cannot show', () => {
    // `homingSpeed * delta` covers the whole offset, so `step` returns `homing: null` and the bounce
    // velocity together: nothing downstream can see that a dash happened. This is reachable in play —
    // `homingSpeed * MAX_DT` is 0.8 units and a crystal's own extent is 1.273 — so the two consumers
    // that must not miss the bounce, the crystal flash and the solver's climb routing, read this
    // predicate instead of the result. The trail and the Flying Kick pose are deliberately not among
    // them: they run off `motion.homing`, which this dash never raises.
    const input = pressTowards(vec3(0, 0, -0.1));
    expect(isHomingFrame(AIRBORNE, input)).toBe(true);
    const r = step(AIRBORNE, input, C, 1 / 60);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
  });
});
