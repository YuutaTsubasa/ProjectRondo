import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { vec3, type Vec3 } from '../../domain/math/vec3';
import type { TowerCheckpoint } from '../../domain/hub/tower/towerProgress';
import { DEFAULT_CONFIG } from '../../domain/hub/character/movementConfig';
import { CAPSULE_HALF, CAPSULE_HEIGHT, CAPSULE_RADIUS } from './capsule';

/**
 * The climbing tower, as data.
 *
 * **Every number in this file is Untuned**, and that survived the first playthrough. The tower has
 * now been climbed floor to summit and back to the hub (design spec §14), but nothing here was
 * retuned against it, so every number is still the output of a rule rather than a measurement. What
 * the climb changed is that the rules can now be argued with against evidence: §14.2 timed the three
 * sections at **15.1 : 2.4 : 7.1 seconds** against spec §3's premise of roughly equal play time,
 * which puts {@link SECTION_1_STEPS} and {@link SECTION_2_LINKS} first in line to move. Each rule is
 * stated on the group it shaped, together with the shipped constant that bounds it. Retune a rule and
 * let the numbers fall out, rather than nudging a coordinate and leaving the rule that produced it
 * saying something else.
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
 * **Three more rules are not in the spec, and each was found the hard way** — the first two by
 * generating a layout and measuring it, the third by a reviewer re-deriving the summit and finding it
 * could not be landed on. They are the reason {@link auditLayout} exists: a coordinate that satisfies
 * them by luck stops satisfying them the moment somebody moves it.
 *
 * - **A slab must not overhang a slab you can stand on.** A jump step is 1.4 u and a slab is 0.4 u
 *   thick, so the headroom over a ledge is 1.0 u against a capsule {@link CAPSULE_HEIGHT} 2 u tall.
 *   Anything overhead is not scenery, it is a lid. This is what fixes the spiral's turn rate and slab
 *   size together (see {@link TURN_DEGREES}), and what made the first draft's wider checkpoint pads
 *   impossible.
 * - **A bounce rises straight up.** So a crystal has to sit clear of the pad its bounce lands on —
 *   see {@link BOUNCE_REACH}, which the second draft got wrong in the other direction.
 * - **A bounce also has to come DOWN somewhere.** The pad has to be inside the drift the bounce's own
 *   airtime pays for, and whatever stands on that pad has to leave the landing clear. The third draft
 *   put a 1.0 u pedestal in the middle of the only pad the last bounce of the climb can reach, which
 *   made the summit — the tower's one exit — unreachable by the approach the level itself gives the
 *   player. See {@link SUMMIT_PEDESTAL_OFFSET}.
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
 *
 * **How often it bites is now measured — spec §14.4.** Never on the climb's own aims: the camera
 * sits 6.42–9.09 u from the axis for every one of the twenty-five platform-to-platform steps, launch
 * aims and chain aims the route requires. Always on a fall taken facing outward: 1.20–1.77 u from
 * the axis for the whole descent, on 50 of 50 falling frames, which is the fall spec §2 promises the
 * player will watch, played out behind a blank wall.
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
 * bridged to.
 *
 * A straight edge against a round column only meets it in the middle, and how far the ends part
 * company is a function of the slab's width: an ordinary 2.4 u slab's inner corners sit
 * `√(3.0² + 1.2²)` = 3.2311 u from the axis, so they stand **0.031 u** proud of the curve, and a
 * capsule 1 u wide cannot fall through a 0.031 u crescent. (An earlier draft said 0.15 u here; the
 * figure was simply wrong, not measured against a different number. The summit balcony is much wider
 * and its ends part company by a lot more — see {@link SUMMIT_PAD_WIDTH}.)
 */
const PLATFORM_ORBIT = 4.2;
/** Every ordinary platform is a square this far across. **Untuned**: 2.4 is a guess at "forgives a
 *  missed landing" against a capsule 1 u wide, and it is also as wide as the headroom rule allows at
 *  {@link TURN_DEGREES} — the two checkpoint pads are this size too, for that reason and not by
 *  preference. */
const PLATFORM_SIZE = 2.4;

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
 * unstandable strip along its edge.
 *
 * At 45° the same two slabs are **0.073 u** apart on that same axis — {@link reachAlong} run at 45°,
 * not an estimate — which is a seventh of the capsule's radius, so every ledge in section 1 loses its
 * outer edge and the audit warns on all of them. That is how this number was arrived at rather than
 * by feel. (An earlier draft said 45° *overlapped* by 0.17 u. It did not: 0.1796 is
 * `centreDistance − 2 · halfDiagonal` = `3.2145 − 3.3941`, which measures a slab by its corner in
 * every direction at once — precisely the support-function/face-distance confusion {@link reachAlong}
 * exists to stop. The conclusion survived the error; the number did not.)
 *
 * A gap is not only headroom, it is also the jump: 0.80 u is crossed comfortably inside the 1.24 u a
 * walking player (`maxSpeed` 4) covers during the 0.31 s they spend above +1.4 u, and trivially
 * inside a runner's 2.48 u. Widening this further starts to cost that margin.
 */
const TURN_DEGREES = 60;

/**
 * How far above its crystal the pad that catches a bounce sits: **level with it, deliberately**.
 *
 * Zero costs no height, because what a link gains is the crystal's height and not the bounce's, and
 * it buys the most airtime any value of this can buy for the sideways drift {@link BOUNCE_REACH}
 * needs. The bounce leaves the crystal with the capsule's CENTRE at the crystal, so its feet start
 * {@link CAPSULE_HALF} below it and it has to climb `BOUNCE_RISE + CAPSULE_HALF` before it is over
 * the pad at all. Against an apex of 1.6875 u that leaves at most 0.6875 u to spend here before the
 * pad stops being reachable outright — so an earlier draft's 1.2 u did not "leave 0.19–2.19 u of
 * reach", it put the pad above the bounce entirely. Every unit spent here is taken twice over: once
 * from the height the capsule has to make up, and again from the seconds left to drift in
 * ({@link BOUNCE_AIRTIME} falls from 0.614 s at zero to 0.530 s at 0.4 u).
 *
 * Negative is the direction with room in it, not positive: dropping the pad below its crystal buys
 * both back, at the cost of the height the link gains. That is the knob to reach for if a chain's
 * last bounce plays as a scramble. A chain has now been played (spec §14.1): the section-2 chain's
 * last bounce landed 0.34 u from its pad's centre, and every last bounce in the tower landed, so
 * nothing has forced this off zero. Whether any of them plays as a scramble is unjudged.
 */
const BOUNCE_RISE = 0;

/**
 * Seconds a bounce gives the player to steer with: from leaving the crystal to the capsule's feet
 * arriving back at the landing pad's top face.
 *
 * **Not the airtime.** `2·homingBounceSpeed/gravity` = 0.75 s is how long the capsule spends above
 * the height it launched at, and the pad is level with that height ({@link BOUNCE_RISE}) — but the
 * capsule's feet ride {@link CAPSULE_HALF} below its centre, so it is over the pad only between the
 * two roots of `homingBounceSpeed·t − (gravity/2)·t² = BOUNCE_RISE + CAPSULE_HALF`, and it lands on
 * the later one. **0.614 s.** The 0.75 s an earlier draft used answers a question nobody is asking.
 */
const BOUNCE_AIRTIME = ((): number => {
  const { homingBounceSpeed: speed, gravity } = DEFAULT_CONFIG;
  const climb = BOUNCE_RISE + CAPSULE_HALF;
  const discriminant = speed * speed - 2 * gravity * climb;
  // Negative means the bounce never gets its feet over the pad at all — no window, not a short one.
  return discriminant < 0 ? 0 : (speed + Math.sqrt(discriminant)) / gravity;
})();

/**
 * Ground covered from a standstill under air control in `seconds`, at `topSpeed`. The bounce discards
 * the dash's horizontal velocity entirely (`stepHoming` returns `(0, homingBounceSpeed, 0)`), so the
 * player starts every bounce from zero and `acceleration` 13 is what they steer with; `topSpeed` only
 * bites if the ramp reaches it.
 */
const airDrift = (seconds: number, topSpeed: number): number => {
  const { acceleration } = DEFAULT_CONFIG;
  const rampSeconds = topSpeed / acceleration;
  if (seconds <= rampSeconds) return 0.5 * acceleration * seconds * seconds;
  return 0.5 * topSpeed * rampSeconds + topSpeed * (seconds - rampSeconds);
};

/** How far a WALKING player can steer a bounce sideways before it lands: 1.84 u. The bound to size a
 *  landing against, because holding the run key is a choice and clearing a gap must not be. */
const BOUNCE_DRIFT = airDrift(BOUNCE_AIRTIME, DEFAULT_CONFIG.maxSpeed);

/**
 * How far outboard of its landing pad a bounce's crystal sits. **Untuned, and derived rather than
 * chosen**, because the bounce is *purely vertical*: the player leaves the crystal going straight up
 * and has to steer onto the pad under air control alone.
 *
 * Two bounds, and 2.1 sits between them:
 *
 * - **Not less than 1.7** = `PLATFORM_SIZE/2 + CAPSULE_RADIUS`, or the rising capsule hits the pad
 *   instead of clearing it. This bound is why a landing pad may not be deeper than
 *   {@link PLATFORM_SIZE}, the summit balcony included, and it is what the first draft of this layout
 *   got wrong — a 2.0 u reach against a 3.6 u pad put every chain's last bounce under the slab it was
 *   aimed at.
 * - **Not more than 2.54** = `BOUNCE_DRIFT + (PLATFORM_SIZE/2 − CAPSULE_RADIUS)`, or the drift runs
 *   out before the capsule is over the pad: the player has to cross the reach less the pad's own near
 *   half, and 1.84 + 0.7 is all there is.
 *
 * **The second bound replaces a wrong argument as well as a wrong number.** It used to read "~2.4",
 * from "the bounce's whole 0.75 s of airtime above pad height" giving 2.38 u of drift. Two errors:
 * the window is {@link BOUNCE_AIRTIME} 0.614 s and the drift 1.84 u, not 0.75 s and 2.38; and the
 * quantity to bound is the drift needed to reach the pad's near HALF, not the drift needed to reach
 * its centre. Only the second correction is what keeps 2.1 legal — against the drift alone, which is
 * the distance to the pad's centre, 2.1 is 0.26 u too far.
 *
 * What 2.1 actually leaves: a player who holds inward the whole way comes down 0.26 u outboard of the
 * pad's centre, orbit 4.46 against a pad spanning 3.0–5.4, and the drifts that land safely run from
 * 1.40 u (capsule just inside the outer edge) to 1.84 u — a 0.44 u band. Running is less of an escape
 * than it looks: `acceleration` 13 over 0.614 s never reaches `runSpeed` 8, so a runner gets 2.45 u
 * rather than 3.54.
 *
 * **One thing none of this models, and {@link auditLayout} does not either.** `stepHoming` bounces on
 * the frame `homingSpeed · delta >= remaining`, so the launch is not the crystal: it is up to
 * `homingSpeed · MAX_DT` = 0.8 u short of it, back along the dash, which is lower and so has less
 * airtime. It is left unchecked because the launch point depends on where the player pressed, which
 * is not a level coordinate. It was worked through by hand for the tightest case in the tower, the
 * summit link pressed at the apex of the jump off the platform below: the launch lands 0.50 u low and
 * 0.47 u inboard, leaving 0.499 s and 1.38 u of drift against the 0.93 u it then needs — 0.45 u of
 * margin, against the nominal launch's 0.44 u. If a future link is steeper than these, redo it.
 */
const BOUNCE_REACH = 2.1;
/** Distance from the axis to a crystal — {@link BOUNCE_REACH} outboard of the platform orbit, by
 *  construction rather than by choice. Putting the chain crystals on that same orbit keeps them on
 *  one spiral with the landing ones, and leaves every crystal 2.5 u clear of the column's surface. */
const CRYSTAL_ORBIT = PLATFORM_ORBIT + BOUNCE_REACH;

// ---------------------------------------------------------------------------------------------
// The summit
// ---------------------------------------------------------------------------------------------

/**
 * The summit pedestal's radius. **Untuned**: 1.0, smaller than the hub's 1.6 (`landmark.ts`) but
 * still twice the capsule's own {@link CAPSULE_RADIUS}, so arriving on it is a step onto a disc twice
 * your width rather than a balance.
 *
 * The reason that used to be given for it was false, and it is the bug this summit shipped with: "1.0
 * is what fits on the balcony with standing room left around the rim" does not survive the
 * subtraction. A 1.0 pedestal centred on a pad {@link PLATFORM_SIZE} 2.4 u deep leaves 0.2 u of pad
 * at each radial edge against a 0.5 u capsule — there is no rim, and there is no version of this
 * number that makes one, because the depth is capped by {@link BOUNCE_REACH} and not by choice. The
 * pedestal does not fit *around*; it fits *beside*. See {@link SUMMIT_PEDESTAL_OFFSET}.
 */
export const TOWER_SUMMIT_RADIUS = 1;
/** Its height above the balcony. The hub pedestal's own 0.55: low enough to step onto, high enough
 *  that standing on it is deliberate — spec §5's reason for there being no confirm key. Arriving on
 *  top of it is not an approach the last bounce can make and no version of these numbers makes it
 *  one. The climb {@link BOUNCE_AIRTIME} solves for `pad`, solved instead for `pad + 0.55`, has two
 *  roots: 0.268 s and 0.482 s after launch — a 0.214 s window in which the feet are above pedestal
 *  height, and the source of the "0.21 s" an earlier draft already had right. What that draft got
 *  wrong was the drift inside it: it took `½ · acceleration · 0.214²` = 0.30 u, acceleration from a
 *  standstill at the window's open — the same rest-from-zero mistake {@link BOUNCE_REACH} corrects
 *  for the reach bound, made a second time here. The player has been drifting under air control since
 *  launch, not from rest at 0.268 s: `airDrift` gives 1.3128 u by the window's close, of which only
 *  0.846 u falls inside the window — against the 1.6 u = `BOUNCE_REACH − (TOWER_SUMMIT_RADIUS −
 *  CAPSULE_RADIUS)` it takes to reach the disc's edge. The conclusion survived the error; the number
 *  didn't. The shipped case is safer still: {@link SUMMIT_PEDESTAL_OFFSET}'s offset puts the disc
 *  `√(BOUNCE_REACH² + SUMMIT_PEDESTAL_OFFSET²)` = 2.9 u away, needing 2.4 u. The bounce lands beside
 *  it and walks — see {@link SUMMIT_PEDESTAL_OFFSET}. */
export const TOWER_SUMMIT_PEDESTAL_HEIGHT = 0.55;

/**
 * How far ALONG the balcony's face the pedestal stands from its centre line, and which way.
 *
 * **This is the summit's whole fix.** The last bounce of the climb rises on the balcony's own bearing
 * and drifts straight in ({@link BOUNCE_REACH}), so it comes down ON the balcony's centre line, with
 * the capsule taking {@link CAPSULE_RADIUS} either side of it. A pedestal on that line is a pedestal
 * there is nowhere to land beside, which is exactly what shipped: 1.0 u of pedestal on a
 * 2.4 u pad left two ~0.37 × 1.4 u patches at the balcony's ends and no way to reach either, since a
 * diagonal to one costs more drift than the bounce pays for. Radial room cannot fix it — the depth is
 * capped — so the pedestal moves along the face instead, which is the one direction the balcony can
 * be widened in for free.
 *
 * **Untuned**, but derived: `TOWER_SUMMIT_RADIUS + 2 · CAPSULE_RADIUS` = **2.0 u**. A capsule that
 * comes down on the centre line then clears the pedestal's surface by a whole capsule width, so the
 * landing may be half a capsule off the line and still be clear of it. {@link auditLayout} checks the
 * whole reachable landing band against the pedestal, so shrinking this or growing
 * {@link TOWER_SUMMIT_RADIUS} past what the landing needs warns rather than quietly re-breaking the
 * summit; that the balcony is still wide enough to carry the pedestal at all is `towerLevel.test.ts`'s
 * assertion, not the audit's.
 *
 * The SIGN is not free either, though nothing enforces it: the dash arrives from the platform one
 * turn back, which lies `PLATFORM_ORBIT · sin(TURN_DEGREES)` = 3.64 u along the face in the positive
 * direction, so the pedestal goes to the other end. That does not change the clearance, which is
 * symmetric — it buys margin in the one case the audit does not model, a bounce that launches short
 * (see {@link BOUNCE_REACH}) and therefore starts and lands on the approach side of the line.
 */
const SUMMIT_PEDESTAL_OFFSET = TOWER_SUMMIT_RADIUS + 2 * CAPSULE_RADIUS;

/**
 * The summit balcony's width ALONG the column's face — spec §2 asks for the top to be a place, not a
 * ledge, and nothing stands within 7 u above it for the headroom rule to catch. **Derived, not
 * chosen**: exactly wide enough to carry the pedestal at {@link SUMMIT_PEDESTAL_OFFSET},
 * `2 · (2.0 + 1.0)` = **6.0 u**, with the pedestal's outer edge flush against the balcony's end. Its
 * radial depth stays {@link PLATFORM_SIZE}, because the summit is reached by a bounce and
 * {@link BOUNCE_REACH} caps how deep a landing pad may be.
 *
 * 6.0 is wide enough that what it looks like is worth writing down: the slab's inner face is a
 * straight chord at radius 3.0 while the column curves away behind it, so at the balcony's ends the
 * two are 1.89 u apart radially and the inner corners stand 1.04 u proud of the column's surface —
 * against 0.031 u for an ordinary slab (see {@link PLATFORM_ORBIT}). That is not a hole; it opens
 * sideways past the column rather than through the floor. It is an inside edge you can walk off.
 *
 * The summit has now been stood on and screenshotted (spec §14.7) and the last bounce has landed on
 * this balcony nineteen times out of nineteen (§14.1) — but **this edge was not looked at
 * specifically**, so it is still the first thing to look at the next time somebody is up there.
 */
const SUMMIT_PAD_WIDTH = 2 * (SUMMIT_PEDESTAL_OFFSET + TOWER_SUMMIT_RADIUS);

/** How far above a surface a respawn point sits. **Untuned**, but its direction is measured: spec
 *  §13.1 found a capsule teleported 3 u BELOW a surface is lost through the one-sided collider
 *  outright, while open air and "0.3 u above" both settle cleanly. So checkpoints are points in open
 *  air above their platform, never points on it — the same +0.3 the hub's spawn uses. */
const RESPAWN_LIFT = 0.3;

/**
 * Where a fall stops counting as a step down. **Untuned**: 4 u is a guess at "deeper than any
 * deliberate drop between platforms, shallower than a fall that would hang before resolving".
 *
 * One edge is now measured and the other could not be exercised (spec §14.3). Stepping off a
 * checkpoint pad hangs for **0.612 s** before the respawn fires — that is what "a fall that would
 * hang before resolving" costs at this value, and whether 0.61 s reads as a hang is a judgement
 * nobody has made. The shallow edge was never reached, because the layout has no ledge within 4 u
 * below a checkpoint to step off. See the design spec §4.
 */
export const TOWER_FALL_MARGIN = 4;

// ---------------------------------------------------------------------------------------------
// The layout, generated from the rules above
// ---------------------------------------------------------------------------------------------

/**
 * A platform slab. `y` is its TOP face — the height the player stands at, and the height every rule
 * above is written in; the scene sinks the box by {@link TOWER_SLAB_THICKNESS} to place it.
 *
 * `rotationY` is not decoration, but it is not a fix for anything either. Turning each slab to face
 * the column is what makes `width` mean "along the column's face" and `depth` mean "away from it",
 * and those are the two directions every rule in this file is stated in: {@link BOUNCE_REACH} is
 * bounded by the depth, {@link TURN_DEGREES} and {@link SUMMIT_PEDESTAL_OFFSET} by the width. Without
 * the rotation none of them could even be written down, which is the whole of the reason.
 *
 * It is *not* here because unturned slabs collide. An earlier draft claimed the unturned gap between
 * neighbours "changed with the bearing — 0.37 u at one bearing and a 0.23 u overlap at another".
 * Swept over every bearing it runs 0.5698 u to 1.80 u and never overlaps, and at the two bearings
 * this layout actually uses it is 1.24 u or 1.80 u: unturned slabs would pass this file's own audit.
 * They would just leave every rule above unstatable.
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

/**
 * Something standing ON a pad, as a cylinder: the summit pedestal, and anything else a later section
 * puts on a surface the player has to land on. Held in the pad's OWN axes rather than in world space,
 * because that is the frame both the rule and {@link auditLayout} are written in.
 */
interface TowerPadProp {
  readonly pad: TowerPlatform;
  /** For the warning message. */
  readonly name: string;
  /** Offset from the pad's centre along the column's face. */
  readonly along: number;
  /** Offset from the pad's centre away from the column. */
  readonly outward: number;
  readonly radius: number;
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

/** World-space local axes of a slab: `[along the column's face, away from it]`. */
const axesOf = (p: TowerPlatform) => [
  { x: Math.cos(p.rotationY), z: -Math.sin(p.rotationY), half: p.width / 2 },
  { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY), half: p.depth / 2 },
];

/** How far a slab reaches from its centre along `axis` — the support function, not the face distance.
 *  Getting those two confused is what produced a layout whose slabs overlapped while its arithmetic
 *  said they were 0.4 u apart, and what produced {@link TURN_DEGREES}' wrong 45° figure. */
const reachAlong = (p: TowerPlatform, axis: { x: number; z: number }): number =>
  axesOf(p).reduce((sum, a) => sum + Math.abs(a.x * axis.x + a.z * axis.z) * a.half, 0);

/** A point on a slab's TOP face, given in the slab's own axes — see {@link TowerPadProp}. */
const onPad = (p: TowerPlatform, along: number, outward: number): Vec3 => {
  const [face, out] = axesOf(p);
  return vec3(p.x + along * face.x + outward * out.x, p.y, p.z + along * face.z + outward * out.z);
};

/**
 * Jump steps in section 1. **Untuned**: 13, because 18 u at {@link JUMP_RISE} needs at least 12.9 of
 * them, and 13 puts the per-step rise at 18/13 = **1.3846 u** — just inside the rule rather than
 * exactly on it. Spec §3's own estimate for this section is "~13 steps".
 *
 * **This count and {@link SECTION_2_LINKS} are what spec §14.2 says should move first.** Timed on a
 * scripted climb that never misses, a jump step costs **1.05–1.13 s** and a chained homing link
 * **0.37 s**, so 13 steps against 4 links runs 15.1 s against 2.4 s. §3 matched the sections on
 * height-per-vocabulary and assumed the times would follow; they follow the *count* instead. Neither
 * number was changed for that — retuning the shape of the climb is the owner's call, not a fix.
 */
const SECTION_1_STEPS = 13;
/** Homing links in section 2. **Untuned**: 4, spec §3's "~4 crystals", which over 18 → 42 puts the
 *  rise per link at exactly **6.0 u** — the bottom of the spec's 6–8 band. See
 *  {@link SECTION_1_STEPS} for what spec §14.2 measured this section against. */
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
 *  decides which way the tower faces. */
const SPIRAL_START_DEGREES = 0;
/** Bearing of the first thing the player has to reach. The walk below turns BEFORE it places
 *  anything, so this is one turn on from the start, not the start — which is what an earlier draft
 *  missed when it put {@link TOWER_SPAWN} at {@link SPIRAL_START_DEGREES} and then claimed the spawn
 *  faced the first step. It did not; it faced the face before it. */
const SPIRAL_FIRST_STEP_DEGREES = SPIRAL_START_DEGREES + TURN_DEGREES;

interface TowerLayout {
  readonly platforms: readonly TowerPlatform[];
  readonly crystals: readonly Vec3[];
  /** The pads the checkpoints stand on, in section order (section 2's, then section 3's). */
  readonly checkpointPads: readonly TowerPlatform[];
  readonly summit: TowerPlatform;
  /** `[crystal, the pad its bounce lands on]` for every link that ends on a platform — the pairs
   *  {@link auditLayout} checks {@link BOUNCE_REACH} against. */
  readonly bounceLandings: readonly (readonly [Vec3, TowerPlatform])[];
  /** Everything standing on a pad, for the landing rule to check the bounces against. */
  readonly props: readonly TowerPadProp[];
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

  // Negative along the face: away from the bearing the last dash comes in on. See
  // SUMMIT_PEDESTAL_OFFSET for why the sign is worth choosing even though nothing enforces it.
  const pedestal: TowerPadProp = {
    pad: summit,
    name: 'the summit pedestal',
    along: -SUMMIT_PEDESTAL_OFFSET,
    outward: 0,
    radius: TOWER_SUMMIT_RADIUS,
  };

  return {
    platforms, crystals, checkpointPads: [section2Pad, section3Pad], summit, bounceLandings,
    props: [pedestal],
  };
}

/**
 * The three rules from this file's header, checked against the layout that was actually generated
 * rather than against the prose that produced it. All three were violated by drafts of this file, and
 * none of them shows up as anything but a level that plays wrong.
 *
 * The slab test is a separating-axis one over the four face normals: the largest gap it finds is a
 * lower bound on the true distance between two rectangles, so passing it is conclusive and failing it
 * is a warning worth looking at rather than proof.
 *
 * **What the overhang loop is run over, and what it is deliberately not.** It walks `platforms` only.
 * Three things are outside it, each on purpose rather than by omission:
 *
 * - **The floor.** It is a standable surface (spec §4) and section 1's first slab genuinely is a lid
 *   over it — 18/13 = 1.3846 u up, less 0.4 u of slab, is 0.98 u of headroom against a 2 u capsule —
 *   so including it would warn. That is accepted rather than fixed, and the alternative is worse: the
 *   first step would have to rise to 2.4 u to clear the capsule, which is above the 1.6875 u jump
 *   apex, so it would stop being reachable from the floor at all. What the lid covers is one
 *   2.4 × 2.4 patch of a disc 28 u across, at orbit 3.0–5.4 where the column already takes the middle
 *   out, and {@link TOWER_SPAWN} is at orbit 7 with nothing under that slab to walk to. The rule is
 *   about the ledges you climb between; the floor is the one surface you never have to climb back on.
 * - **The column.** Not standable (`towerScene` says so and nothing contradicts it), so it has no
 *   headroom to protect.
 * - **The summit pedestal.** It stands ON a pad rather than over one, which is the landing rule's
 *   business below and not the overhang rule's — and nothing in this tower stands above the summit
 *   for the overhang rule to catch in any case.
 *
 * It warns rather than throws: a tower with one bad ledge is still worth loading and looking at, and
 * an error thrown here would take the whole scene down at import time.
 */
function auditLayout({ platforms, bounceLandings, props }: TowerLayout): void {
  for (const [crystal, pad] of bounceLandings) {
    // The crystal is directly outboard of the pad's centre, so the radial edge is the nearest one.
    const reach = Math.hypot(crystal.x - pad.x, crystal.z - pad.z);
    const clearance = reach - pad.depth / 2;
    if (clearance < CAPSULE_RADIUS) {
      console.warn(`[towerLevel] the bounce at y=${crystal.y} rises into its own landing pad — ${clearance.toFixed(2)} u of room for a ${CAPSULE_RADIUS} u capsule. See BOUNCE_REACH.`);
    }

    // Where the bounce can put the capsule down, as an offset outward from the pad's centre: the
    // outermost the capsule can stand, inward to wherever a walking player's drift runs out. It rises
    // on the pad's own bearing and steers straight in, so the whole band sits on the pad's centre
    // line and `along` is zero throughout.
    const outermost = pad.depth / 2 - CAPSULE_RADIUS;
    const innermost = Math.max(reach - BOUNCE_DRIFT, -outermost);
    if (innermost > outermost) {
      console.warn(`[towerLevel] the bounce at y=${crystal.y} cannot reach its landing pad — ${BOUNCE_DRIFT.toFixed(2)} u of drift against the ${(reach - outermost).toFixed(2)} u it needs. See BOUNCE_REACH.`);
      continue;
    }

    for (const prop of props) {
      if (prop.pad !== pad) continue;
      // Distance from the prop's axis to the landing capsule's, over the whole band. It is convex in
      // the offset, so its minimum is at the band's own end nearest the prop.
      const nearest = Math.min(Math.max(prop.outward, innermost), outermost);
      const room = Math.hypot(prop.along, nearest - prop.outward) - prop.radius;
      if (room < CAPSULE_RADIUS) {
        console.warn(`[towerLevel] ${prop.name} stands where the bounce at y=${crystal.y} has to land — ${room.toFixed(2)} u of room for a ${CAPSULE_RADIUS} u capsule, anywhere the bounce can come down. See SUMMIT_PEDESTAL_OFFSET.`);
      }
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

/** How far out the player starts. **Untuned**: 7 u is outside {@link CRYSTAL_ORBIT}, so the whole
 *  spiral — column, first step and the crystal above it — is in front of the player rather than
 *  overhead. */
const SPAWN_ORBIT = 7;

/**
 * Where the capsule's CENTRE starts: on the floor at {@link SPIRAL_FIRST_STEP_DEGREES}, so walking
 * straight in from the spawn arrives at the first step rather than at the face before it. Which way
 * the camera is pointing when the level opens is `followCamera`'s default yaw and is not decided
 * here, so nothing in this file claims the player is looking at anything.
 *
 * The `+ RESPAWN_LIFT` is the hub's reasoning at its own spawn: start just above the floor so the
 * capsule settles onto it, rather than embedded in a one-sided collider it would fall through.
 */
export const TOWER_SPAWN = ((): Vector3 => {
  const spot = at(SPAWN_ORBIT, SPIRAL_FIRST_STEP_DEGREES, TOWER_FLOOR_Y + CAPSULE_HALF + RESPAWN_LIFT);
  return new Vector3(spot.x, spot.y, spot.z);
})();

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

/**
 * The top face of the summit pedestal, at its centre — the point that ends the climb (spec §5: "Exit
 * is the summit pedestal only"). The scene turns this into the portal's `inside` test.
 *
 * It is {@link SUMMIT_PEDESTAL_OFFSET} along the balcony from the balcony's own centre, not on it:
 * the bounce that ends the climb lands on the centre line, and the pedestal has to be somewhere the
 * landing is not.
 */
export const TOWER_SUMMIT: Vec3 = ((): Vec3 => {
  const [pedestal] = layout.props;
  const spot = onPad(pedestal.pad, pedestal.along, pedestal.outward);
  return vec3(spot.x, spot.y + TOWER_SUMMIT_PEDESTAL_HEIGHT, spot.z);
})();
