import { describe, expect, it } from 'vitest';
import { COURSE_GATES, COURSE_SPAWN, COURSE_KILL_Y, COURSE_PLATFORMS, COURSE_CRYSTALS, COURSE_JUMPS, COURSE_CHAINS } from '../../../src/domain/course/courseLayout';
import { MovementConstants as movement } from '../../../src/domain/hub/character/movementConstants';
import { selectHomingTarget } from '../../../src/domain/hub/character/homingTarget';
import { CAPSULE_HALF, CAPSULE_RADIUS, SPAWN_CLEARANCE } from '../../../src/presentation/babylon/capsule';
import { vec3 } from '../../../src/domain/math/vec3';

describe('Windward Ruins route', () => {
  it('gives every checkpoint and its respawn generous supported ground in forward order', () => {
    expect(COURSE_GATES.length).toBeGreaterThanOrEqual(4);
    expect(COURSE_SPAWN).toEqual(COURSE_GATES[0].spawn);
    for (const [i, gate] of COURSE_GATES.entries()) {
      const support = COURSE_PLATFORMS.find((p) => Math.abs(gate.center.x - p.center.x) + gate.halfWidth < p.width / 2 && Math.abs(gate.center.z - p.center.z) + gate.halfDepth < p.depth / 2);
      expect(support).toBeDefined();
      expect(gate.center.y).toBeCloseTo(support!.center.y + CAPSULE_HALF);
      expect(gate.spawn.y).toBeCloseTo(gate.center.y + SPAWN_CLEARANCE);
      expect(Math.abs(gate.spawn.x - support!.center.x) + CAPSULE_RADIUS).toBeLessThan(support!.width / 2);
      expect(Math.abs(gate.spawn.z - support!.center.z) + CAPSULE_RADIUS).toBeLessThan(support!.depth / 2);
      expect(gate.center.y - COURSE_KILL_Y).toBeGreaterThan(8);
      if (i) expect(gate.center.z).toBeGreaterThan(COURSE_GATES[i - 1].center.z);
    }
  });

  it('keeps running jumps reachable with capsule clearance, early takeoff, and a 25% speed margin', () => {
    expect(COURSE_JUMPS.length).toBeGreaterThanOrEqual(5);
    for (const [from, to] of COURSE_JUMPS) {
      const a = COURSE_PLATFORMS[from], b = COURSE_PLATFORMS[to];
      const gap = b.center.z - b.depth / 2 - (a.center.z + a.depth / 2);
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(3);
      const rise = b.center.y - a.center.y;
      const discriminant = movement.jumpSpeed ** 2 - 2 * movement.gravity * rise;
      expect(discriminant).toBeGreaterThan(0);
      const flight = (movement.jumpSpeed + Math.sqrt(discriminant)) / movement.gravity;
      const safeDistance = movement.runSpeed * 0.75 * flight;
      expect(gap + 2 * CAPSULE_RADIUS + 0.5).toBeLessThan(safeDistance);
      const overlap = Math.min(a.center.x + a.width / 2, b.center.x + b.width / 2) - Math.max(a.center.x - a.width / 2, b.center.x - b.width / 2);
      expect(overlap).toBeGreaterThan(4);
      expect(a.depth).toBeGreaterThan(6);
    }
  });

  it('offers forward selectable homing chains with reaction margins and an unobstructed endpoint landing', () => {
    expect(COURSE_CHAINS).toHaveLength(2);
    for (const chain of COURSE_CHAINS) {
      const launch = COURSE_PLATFORMS[chain.from], landing = COURSE_PLATFORMS[chain.to];
      let from = vec3(launch.center.x, launch.center.y + CAPSULE_HALF + 0.7, launch.center.z + launch.depth / 2 - 1);
      for (const index of chain.crystals) {
        const target = COURSE_CRYSTALS[index];
        expect(selectHomingTarget(from, vec3(0, 0, 1), COURSE_CRYSTALS, movement)).toBe(index);
        const distance = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
        expect(distance).toBeLessThan(movement.homingRange * 0.7);
        expect(distance / movement.homingSpeed).toBeLessThan(movement.homingMaxDuration * 0.7);
        // A player who waits a quarter-second after the bounce can still aim forward at the next jewel.
        from = vec3(target.x, target.y + movement.homingBounceSpeed * 0.25 - movement.gravity * 0.25 ** 2 / 2, target.z);
      }
      const end = COURSE_CRYSTALS[chain.crystals.at(-1)!];
      const toSafeLanding = Math.max(0, landing.center.z - landing.depth / 2 + CAPSULE_RADIUS + 0.5 - end.z);
      const drop = end.y - (landing.center.y + CAPSULE_HALF);
      const available = (movement.homingBounceSpeed + Math.sqrt(movement.homingBounceSpeed ** 2 + 2 * movement.gravity * drop)) / movement.gravity;
      const accelerationTime = movement.maxSpeed / movement.acceleration;
      const walkingDistance = movement.maxSpeed * (available - accelerationTime / 2);
      expect(toSafeLanding).toBeLessThan(walkingDistance);
      expect(Math.abs(end.x - landing.center.x)).toBeLessThan(landing.width / 2 - 2);
    }
  });
});
