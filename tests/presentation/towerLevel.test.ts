import { describe, it, expect, vi } from 'vitest';
import { CAPSULE_HALF, CAPSULE_RADIUS } from '../../src/presentation/babylon/capsule';
import { PEDESTAL_HEIGHT } from '../../src/presentation/babylon/pedestal';
import { DEFAULT_CONFIG } from '../../src/domain/hub/character/movementConfig';

/**
 * `towerLevel.ts` runs `auditLayout` over the layout it generates at import time and warns on
 * anything the level's own rules forbid. That check is only worth having if something notices when it
 * starts speaking, and a console warning during a browser session is not that: the tower is built
 * behind a mode transition and the message names a constant rather than a symptom.
 *
 * So the module is imported once here, with `console.warn` captured from before the import, and the
 * warnings are asserted to be empty. Every rule the audit knows is covered by this one assertion, and
 * a warning it cannot yet make is a gap in the audit rather than in this file.
 */
const importTowerLevel = async () => {
  // The audit runs in the module body, so a cached module is a module whose audit has already been
  // and gone; every import here has to be a fresh execution or only the first would be checking it.
  vi.resetModules();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const level = await import('../../src/presentation/babylon/towerLevel');
    return { level, warnings: warn.mock.calls.map((call) => String(call[0])) };
  } finally {
    warn.mockRestore();
  }
};

describe('the tower layout', () => {
  it('passes its own audit', async () => {
    const { warnings } = await importTowerLevel();
    expect(warnings).toEqual([]);
  });

  it('leaves every platform-to-platform jump clear of the column', async () => {
    const { level } = await importTowerLevel();
    const platforms = level.TOWER_PLATFORMS;
    // Which transitions are jumps is reconstructed here from the heights rather than taken from the
    // layout, so this asserts the rule against the tower that shipped rather than against the same
    // list `auditLayout` was handed. The threshold is the jump apex itself — `jumpSpeed²/(2·gravity)`
    // = 1.6875 u, the most a jump can gain from the domain's own constants — rather than a round
    // number near it, so a link whose rise was retuned down could not be reclassified as a jump
    // without it genuinely becoming jumpable. The pad that catches section 2's chain stands 24 u
    // above the platform before it, and section 3's links 7.2 u; neither is one.
    const apex = (DEFAULT_CONFIG.jumpSpeed * DEFAULT_CONFIG.jumpSpeed) / (2 * DEFAULT_CONFIG.gravity);
    const pairs = platforms.map((to, i) => [platforms[i - 1], to] as const).slice(1);
    const jumps = pairs.filter(([from, to]) => to.y - from.y <= apex);
    expect(jumps.length).toBeGreaterThan(0);
    // A pair that is NOT a jump has to be a link, or classifying by rise would let a step that grew
    // past the apex fall out of the list above and be asserted about by nothing — which is how this
    // test passed a section 1 whose rise was never checked against the apex at all. A link ends on
    // the pad its bounce lands on, and BOUNCE_RISE puts that pad level with its crystal, so the only
    // pairs allowed to exceed the apex are the ones landing at a crystal's own height.
    for (const [from, to] of pairs) {
      if (to.y - from.y <= apex) continue;
      expect(level.TOWER_CRYSTALS.some((c) => Math.abs(c.y - to.y) < 1e-9)).toBe(true);
    }
    for (const [from, to] of jumps) {
      // Both ends sit at the same orbit one turn apart, so the chord's nearest approach to the
      // column's axis is its own midpoint. The capsule's edge reaches CAPSULE_RADIUS further in.
      const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      expect(Math.hypot(mid.x, mid.z) - CAPSULE_RADIUS).toBeGreaterThan(level.TOWER_COLUMN_RADIUS);
    }
  });

  it('embeds every ledge in the column rather than leaving it floating beside it', async () => {
    const { level } = await importTowerLevel();
    // The other bound on the orbit, and the one that pulls the opposite way from the column-clearance
    // test above: a slab faces the column, so its inner edge is a straight line at `orbit − depth/2`
    // from the axis, and that line has to fall inside the column for the ledge to hang off anything.
    for (const ledge of level.TOWER_PLATFORMS) {
      expect(Math.hypot(ledge.x, ledge.z) - ledge.depth / 2)
        .toBeLessThanOrEqual(level.TOWER_COLUMN_RADIUS);
    }
  });

  it('leaves the summit pedestal clear of the last bounce landing', async () => {
    const { level } = await importTowerLevel();
    const balcony = level.TOWER_PLATFORMS[level.TOWER_PLATFORMS.length - 1];
    // The bounce rises on the balcony's own bearing and steers straight in, so every landing it can
    // reach is on the line from the balcony's centre out towards its crystal. The pedestal has to
    // clear the whole of that line by the capsule's own radius — see SUMMIT_PEDESTAL_OFFSET.
    const centreLine = { x: balcony.x - level.TOWER_SUMMIT.x, z: balcony.z - level.TOWER_SUMMIT.z };
    const radial = { x: Math.sin(balcony.rotationY), z: Math.cos(balcony.rotationY) };
    const alongLine = centreLine.x * radial.x + centreLine.z * radial.z;
    const offLine = Math.hypot(centreLine.x - alongLine * radial.x, centreLine.z - alongLine * radial.z);
    expect(offLine).toBeGreaterThanOrEqual(level.TOWER_SUMMIT_RADIUS + CAPSULE_RADIUS);
  });

  it('stands the pedestal on the balcony rather than off its end', async () => {
    const { level } = await importTowerLevel();
    const balcony = level.TOWER_PLATFORMS[level.TOWER_PLATFORMS.length - 1];
    const face = { x: Math.cos(balcony.rotationY), z: -Math.sin(balcony.rotationY) };
    const offset = { x: level.TOWER_SUMMIT.x - balcony.x, z: level.TOWER_SUMMIT.z - balcony.z };
    const along = Math.abs(offset.x * face.x + offset.z * face.z);
    expect(along + level.TOWER_SUMMIT_RADIUS).toBeLessThanOrEqual(balcony.width / 2);
  });

  it('puts the summit pedestal on the balcony it is generated from', async () => {
    const { level } = await importTowerLevel();
    const balcony = level.TOWER_PLATFORMS[level.TOWER_PLATFORMS.length - 1];
    expect(level.TOWER_SUMMIT.y).toBeCloseTo(balcony.y + PEDESTAL_HEIGHT, 10);
  });

  it('starts the player on the bearing of the first step, not of the spiral', async () => {
    const { level } = await importTowerLevel();
    const firstStep = level.TOWER_PLATFORMS[0];
    const spawnBearing = Math.atan2(level.TOWER_SPAWN.z, level.TOWER_SPAWN.x);
    const stepBearing = Math.atan2(firstStep.z, firstStep.x);
    expect(spawnBearing).toBeCloseTo(stepBearing, 10);
    // And outside the spiral, so the whole of it is in front of the player rather than overhead.
    expect(Math.hypot(level.TOWER_SPAWN.x, level.TOWER_SPAWN.z))
      .toBeGreaterThan(Math.hypot(level.TOWER_CRYSTALS[0].x, level.TOWER_CRYSTALS[0].z));
  });

  it('spawns the capsule just above the floor rather than in it', async () => {
    const { level } = await importTowerLevel();
    expect(level.TOWER_SPAWN.y).toBeGreaterThan(level.TOWER_FLOOR_Y + CAPSULE_HALF);
  });
});
