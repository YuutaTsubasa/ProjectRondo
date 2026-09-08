import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { vec3, type Vec3 } from '../../domain/math/vec3';
import type { TowerCheckpoint } from '../../domain/hub/tower/towerProgress';
import { CAPSULE_HALF, CAPSULE_HEIGHT, CAPSULE_RADIUS } from './capsule';

/**
 * The climbing tower, as data.
 *
 * **Every number in this file is Untuned.** Nobody has climbed this tower — not one platform of it —
 * so nothing here is a measurement. What each number *is* is the output of a rule, and the rules are
 * the part worth arguing with; each is stated on the group it shaped, together with the shipped
 * constant that bounds it. Retune a rule and let the numbers fall out, rather than nudging a
 * coordinate and leaving the rule that produced it saying something else.
 *
 * The two rules everything hangs off, both from the design spec §3:
 *
 * - **A jump gains at most {@link JUMP_RISE}.** The apex is `jumpSpeed²/(2·gravity)` = 9²/48 =
 *   **1.6875 u** (`movementConstants.ts`), so 1.4 leaves 0.29 u of margin for a missed landing.
 * - **A homing link gains 6–8 u comfortably.** Bounded by `homingRange` 12 and the 35° cone, and a
 *   crystal may sit directly overhead. Both kinds of link here land inside that band: 6.0 u in
 *   section 2, 7.2 u in section 3.
 *
 * The sections are matched on play TIME, not on height (spec §3), which is why they are 18, 24 and
 * 20 units tall for roughly one stretch of play each: ~13 jump steps buys the minute that ~4
 * crystals do.
 *
 * **Two more rules are not in the spec, and were found the hard way** — by generating a layout,
 * measuring it, and finding it unplayable. They are the reason {@link auditLayout} exists: a
 * coordinate that satisfies them by luck stops satisfying them the moment somebody moves it.
 *
 * - **A slab must not overhang a slab you can stand on.** A jump step is 1.4 u and a slab is 0.4 u
 *   thick, so the headroom over a ledge is 1.0 u against a capsule {@link CAPSULE_HEIGHT} 2 u tall.
 *   Anything overhead is not scenery, it is a lid. This is what fixes the spiral's turn rate and slab
 *   size together (see {@link TURN_DEGREES}), and what made the first draft's wider checkpoint pads
 *   impossible.
 * - **A bounce rises straight up.** So a crystal has to sit clear of the pad its bounce lands on —
 *   see {@link BOUNCE_REACH}, which the second draft got wrong in the other direction.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Section boundaries — spec §3's Untuned heights. Everything below is laid out between them.
// ---------------------------------------------------------------------------------------------

/** The tower's floor: the plane the character rig's `flatGround` answers with, and the surface
 *  section 1's checkpoint stands on. Zero, because a tower that starts at zero is a tower whose
 *  heights read as heights. */
export const TOWER_FLOOR_Y = 0;
/** Section 2 (the homing chain) begins here — 18 u of platform jumping below it. */
const SECTION_2_START = 18;
/** Section 3 (mixed) begins here — 24 u of chain below it. */
const SECTION_3_START = 42;
/** The summit balcony's top face — 20 u of mixed climbing below it. */
const SUMMIT_Y = 62;

// ---------------------------------------------------------------------------------------------
// The shape the climb spirals around
// ---------------------------------------------------------------------------------------------

/**
 * The white column's radius. **Untuned**: 3.2 u is a guess at "wide enough to read as the thing you
 * are climbing rather than a pole, narrow enough that the camera is not permanently inside it". The
 * second half of that is not satisfied and cannot be by this number alone — `followCamera` orbits at
 * `distance` 5 with no obstruction handling at all (spec §13.2), so a player standing at
 * {@link PLATFORM_ORBIT} 4.2 puts the camera inside any column whenever they face outward. Spec
 * §13.3 carries that as budgeted camera work; this radius only decides how often it bites.
 */
export const TOWER_COLUMN_RADIUS = 3.2;
/** How far above the floor the column rises. **Untuned**: {@link SUMMIT_Y} plus 4 u, so there is
 *  still column above you when you arrive and the summit reads as *near* the top rather than as the
 *  end of the geometry. */
export const TOWER_COLUMN_HEIGHT = SUMMIT_Y + 4 - TOWER_FLOOR_Y;
/** The solid floor at the base (spec §4). **Untuned**: 14 u of radius is the spiral's widest outer
 *  point (~6.9 u, a crystal) roughly doubled, so there is floor under every platform and room to
 *  stand off the tower and look up at it. It is not the safety net — {@link TOWER_FALL_MARGIN} is —
 *  it is what a fall visibly ends against. */
export const TOWER_FLOOR_RADIUS = 14;
/** Thickness of the floor slab and of every platform, so both read as slabs rather than as planes.
 *  It is not free: it is what a platform steals from the headroom of the one below it. */
export const TOWER_SLAB_THICKNESS = 0.4;

/**
 * Distance from the column's axis to a platform's CENTRE. **Untuned**, but not free: it is chosen so
 * that a platform meets the column instead of floating beside it. Every slab is turned to face the
 * column (see {@link TowerPlatform}), so its inner face is a straight edge at `4.2 − 1.2` = 3.0 u
 * from the axis — 0.2 u inside {@link TOWER_COLUMN_RADIUS}, so the ledge is embedded rather than
 * bridged to. (Its inner *corners* stand 0.15 u proud of the curve; a capsule 1 u wide cannot fall
 * through a 0.15 u crescent.)
 */
const PLATFORM_ORBIT = 4.2;
/** Every ordinary platform is a square this far across. **Untuned**: 2.4 is a guess at "forgives a
 *  missed landing" against a capsule 1 u wide, and it is also as wide as the headroom rule allows at
 *  {@link TURN_DEGREES} — the two checkpoint pads are this size too, for that reason and not by
 *  preference. */
const PLATFORM_SIZE = 2.4;
/** The summit balcony is wider ALONG the column's face — spec §2 asks for the top to be a place, not
 *  a ledge, and nothing stands within 7 u above it for the headroom rule to catch. **Untuned**: 4.4
 *  tangentially. Its radial depth stays {@link PLATFORM_SIZE}, because the summit is reached by a
 *  bounce and {@link BOUNCE_REACH} caps how deep a landing pad may be. */
const SUMMIT_PAD_WIDTH = 4.4;

// ---------------------------------------------------------------------------------------------
// The movement rules the layout is generated from
// ---------------------------------------------------------------------------------------------

/** Height a jump step gains. **Untuned**: 1.4 against the 1.6875 u apex, i.e. 0.29 u of margin. */
const JUMP_RISE = 1.4;

/**
 * Degrees around the column per step and per link alike. **Untuned**: 60° puts the spiral on six
 * faces, which is what lets the column answer "which face am I on" (spec §2), and section 1 makes
 * 2.2 turns of it.
 *
 * It is the headroom rule in this file's header that fixes it this wide, together with
 * {@link PLATFORM_SIZE}. Two slabs one turn apart are `2·4.2·sin(30°)` = 4.20 u between centres, and
 * the widest separating axis (the lower slab's tangential one) leaves **0.80 u** between their
 * footprints — comfortably more than the capsule's own {@link CAPSULE_RADIUS} 0.5, so no ledge has an
 * unstandable strip along its edge. At 45° the same slabs *overlap* by 0.17 u and every ledge in
 * section 1 loses its outer edge, which is how this number was arrived at rather than by feel.
 *
 * A gap is not only headroom, it is also the jump: 0.80 u is crossed comfortably inside the 1.24 u a
 * walking player (`maxSpeed` 4) covers during the 0.31 s they spend above +1.4 u, and trivially
 * inside a runner's 2.48 u. Widening this further starts to cost that margin.
 */
const TURN_DEGREES = 60;

/**
 * How far outboard of its landing pad a bounce's crystal sits. **Untuned, and derived rather than
 * chosen**, because the bounce is *purely vertical*: `stepHoming` returns
 * `velocity = (0, homingBounceSpeed, 0)` on arrival, discarding the dash's horizontal speed entirely,
 * so the player leaves the crystal going straight up and has to steer onto the pad under air control
 * alone (`acceleration` 13, capped at `maxSpeed` 4 walking).
 *
 * Two bounds, and 2.1 is the room between them:
 *
 * - **Not less than 1.7**, or the rising capsule hits the pad instead of clearing it: the pad's
 *   radial edge is `PLATFORM_SIZE/2` = 1.2 out and the capsule is {@link CAPSULE_RADIUS} 0.5 wide.
 *   This bound is why a landing pad may not be deeper than {@link PLATFORM_SIZE}, the summit balcony
 *   included, and it is what the first draft of this layout got wrong — a 2.0 u reach against a 3.6 u
 *   pad put every chain's last bounce under the slab it was aimed at.
 * - **Not more than ~2.4**, or a walking player cannot cross it. The pad's top is level with its
 *   crystal ({@link BOUNCE_RISE}), so the player has the bounce's whole 0.75 s of airtime above pad
 *   height, in which air control covers 2.38 u walking and 3.54 u running.
 *
 * If a chain's last bounce feels like a scramble, this is the number, and those two bounds are what
 * to redo — not the crystal's height.
 */
const BOUNCE_REACH = 2.1;
/**
 * How far above its crystal the pad that catches a bounce sits: **level with it, deliberately**. Zero
 * costs no height, because what a link gains is the crystal's height and not the bounce's, and it
 * buys the whole 0.75 s of airtime for the sideways drift {@link BOUNCE_REACH} needs. A positive
 * value spends that airtime twice — an earlier draft's 1.2 u left only 0.19–2.19 u of reach, which no
 * value of {@link BOUNCE_REACH} satisfies against both of its bounds at once.
 */
const BOUNCE_RISE = 0;
/** Distance from the axis to a crystal — {@link BOUNCE_REACH} outboard of the platform orbit, by
 *  construction rather than by choice. Putting the chain crystals on that same orbit keeps them on
 *  one spiral with the landing ones, and leaves every crystal 2.5 u clear of the column's surface. */
const CRYSTAL_ORBIT = PLATFORM_ORBIT + BOUNCE_REACH;

/** How far above a surface a respawn point sits. **Untuned**, but its direction is measured: spec
 *  §13.1 found a capsule teleported 3 u BELOW a surface is lost through the one-sided collider
 *  outright, while open air and "0.3 u above" both settle cleanly. So checkpoints are points in open
 *  air above their platform, never points on it — the same +0.3 the hub's spawn uses. */
const RESPAWN_LIFT = 0.3;

/**
 * Where a fall stops counting as a step down. **Untuned**: 4 u is a guess at "deeper than any
 * deliberate drop between platforms, shallower than a fall that would hang before resolving".
 * Nobody has felt either edge — see the design spec §4.
 */
export const TOWER_FALL_MARGIN = 4;

// ---------------------------------------------------------------------------------------------
// The layout, generated from the rules above
// ---------------------------------------------------------------------------------------------

/**
 * A platform slab. `y` is its TOP face — the height the player stands at, and the height every rule
 * above is written in; the scene sinks the box by {@link TOWER_SLAB_THICKNESS} to place it.
 *
 * `rotationY` is not decoration. Turning each slab to face the column is what makes `width` mean
 * "along the column's face" and `depth` mean "away from it", and those are the two directions every
 * rule here is stated in: {@link BOUNCE_REACH} is bounded by the depth, {@link TURN_DEGREES} by the
 * width. An unturned square reaches 1.2 u from its centre along an axis but 1.70 u at its corner, so
 * on an unturned spiral the gap between neighbours changed with the bearing — 0.37 u at one bearing
 * and a 0.23 u *overlap* at another, which the header's headroom rule makes unplayable.
 */
export interface TowerPlatform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Radians about Y. Turns the slab's local +Z to point radially outward from the column's axis. */
  readonly rotationY: number;
}

/** A point on the spiral: `bearing` in degrees around the column's axis, `orbit` out from it. */
const at = (orbit: number, bearing: number, y: number): Vec3 =>
  vec3(orbit * Math.cos(bearing * DEG), y, orbit * Math.sin(bearing * DEG));

/** Babylon's Y rotation sends local +Z to world `(sin r, cos r)`, so `r = 90° − bearing` points it
 *  straight out from the axis and leaves local +X running along the column's face. */
const slab = (bearing: number, y: number, width: number): TowerPlatform => {
  const spot = at(PLATFORM_ORBIT, bearing, y);
  return { x: spot.x, y: spot.y, z: spot.z, width, depth: PLATFORM_SIZE, rotationY: (90 - bearing) * DEG };
};

/** Jump steps in section 1. **Untuned**: 13, because 18 u at {@link JUMP_RISE} needs at least 12.9 of
 *  them, and 13 puts the per-step rise at 18/13 = **1.3846 u** — just inside the rule rather than
 *  exactly on it. Spec §3's own estimate for this section is "~13 steps". */
const SECTION_1_STEPS = 13;
/** Homing links in section 2. **Untuned**: 4, spec §3's "~4 crystals", which over 18 → 42 puts the
 *  rise per link at exactly **6.0 u** — the bottom of the spec's 6–8 band. */
const SECTION_2_LINKS = 4;
/** Section 3's alternation: two jump steps, a link, two jump steps, a link onto the summit.
 *  **Untuned**: the counts are what fit two links inside 20 u while leaving both in the 6–8 band —
 *  `2·1.4 + gain + 2·1.4 + gain = 20` gives **7.2 u** each. The alternation, not the counts, is what
 *  spec §2 asks for; the section ends on a dash because a bounce is the only approach a balcony wider
 *  than a step can be reached by — a jump would need the balcony to overhang the ledge it is jumped
 *  from. */
const SECTION_3_STEPS_PER_RUN = 2;
const SECTION_3_LINKS = 2;

/** Bearing the spiral starts at. Arbitrary, and the one number here with no rule behind it: it only
 *  decides which way the tower faces, and {@link TOWER_SPAWN} is put on the same bearing so the
 *  player starts looking at the first step. */
const SPIRAL_START_DEGREES = 0;

interface TowerLayout {
  readonly platforms: readonly TowerPlatform[];
  readonly crystals: readonly Vec3[];
  /** The pads the checkpoints stand on, in section order (section 2's, then section 3's). */
  readonly checkpointPads: readonly TowerPlatform[];
  readonly summit: TowerPlatform;
  /** `[crystal, the pad its bounce lands on]` for every link that ends on a platform — the pairs
   *  {@link auditLayout} checks {@link BOUNCE_REACH} against. */
  readonly bounceLandings: readonly (readonly [Vec3, TowerPlatform])[];
}

/**
 * Walks the spiral once, in climb order, applying the rules above. Written as a walk rather than as a
 * table of coordinates on purpose: a table is a set of numbers with the reasoning deleted, and every
 * number in this layout is a consequence of something. Retune a rule and the tower moves with it.
 */
function buildLayout(): TowerLayout {
  const platforms: TowerPlatform[] = [];
  const crystals: Vec3[] = [];
  const bounceLandings: (readonly [Vec3, TowerPlatform])[] = [];
  let bearing = SPIRAL_START_DEGREES;

  /** A link that ends on a platform: a crystal `rise` above the last standing height, and the pad its
   *  bounce lands on, one {@link BOUNCE_REACH} inboard of it. Returns the new standing height. */
  const link = (fromY: number, rise: number, padWidth: number): number => {
    bearing += TURN_DEGREES;
    const crystal = at(CRYSTAL_ORBIT, bearing, fromY + rise);
    const pad = slab(bearing, crystal.y + BOUNCE_RISE, padWidth);
    crystals.push(crystal);
    platforms.push(pad);
    bounceLandings.push([crystal, pad]);
    return pad.y;
  };

  // Section 1 — pure platform jumping, floor to 18. The rise is written as a fraction of the whole
  // section rather than as a repeated addition, so the last step lands on SECTION_2_START exactly.
  for (let i = 1; i <= SECTION_1_STEPS; i++) {
    bearing += TURN_DEGREES;
    platforms.push(slab(bearing, TOWER_FLOOR_Y + ((SECTION_2_START - TOWER_FLOOR_Y) * i) / SECTION_1_STEPS, PLATFORM_SIZE));
  }
  const section2Pad = platforms[platforms.length - 1];

  // Section 2 — the homing chain, 18 to 42. Only the LAST link ends on a platform; the three before
  // it end on the next crystal, which is what makes the section a chain rather than four hops.
  const chainRise = (SECTION_3_START - SECTION_2_START) / SECTION_2_LINKS;
  for (let i = 1; i < SECTION_2_LINKS; i++) {
    bearing += TURN_DEGREES;
    crystals.push(at(CRYSTAL_ORBIT, bearing, SECTION_2_START + chainRise * i));
  }
  link(SECTION_2_START + chainRise * (SECTION_2_LINKS - 1), chainRise, PLATFORM_SIZE);
  const section3Pad = platforms[platforms.length - 1];

  // Section 3 — mixed, 42 to 62: two steps, a link, two steps, a link onto the summit.
  const linkRise =
    (SUMMIT_Y - SECTION_3_START - SECTION_3_LINKS * SECTION_3_STEPS_PER_RUN * JUMP_RISE) / SECTION_3_LINKS;
  let y = SECTION_3_START;
  for (let i = 0; i < SECTION_3_LINKS; i++) {
    for (let step = 0; step < SECTION_3_STEPS_PER_RUN; step++) {
      bearing += TURN_DEGREES;
      y += JUMP_RISE;
      platforms.push(slab(bearing, y, PLATFORM_SIZE));
    }
    const last = i === SECTION_3_LINKS - 1;
    y = link(y, linkRise, last ? SUMMIT_PAD_WIDTH : PLATFORM_SIZE);
  }
  const summit = platforms[platforms.length - 1];

  return { platforms, crystals, checkpointPads: [section2Pad, section3Pad], summit, bounceLandings };
}

/** World-space local axes of a slab: `[along the column's face, away from it]`. */
const axesOf = (p: TowerPlatform) => [
  { x: Math.cos(p.rotationY), z: -Math.sin(p.rotationY), half: p.width / 2 },
  { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY), half: p.depth / 2 },
];

/** How far a slab reaches from its centre along `axis` — the support function, not the face distance.
 *  Getting those two confused is what produced a layout whose slabs overlapped while its arithmetic
 *  said they were 0.4 u apart. */
const reachAlong = (p: TowerPlatform, axis: { x: number; z: number }): number =>
  axesOf(p).reduce((sum, a) => sum + Math.abs(a.x * axis.x + a.z * axis.z) * a.half, 0);

/**
 * The two rules from this file's header, checked against the layout that was actually generated
 * rather than against the prose that produced it. Both were violated by drafts of this file, and
 * neither shows up as anything but a level that plays wrong.
 *
 * The slab test is a separating-axis one over the four face normals: the largest gap it finds is a
 * lower bound on the true distance between two rectangles, so passing it is conclusive and failing it
 * is a warning worth looking at rather than proof.
 *
 * It warns rather than throws: a tower with one bad ledge is still worth loading and looking at, and
 * an error thrown here would take the whole scene down at import time.
 */
function auditLayout({ platforms, bounceLandings }: TowerLayout): void {
  for (const [crystal, pad] of bounceLandings) {
    // The crystal is directly outboard of the pad's centre, so the radial edge is the nearest one.
    const clearance = Math.hypot(crystal.x - pad.x, crystal.z - pad.z) - pad.depth / 2;
    if (clearance < CAPSULE_RADIUS) {
      console.warn(`[towerLevel] the bounce at y=${crystal.y} rises into its own landing pad — ${clearance.toFixed(2)} u of room for a ${CAPSULE_RADIUS} u capsule. See BOUNCE_REACH.`);
    }
  }
  for (const below of platforms) {
    for (const above of platforms) {
      if (above === below || above.y <= below.y) continue;
      if (above.y - TOWER_SLAB_THICKNESS >= below.y + CAPSULE_HEIGHT) continue; // clears the capsule
      const offset = { x: above.x - below.x, z: above.z - below.z };
      const gap = [...axesOf(below), ...axesOf(above)].reduce(
        (widest, axis) =>
          Math.max(widest, Math.abs(offset.x * axis.x + offset.z * axis.z) - reachAlong(below, axis) - reachAlong(above, axis)),
        -Infinity,
      );
      if (gap < CAPSULE_RADIUS) {
        console.warn(`[towerLevel] the slab at y=${above.y} overhangs the one at y=${below.y} (gap ${gap.toFixed(2)} u), which has only ${(above.y - TOWER_SLAB_THICKNESS - below.y).toFixed(2)} u of headroom for a ${CAPSULE_HEIGHT} u capsule. See TURN_DEGREES.`);
      }
    }
  }
}

const layout = buildLayout();
auditLayout(layout);

/** Every slab in the tower, in climb order: section 1's thirteen, the pad that catches section 2's
 *  last bounce, section 3's four steps and its two landings, the last of which is the summit. */
export const TOWER_PLATFORMS: readonly TowerPlatform[] = layout.platforms;

/** Every homing crystal, in climb order: section 2's four, then section 3's two. */
export const TOWER_CRYSTALS: readonly Vec3[] = layout.crystals;

/**
 * Where the capsule's CENTRE starts: on the floor at {@link SPIRAL_START_DEGREES} and 7 u out — far
 * enough outside {@link PLATFORM_ORBIT} to see the column and the first step before walking at them.
 * The `+ RESPAWN_LIFT` is the hub's reasoning at its own spawn: start just above the floor so the
 * capsule settles onto it, rather than embedded in a one-sided collider it would fall through.
 */
export const TOWER_SPAWN = new Vector3(7, TOWER_FLOOR_Y + CAPSULE_HALF + RESPAWN_LIFT, 0);

const respawnAbove = (pad: TowerPlatform): Vec3 =>
  vec3(pad.x, pad.y + CAPSULE_HALF + RESPAWN_LIFT, pad.z);

/**
 * One checkpoint per section (spec §2), each standing on that section's first pad.
 *
 * `activateY` is each section's boundary height — the pad's TOP face — while the height
 * `stepTowerProgress` compares against it is the capsule's CENTRE, which rides {@link CAPSULE_HALF}
 * above whatever it stands on. So a checkpoint activates about a metre before touchdown, on the way
 * up through its own pad. That is deliberate, and it is the forgiving direction: the alternative is a
 * player who lands, is knocked off before their centre clears the boundary, and loses a whole section
 * they had already climbed.
 *
 * There is no checkpoint at the summit. A fall from the approach to it therefore costs the whole of
 * section 3 — 20 u — which is the harshest single consequence in the tower and the first thing to
 * revisit if the summit plays as a wall.
 */
export const TOWER_CHECKPOINTS: readonly TowerCheckpoint[] = [
  { activateY: TOWER_FLOOR_Y, respawn: vec3(TOWER_SPAWN.x, TOWER_SPAWN.y, TOWER_SPAWN.z) },
  { activateY: SECTION_2_START, respawn: respawnAbove(layout.checkpointPads[0]) },
  { activateY: SECTION_3_START, respawn: respawnAbove(layout.checkpointPads[1]) },
];

/** The summit pedestal's radius. **Untuned**, and smaller than the hub's 1.6 (`landmark.ts`) for a
 *  reason that is not taste: the balcony's radial depth is capped at {@link PLATFORM_SIZE} by
 *  {@link BOUNCE_REACH}, so 1.0 is what fits on it with standing room left around the rim. */
export const TOWER_SUMMIT_RADIUS = 1;
/** Its height above the balcony. The hub pedestal's own 0.55: low enough to step onto, high enough
 *  that standing on it is deliberate — spec §5's reason for there being no confirm key. */
export const TOWER_SUMMIT_PEDESTAL_HEIGHT = 0.55;

/**
 * The top face of the summit pedestal, at its centre — the point that ends the climb (spec §5: "Exit
 * is the summit pedestal only"). The scene turns this into the portal's `inside` test.
 */
export const TOWER_SUMMIT: Vec3 = vec3(
  layout.summit.x,
  layout.summit.y + TOWER_SUMMIT_PEDESTAL_HEIGHT,
  layout.summit.z,
);
