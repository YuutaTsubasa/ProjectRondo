import { vec3, type Vec3 } from '../../domain/math/vec3';
import type { TowerCheckpoints } from '../../domain/tower/towerProgress';
import { DEFAULT_CONFIG } from '../../domain/hub/character/movementConfig';
import { CAPSULE_HALF, CAPSULE_HEIGHT, CAPSULE_RADIUS, spawnCentreY } from './capsule';
import { PEDESTAL_HEIGHT } from './pedestal';

/**
 * The climbing tower, as data.
 *
 * **Every number in this file is Untuned**, and that survived the first playthrough. The tower was
 * climbed floor to summit and back to the hub (design spec §14), and nothing here was retuned against
 * it, so every number is still the output of a rule rather than a measurement. What the climb changed
 * is that the rules can now be argued with against evidence: §14.2 timed the three sections at
 * **15.1 : 2.4 : 7.1 seconds** against spec §3's premise of roughly equal play time, which puts
 * {@link SECTION_1_STEPS} and {@link SECTION_2_LINKS} first in line to move. Each rule is stated on
 * the group it shaped, together with the shipped constant that bounds it. Retune a rule and let the
 * numbers fall out, rather than nudging a coordinate and leaving the rule that produced it saying
 * something else.
 *
 * **The layout §14 was measured on is not this one.** The owner played the shipped tower and found the
 * jumps blocked by the column; the fourth rule below is the result, and {@link PLATFORM_ORBIT},
 * {@link PLATFORM_DEPTH} and {@link BOUNCE_REACH} were re-solved together to satisfy it. Section
 * heights, step and link counts and the summit's own dimensions did not move, so §14.2's times and
 * §14.1's landing counts are still about the shape of the climb — but every distance §14 records is a
 * distance to a platform that has since moved 0.4 u further out. Spec §14 is marked with what that
 * voids and what it does not, and nothing in this file cites one of those measurements without saying
 * which layout it came from.
 *
 * The two rules everything hangs off, both from the design spec §3, and both checked by
 * {@link auditLayout} — they were prose until a reviewer pointed out that the audit knew every rule
 * in this file except the two it opens with:
 *
 * - **A jump gains at most {@link JUMP_APEX}**, `jumpSpeed²/(2·gravity)` = 9²/48 = **1.6875 u**
 *   (`movementConstants.ts`). Past it the step is not jumpable and the section it is in cannot be
 *   climbed. {@link JUMP_RISE} 1.4 is what the generator actually lays out at, 0.29 u under that
 *   ceiling, and it is now the number every step in the tower derives from — {@link SECTION_1_STEPS}
 *   included, which used to divide the section height by a hand-written count instead.
 * - **A homing link gains 6–8 u comfortably.** The hard bound is `homingRange` 12, which
 *   `homingTarget.ts` refuses a lock past; the 6–8 is spec §3's comfort band inside it. The range is
 *   audited, the band is not — see {@link auditLayout}. Both kinds of link here land inside the band:
 *   6.0 u in section 2, 7.2 u in section 3.
 *
 * The sections were *meant* to be matched on play TIME, not on height (spec §3), which is why they
 * are 18, 24 and 20 units tall. §14.2 timed them and the premise did not hold — ~13 jump steps
 * costs 15.1 s where ~4 crystals cost 2.4 s — so these heights are the record of what was believed
 * before anyone climbed it, not a matched-time claim.
 *
 * **Four more rules are not in the spec, and each was found the hard way** — the first two by
 * generating a layout and measuring it, the third by a reviewer re-deriving the summit and finding it
 * could not be landed on, and the fourth by the project owner playing the shipped tower and reporting
 * that the jumps scraped the column. They are the reason {@link auditLayout} exists: a coordinate that
 * satisfies them by luck stops satisfying them the moment somebody moves it.
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
 * - **A jump has to get PAST the column, not just onto the next ledge.** Two platforms one turn apart
 *   are joined by a chord that passes `PLATFORM_ORBIT · cos(TURN_DEGREES/2)` from the axis, and the
 *   capsule's edge reaches {@link CAPSULE_RADIUS} further in than that. The shipped layout put that
 *   edge **0.063 u inside the column** on all sixteen of its jumps — the owner played it and said the
 *   angle between one platform and the next was blocked — and every rule above was satisfied the whole
 *   time, because not one of them looks at what is BETWEEN two ledges. See {@link JUMP_PATH_MARGIN}
 *   and {@link PLATFORM_ORBIT}, which is the number that moved.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Section boundaries — spec §3's Untuned heights. Everything below is laid out between them.
// ---------------------------------------------------------------------------------------------

/** The tower's floor: the slab the base is built on, and the surface section 1's checkpoint stands
 *  on. Zero, because a tower that starts at zero is a tower whose heights read as heights. It is a
 *  collider and not a ground query — see `unknownGround` for why the rig is handed no height field. */
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
 * {@link PLATFORM_ORBIT} 4.6 puts the camera inside any column whenever they face outward. Spec
 * §13.3 carries that as budgeted camera work; this radius only decides how often it bites.
 *
 * **How often it bites was measured — spec §14.4 — on the layout before this one.** Never on the
 * climb's own aims: the camera sat 6.42–9.09 u from the axis for every one of the twenty-five
 * platform-to-platform steps, launch aims and chain aims the route required. Always on a fall taken
 * facing outward: 1.20–1.77 u from the axis for the whole descent, on 50 of 50 falling frames, which
 * is the fall spec §2 promises the player will watch, played out behind a blank wall. **Those
 * distances are void as numbers**: the aims were taken at {@link PLATFORM_ORBIT} 4.2 and the platforms
 * now stand 0.4 u further out, which moves every one of them. What survives is the direction of both
 * findings — the climb's aims look inward across a wider orbit than before, and a fall still happens
 * at the axis where the column is — and the radius is unchanged either way.
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
 * Distance from the column's axis to a platform's CENTRE. **Untuned**, and the number two rules pull
 * in opposite directions on:
 *
 * - **A platform has to MEET the column** instead of floating beside it: `PLATFORM_ORBIT −
 *   PLATFORM_DEPTH/2 ≤ TOWER_COLUMN_RADIUS`. Every slab is turned to face the column (see
 *   {@link TowerPlatform}), so its inner face is a straight edge at `4.6 − 1.6` = 3.0 u from the axis
 *   — **0.2 u inside** {@link TOWER_COLUMN_RADIUS}, so the ledge is embedded rather than bridged to.
 *   This one wants the orbit IN, or the platform deeper.
 * - **A jump between two platforms has to get past the column**, this file's fourth unspecced rule:
 *   `PLATFORM_ORBIT · cos(TURN_DEGREES/2) − CAPSULE_RADIUS ≥ TOWER_COLUMN_RADIUS +
 *   JUMP_PATH_MARGIN`. At 4.6 the chord passes `4.6 · cos(30°)` = 3.9837 u from the axis and the
 *   capsule's edge reaches 3.4837, which clears a 3.2 column by **0.284 u** against
 *   {@link JUMP_PATH_MARGIN}'s 0.25. This one wants the orbit OUT.
 *
 * **4.2 satisfied the first and failed the second by 0.063 u**, on every one of the tower's sixteen
 * jumps, which is what the owner felt as the angle between one platform and the next being blocked.
 * The two rules are only compatible because the platform got deeper at the same time: subtracting them
 * gives `PLATFORM_DEPTH/2 ≥ TOWER_COLUMN_RADIUS · (1/cos 30° − 1) + (CAPSULE_RADIUS +
 * JUMP_PATH_MARGIN)/cos 30°` = 0.4950 + 0.8660 = **1.3610**, a depth of 2.7221, so no platform 2.4 u
 * deep can ever satisfy both at this column radius, whatever the orbit. (The two terms are the same
 * subtraction rearranged: the column rule alone puts the orbit at `(3.2 + 0.25 + 0.5)/cos 30°` =
 * 4.5611 at the least, and the embedding rule then wants the inner face no further out than 3.2 —
 * which is the bound {@link auditLayout} holds, an inner face AT 3.2 being legal there.)
 *
 * The shipped depth is 3.2, which clears that floor by 0.4779, and **neither rule asks for the
 * difference**: it is twice the sum of the two slacks this solution chose to take — the 0.2 u of
 * embedding above, and the 0.0389 u the orbit sits above its own floor of 4.5611. Both are choices,
 * not consequences, and only the first is load-bearing (a slab whose inner face lay exactly on the
 * curve would meet a round column at a single point). The depth then walks into {@link BOUNCE_REACH},
 * which caps it — that is the whole of the simultaneous system, and 4.6 / 3.2 / 2.3 is a solution to
 * it with margin on every side.
 *
 * A straight edge against a round column only meets it in the middle, and how far the ends part
 * company is a function of the slab's WIDTH and of the inner face's radius, neither of which moved:
 * an ordinary 2.4 u-wide slab's inner corners sit `√(3.0² + 1.2²)` = 3.2311 u from the axis, so they
 * stand **0.031 u** proud of the curve, and a capsule 1 u wide cannot fall through a 0.031 u crescent.
 * (An earlier draft said 0.15 u here; the figure was simply wrong, not measured against a different
 * number. The summit balcony is much wider and its ends part company by a lot more — see
 * {@link SUMMIT_PAD_WIDTH}.)
 */
const PLATFORM_ORBIT = 4.6;
/**
 * How wide an ordinary platform is ALONG the column's face. **Untuned**: 2.4 is a guess at "forgives
 * a missed landing" against a capsule 1 u wide, and it is also as wide as the headroom rule allows at
 * {@link TURN_DEGREES} — the two checkpoint pads are this size too, for that reason and not by
 * preference.
 *
 * It is the half of the old square that did NOT move, and it could not have: the gap between two
 * neighbouring slabs is `(PLATFORM_ORBIT − PLATFORM_DEPTH/2) · sin(TURN) − (PLATFORM_WIDTH/2) ·
 * (1 + cos TURN)`, which depends on the INNER FACE's radius and on this width alone. Widening this to
 * follow the depth to 3.2 would have collapsed that gap from 0.80 u to 0.20 u, under the capsule's own
 * 0.5 — the platforms are oblong now, and that is the reason.
 */
const PLATFORM_WIDTH = 2.4;
/**
 * How deep an ordinary platform is AWAY from the column. **Untuned**, and chosen inside a window the
 * two rules leave rather than derived from them: {@link PLATFORM_ORBIT}'s pair force `2 ·
 * (PLATFORM_ORBIT − TOWER_COLUMN_RADIUS)`, which is **2.8 u** at the shipped orbit of 4.6 and
 * **2.7221 u** at 4.5611, the lowest orbit a jump can clear the column from. The other end is
 * {@link BOUNCE_REACH}, which caps a landing pad at `2 · (2.3 − CAPSULE_RADIUS)` = 3.6 u. Both bounds
 * are live, and 3.2 sits 0.4 u off each: the 0.4 u above the first is the 0.2 u of embedding on each
 * side that {@link PLATFORM_ORBIT} accounts for, and under the second the rising bounce clears the
 * pad's outer edge by 0.7 u against the 0.5 u it needs.
 *
 * A deeper platform costs nothing the audit checks — the slab gap is set by the inner face and
 * {@link PLATFORM_WIDTH}, and the inner face has not moved — and it is the one direction a slab can
 * grow in without becoming a lid over its neighbour.
 */
const PLATFORM_DEPTH = 3.2;

// ---------------------------------------------------------------------------------------------
// The movement rules the layout is generated from
// ---------------------------------------------------------------------------------------------

/**
 * The most a jump can EVER gain: `jumpSpeed²/(2·gravity)` = **1.6875 u**. Derived from the domain's
 * own movement constants rather than written down here, so retuning `jumpSpeed` or `gravity` moves
 * the ceiling the layout is checked against instead of leaving this file asserting the old one.
 *
 * It is a ceiling, not a target — a step exactly this tall is cleared with zero margin, at the one
 * frame the arc is flat. {@link JUMP_RISE} is what the layout is built at; this is what
 * {@link auditLayout} holds every generated step to.
 */
const JUMP_APEX = (DEFAULT_CONFIG.jumpSpeed * DEFAULT_CONFIG.jumpSpeed) / (2 * DEFAULT_CONFIG.gravity);

/**
 * Height a jump step gains. **Untuned**: 1.4 against the {@link JUMP_APEX} 1.6875 u ceiling, i.e.
 * 0.29 u of margin for a missed landing.
 *
 * **It is now the number the whole climb's step heights come out of, which it was not.** Section 3
 * always added it directly; section 1 divided {@link SECTION_2_START} by a hand-written
 * {@link SECTION_1_STEPS}, so this constant documented a bound section 1 never consulted — raise the
 * section or drop a step and all thirteen steps grew with nothing here changing and nothing checking
 * the result against the apex. {@link SECTION_1_STEPS} is derived from this now, so the section's
 * per-step rise is at most this by construction, and {@link auditLayout} measures the rise the
 * generator produced rather than trusting either.
 */
const JUMP_RISE = 1.4;

/**
 * Degrees around the column per step and per link alike. **Untuned**: 60° puts the spiral on six
 * faces, which is what lets the column answer "which face am I on" (spec §2), and section 1 makes
 * 2.2 turns of it.
 *
 * It is the headroom rule in this file's header that fixes it this wide, together with
 * {@link PLATFORM_WIDTH}. Two slabs one turn apart are `2·4.6·sin(30°)` = 4.60 u between centres, and
 * the widest separating axis (the lower slab's tangential one) leaves **0.80 u** between their
 * footprints — comfortably more than the capsule's own {@link CAPSULE_RADIUS} 0.5, so no ledge has an
 * unstandable strip along its edge.
 *
 * **That 0.80 did not change when the platforms moved**, and it is worth knowing why: the gap works
 * out to `(PLATFORM_ORBIT − PLATFORM_DEPTH/2) · sin(TURN) − (PLATFORM_WIDTH/2) · (1 + cos TURN)`,
 * which sees the orbit and the depth only through the inner face's radius. Pushing the orbit out by
 * 0.4 and the depth out by 0.8 left that face exactly where it was, so this rule was never in play in
 * the re-solve — but it would have been the moment {@link PLATFORM_WIDTH} followed the depth.
 *
 * At 45° the same two slabs are **0.073 u** apart on that same axis — {@link reachAlong} run at 45°,
 * not an estimate — which is a seventh of the capsule's radius, so every ledge in section 1 loses its
 * outer edge and the audit warns on all of them. That is how this number was arrived at rather than
 * by feel. (An earlier draft said 45° *overlapped* by 0.17 u. It did not: 0.1796 is
 * `centreDistance − 2 · halfDiagonal` = `3.2145 − 3.3941`, which measures a slab by its corner in
 * every direction at once — precisely the support-function/face-distance confusion {@link reachAlong}
 * exists to stop. The conclusion survived the error; the number did not. **Both figures in that
 * parenthesis are from the superseded 4.2 / 2.4 layout** — 3.2145 is `2 · 4.2 · sin 22.5°` and 3.3941
 * the diagonal of a square 2.4 u slab; at 4.6 / 3.2 the same two are 3.5207 and 4.0. They are kept
 * as the arithmetic of the error being corrected, not as measurements of this tower.)
 *
 * A gap is not only headroom, it is also the jump — and the jump is measured from the LAUNCH, not
 * across the time spent above the far ledge. A player leaves the near edge at speed with nothing
 * under them until the far one, so the only moment their height matters is the one they arrive at
 * it, and what they cover by then is `topSpeed · (jumpSpeed + √(jumpSpeed² − 2·gravity·rise))
 * /gravity`: **2.12 u** holding Shift to walk (`maxSpeed` 4) over a +1.4 u step, and 4.24 u by
 * default, running. The 0.80 u above is the separating-axis figure; the footprints are **0.922 u**
 * apart at the nearest, and that is what {@link auditLayout} compares against the reach: a slab holds
 * a capsule when its centre is over the slab, so the crossing is footprint to footprint at both ends.
 * Read instead as launching and landing a clear capsule radius from either drop, the same step is
 * **2.288 u**, which every step in the tower is short of — 0.152 u on section 1's twelve, 0.168 u on
 * section 3's four. See {@link footprintDistance} for why that reading is spec §14.8's and not this
 * rule's.
 * Widening this starts to cost the walking margin — the tighter of the two, and the one that matters
 * because a player can choose to hold Shift through any jump in the tower.
 *
 * **This number is now squeezed from both sides, and 60 is what is left.** The rules above bound it
 * from below: 45° collapses the slab gap to 0.073 u. The column rule bounds it from ABOVE, through
 * `PLATFORM_ORBIT · cos(TURN_DEGREES/2)` — a wider turn swings the chord between two platforms nearer
 * the axis, so every degree added here has to be paid for by pushing {@link PLATFORM_ORBIT} out, and
 * every degree taken away has to be paid for by narrowing {@link PLATFORM_WIDTH}. Neither payment was
 * needed, which is the one reason this stayed at 60 through the re-solve rather than becoming another
 * unknown in it.
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
 * How much room the straight line between two platforms has to leave between the CAPSULE'S EDGE and
 * the column's surface, over and above touching it. **Untuned**: 0.25 u, half {@link CAPSULE_RADIUS},
 * is a guess at "a player who does not fly the ideal line still gets past" — nothing measures how far
 * off that line a jump actually strays, and the audit checks the ideal line rather than a played one.
 *
 * The rule it is the margin for is the fourth in this file's header, and the first found by playing
 * rather than by arithmetic: `PLATFORM_ORBIT · cos(TURN_DEGREES/2) − CAPSULE_RADIUS ≥
 * TOWER_COLUMN_RADIUS + JUMP_PATH_MARGIN`. The half-turn is where the chord between two platforms one
 * turn apart runs closest to the axis; everything else about the jump — its rise, its airtime, the
 * gap between the two footprints — was already checked and none of it looks at the thing in between.
 */
const JUMP_PATH_MARGIN = CAPSULE_RADIUS / 2;

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

/**
 * How far a bounce can be steered sideways before it lands. **Two numbers, because the player picks
 * the mode**, and the two rules the layout is checked against want opposite ends of that choice:
 *
 * - **Walking, 1.8421 u.** The narrower band, and the one a landing has to be REACHABLE inside: a
 *   player may hold Shift through any bounce in the tower, and a pad only a runner can reach is a pad
 *   the level lets you fail to reach by moving more carefully.
 * - **Running, 2.4533 u.** The wider band, and the one anything STANDING on a pad has to be clear of:
 *   running is what the character does with nothing held, so this is where a bounce comes down for a
 *   player who never touches the modifier. `acceleration` 13 over {@link BOUNCE_AIRTIME} 0.6144 s
 *   reaches 7.99 u/s and so never gets to `runSpeed` 8 at all — the ramp alone is the whole of it,
 *   which is why the wider band is 0.61 u wider rather than twice as wide.
 *
 * Keeping only the first is the bug this pair replaces. The tower shipped with walking as the
 * unmarked default, both rules were written against 1.84, and the modifier was then inverted without
 * either being revisited — leaving {@link auditLayout}'s prop rule policing a band 0.61 u short of
 * the one a player gets by default, which is precisely the mode it exists to protect.
 */
const BOUNCE_DRIFT_WALKING = airDrift(BOUNCE_AIRTIME, DEFAULT_CONFIG.maxSpeed);
const BOUNCE_DRIFT_RUNNING = airDrift(BOUNCE_AIRTIME, DEFAULT_CONFIG.runSpeed);

/**
 * How far outboard of its landing pad a bounce's crystal sits. **Untuned, and derived rather than
 * chosen**, because the bounce is *purely vertical*: the player leaves the crystal going straight up
 * and has to steer onto the pad under air control alone.
 *
 * Two bounds, and 2.3 sits between them:
 *
 * - **Not less than 2.1** = `PLATFORM_DEPTH/2 + CAPSULE_RADIUS`, or the rising capsule hits the pad
 *   instead of clearing it. This bound is why a landing pad may not be deeper than
 *   `2 · (BOUNCE_REACH − CAPSULE_RADIUS)` = 3.6 u, the summit balcony included, and it is what the
 *   first draft of this layout got wrong — a 2.0 u reach against a 3.6 u pad put every chain's last
 *   bounce under the slab it was aimed at. **It is a bound on the CAPSULE and nothing else**, here
 *   and in {@link auditLayout}, which measures crystal centre to pad edge: the crystal's own mesh is
 *   `CRYSTAL_EXTENT` 1.2728 u across (`crystals.ts`), so its inner tip reaches 0.6364 u inboard of
 *   its centre against the 0.7 u of radial gap `BOUNCE_REACH − PLATFORM_DEPTH/2` leaves — 0.064 u
 *   outside the pad's outer face, at the pad's own height, where the previous layout had 0.264 u.
 *   At this bullet's own floor of 2.1 the tip would be 0.136 u INSIDE the slab. Nothing checks that,
 *   and nothing about the bounce breaks if it happens — the crystal is not a collider — it would
 *   simply look wrong. If this number is ever taken toward its floor, look at the crystal before
 *   trusting the bound.
 * - **Not more than 2.94** = `BOUNCE_DRIFT_WALKING + (PLATFORM_DEPTH/2 − CAPSULE_RADIUS)`, or the
 *   drift runs out before the capsule is over the pad: the player has to cross the reach less the
 *   pad's own near half, and 1.84 + 1.1 is all there is. The walking drift, because a player who
 *   holds Shift through the bounce must still land — see {@link BOUNCE_DRIFT_WALKING}.
 *
 * **It moved with the platforms.** 2.1 was legal against a pad 2.4 u deep by 0.4 u and against a pad
 * 3.2 u deep by nothing at all — exactly on the first bound, which is a rule satisfied by rounding
 * rather than by argument, and which {@link auditLayout} would have flipped on the first bit of
 * floating-point noise in the reach it measures. 2.3 keeps 0.2 u under the first bound and 0.64 u
 * under the second, which is the more comfortable half of a window 0.84 u wide.
 *
 * **The second bound replaces a wrong argument as well as a wrong number.** It used to read "~2.4",
 * from "the bounce's whole 0.75 s of airtime above pad height" giving 2.38 u of drift. Two errors:
 * the window is {@link BOUNCE_AIRTIME} 0.614 s and the drift 1.84 u, not 0.75 s and 2.38; and the
 * quantity to bound is the drift needed to reach the pad's near HALF, not the drift needed to reach
 * its centre. Both corrections still stand, and the second is doing less work than it was: against
 * the drift alone, which is the distance to the pad's centre, 2.3 is 0.46 u too far, and it is the
 * pad's near half that pays for it.
 *
 * What 2.3 actually leaves: a player who holds inward the whole way comes down 0.46 u outboard of the
 * pad's centre, orbit 5.06 against a pad spanning 3.0–6.2, and the drifts that land safely run from
 * 1.20 u (capsule just inside the outer edge) to 1.84 u — a 0.64 u band, if the player holds Shift and
 * walks the bounce. Running — the default, nothing held — buys less extra reach than it looks like it
 * would: `acceleration` 13 over 0.614 s ends at 7.99 u/s and so never reaches `runSpeed` 8, which
 * leaves the cap inert and running on the bare ramp at 2.45 u — 0.61 u more than walking's 1.84
 * rather than the 3.68 that doubling the top speed would suggest. On this deeper pad that overshoots
 * inward to 0.15 u past the centre and still lands. That 0.15 u is not a curiosity: it is the reason
 * {@link auditLayout} checks props against {@link BOUNCE_DRIFT_RUNNING} and not against the walking
 * band, which stops 0.46 u short of the centre and would have declared the middle of every pad
 * unlandable-on.
 *
 * **One thing none of this models, and {@link auditLayout} does not either.** `stepHoming` bounces on
 * the frame `homingSpeed · delta >= remaining`, so the launch is not the crystal: it is up to
 * `homingSpeed · MAX_DT` = 0.8 u short of it, back along the dash, which is lower and so has less
 * airtime. It is left unchecked because the launch point depends on where the player pressed, which
 * is not a level coordinate. It was worked through by hand for the tightest case in the tower, the
 * summit link pressed at the apex of the jump off the platform below, and redone on the re-solved
 * layout: the launch lands 0.48 u low and 0.47 u inboard, leaving 0.508 s and 1.42 u of drift against
 * the 0.73 u it then needs — **0.69 u of margin**, against the nominal launch's 0.64 u. Both are
 * wider than they were before the platforms moved (0.45 and 0.44), because the pad the bounce aims at
 * got 0.8 u deeper. If a future link is steeper than these, redo it.
 */
const BOUNCE_REACH = 2.3;
/** Distance from the axis to a crystal — {@link BOUNCE_REACH} outboard of the platform orbit, by
 *  construction rather than by choice. Putting the chain crystals on that same orbit keeps them on
 *  one spiral with the landing ones, and leaves every crystal 3.7 u clear of the column's surface. */
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
 * subtraction. A 1.0 pedestal centred on a pad {@link PLATFORM_DEPTH} 3.2 u deep leaves 0.6 u of pad
 * at each radial edge, and a capsule standing clear of the disc needs its centre `1.0 +
 * CAPSULE_RADIUS` = 1.5 u from the disc's axis where the pad lets it reach 1.1 — there is no rim, and
 * there is no version of this number that makes one, because the depth is capped by
 * {@link BOUNCE_REACH} and not by choice. **The re-solve deepened the pad by 0.8 u and did not change
 * that**: the rim gained 0.4 u and needed 0.5. The pedestal does not fit *around*; it fits *beside*.
 * See {@link SUMMIT_PEDESTAL_OFFSET}.
 */
export const TOWER_SUMMIT_RADIUS = 1;

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
 * turn back, which lies `PLATFORM_ORBIT · sin(TURN_DEGREES)` = 3.98 u along the face in the positive
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
 * radial depth stays {@link PLATFORM_DEPTH}, because the summit is reached by a bounce and
 * {@link BOUNCE_REACH} caps how deep a landing pad may be — at 3.2 against that cap's 3.6, the
 * balcony is 0.8 u deeper than the one the first playthrough landed on and still legal.
 *
 * 6.0 is wide enough that what it looks like is worth writing down: the slab's inner face is a
 * straight chord at radius 3.0 while the column curves away behind it, so at the balcony's ends the
 * two are 1.89 u apart radially and the inner corners stand 1.04 u proud of the column's surface —
 * against 0.031 u for an ordinary slab (see {@link PLATFORM_ORBIT}). That is not a hole; it opens
 * sideways past the column rather than through the floor. It is an inside edge you can walk off.
 *
 * The summit has been stood on and screenshotted (spec §14.7) and the last bounce landed on this
 * balcony nineteen times out of nineteen (§14.1) — but **that was the layout before this one**, and
 * §14 is marked accordingly. The balcony's width, its pedestal and this inside edge are unchanged; the
 * orbit it sits at and its depth are not. The 19/19 is re-derived here rather than re-measured, and
 * the edge was not looked at specifically then either, so it is still the first thing to look at the
 * next time somebody is up there.
 */
const SUMMIT_PAD_WIDTH = 2 * (SUMMIT_PEDESTAL_OFFSET + TOWER_SUMMIT_RADIUS);

/**
 * Where a fall stops counting as a step down. **Untuned**: 4 u is a guess at "deeper than any
 * deliberate drop between platforms, shallower than a fall that would hang before resolving".
 *
 * One edge is measured; the other is reachable and was not (spec §14.3). Stepping off a checkpoint
 * pad leaves **0.450 s** — 27 frames at 60 fps — between the frame the fall is detected and the frame
 * the respawn fires; that is what "a fall that would hang before resolving" costs at this value, and
 * whether 0.45 s reads as a hang is a judgement nobody has made.
 *
 * The shallow edge is straddled inside section 1, whose thirteen steps land at `18·i/13` — but mind
 * the frame. `stepTowerProgress` compares the capsule CENTRE against `activateY`, and a standing
 * capsule rides {@link CAPSULE_HALF} 1 u above its pad, so the drop this margin sees is a metre less
 * than the drop between two pad tops. That is the same offset {@link TOWER_CHECKPOINTS} spends on
 * activating early, read in the other direction.
 *
 * A player who steps back down off the section-2 checkpoint at 18 lands on 16.615, 15.231 or 13.846,
 * putting their centre **0.385 u**, **1.769 u** and **3.154 u** below its `activateY` — all three
 * inside this margin, all three an ordinary move down rather than a fall. The fourth step, 12.462,
 * puts it **4.538 u** below and respawns them. So 4 falls between two real drops a player can take
 * from the same pad, which is what makes it a boundary worth playing rather than an unreachable one
 * — nobody has played it. See the design spec §4.
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
  return { x: spot.x, y: spot.y, z: spot.z, width, depth: PLATFORM_DEPTH, rotationY: (90 - bearing) * DEG };
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

/** The widest separating gap between two slabs in the ground plane, over both slabs' face normals —
 *  negative where they overlap. It is the strip of the lower slab the upper one does not cover, which
 *  is what the overhang rule wants. It is NOT the distance between them: a separating-axis maximum is
 *  a lower bound on that (0.798 u where the footprints are 0.922 u apart), which is why the crossing
 *  rule uses {@link footprintDistance} instead. */
const slabGap = (a: TowerPlatform, b: TowerPlatform): number => {
  const offset = { x: b.x - a.x, z: b.z - a.z };
  return [...axesOf(a), ...axesOf(b)].reduce(
    (widest, axis) =>
      Math.max(widest, Math.abs(offset.x * axis.x + offset.z * axis.z) - reachAlong(a, axis) - reachAlong(b, axis)),
    -Infinity,
  );
};

/** A footprint's four edges, as corner pairs in perimeter order. */
const edgesOf = (corners: readonly { x: number; z: number }[]) =>
  corners.map((corner, i) => [corner, corners[(i + 1) % corners.length]] as const);

/** The four corners of a slab's footprint, in perimeter order. */
const cornersOf = (p: TowerPlatform) => {
  const [along, out] = axesOf(p);
  return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([s, t]) => ({
    x: p.x + s * along.x * along.half + t * out.x * out.half,
    z: p.z + s * along.z * along.half + t * out.z * out.half,
  }));
};

/** Distance from a point to a segment, clamped to the segment's ends. */
const pointToSegment = (
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number => {
  const run = { x: b.x - a.x, z: b.z - a.z };
  const length = run.x * run.x + run.z * run.z;
  const along = length === 0 ? 0 : ((p.x - a.x) * run.x + (p.z - a.z) * run.z) / length;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(p.x - a.x - t * run.x, p.z - a.z - t * run.z);
};

/**
 * The shortest open air between two slabs' footprints — the easiest place to cross from one to the
 * other, and exact rather than bounded.
 *
 * **Not {@link slabGap}, and the difference has a direction.** A separating-axis maximum is a LOWER
 * bound on the distance between two rectangles: on today's one-turn step it reports 0.798 u where
 * the footprints are 0.922 u apart. Under-measuring is the safe bias for the overhang rule, which
 * warns when a gap is too NARROW — the worst it can do there is ask for a second look. A rule that
 * warns when a gap is too WIDE has the opposite need, and the same bias would hide the violations it
 * exists to catch, so it gets the real distance.
 *
 * Exact for disjoint convex polygons: the closest pair of points on two of them always has one of
 * the two on a vertex, so the minimum over every vertex-to-edge pair is the distance itself. Slabs
 * that overlap are not disjoint and this does not measure them — {@link auditLayout}'s only caller
 * compares it against a reach, and an overlap is not a gap anything has to be jumped across.
 *
 * **Why neither end of a crossing is inset for the capsule.** A capsule's lower cap is a hemisphere
 * whose lowest point sits directly below the centre, so a flat slab holds it exactly when the CENTRE
 * is over the footprint — there is no radius of inset in the support test, at the launch or at the
 * landing. Three rounds of review pushed one in, each step sound against the one before it and the
 * chain drifting off the physics: air alone (0.9215 u on a one-turn step), then plus a flat radius
 * (1.4215), then to a landing set inset by a radius, which at a corner is `R·√2` away (1.6150).
 *
 * The version that fixed the asymmetry the last of those left — inset at BOTH ends — measures
 * **2.2876 u**, and every one of the tower's sixteen steps is short of it: section 1's twelve rise
 * `18/13` = 1.3846 u for a {@link stepReach} of 2.1355 at `maxSpeed`, **0.152 u** short, and section
 * 3's four rise 1.4 u for 2.1191, **0.168 u** short. That is not noise, and it is not this rule's to
 * spend: under a *comfortably standing* reading — launching and landing a clear capsule radius from
 * the drop — walking the tower does not work, which is the owner's own playtest note that the jumps
 * needed speed, arrived at from the geometry. But comfort is a preference and the audit holds
 * bounds, and the file keeps those apart deliberately (spec §3's 6–8 u link band is left to prose
 * for the same reason). The bound is the necessary condition — a step whose footprints a walking
 * player cannot reach across AT ALL is unclimbable, not merely tight — and the comfort reading is
 * spec §14.8's question 8.
 */
const footprintDistance = (a: TowerPlatform, b: TowerPlatform): number => {
  const footprints = [cornersOf(a), cornersOf(b)] as const;
  return Math.min(
    ...([[0, 1], [1, 0]] as const).flatMap(([from, to]) => {
      const edges = edgesOf(footprints[to]);
      return footprints[from].flatMap((corner) =>
        edges.map(([head, tail]) => pointToSegment(corner, head, tail)),
      );
    }),
  );
};

/**
 * How much open air a jump can carry the player across, when the far side stands `rise` higher than
 * the near one and they hold `topSpeed` throughout. `null` when the rise is past {@link JUMP_APEX}:
 * the step is then not a long jump but an impossible one, which is the apex rule's to report.
 *
 * **Measured from the launch, not across a window.** The player leaves the near edge at full speed
 * with nothing under them until the far edge, so the only moment the height matters is the one they
 * arrive at it: they clear the step if their feet are still above `rise` then. The vertical is
 * ballistic from a standing jump, so that lasts until the later root of `jumpSpeed·t −
 * (gravity/2)·t² = rise` and the ground covered by then is `topSpeed · (jumpSpeed +
 * √(jumpSpeed² − 2·gravity·rise))/gravity`. At `rise` 0 that is `movementConstants.ts`' own
 * `topSpeed · 2·jumpSpeed/gravity`, the 6 u it quotes for a running jump.
 *
 * (An earlier version measured the span BETWEEN the two roots — the time spent above `rise` — which
 * is the answer to a question about hovering, not about crossing. It came out at 1.271 u against
 * this 2.135 u over section 1's step, and would have warned on gaps a walking player crosses with
 * 0.7 u to spare. Full speed throughout is not the assumption doing the work; the launch is.)
 */
const stepReach = (rise: number, topSpeed: number): number | null => {
  const { jumpSpeed, gravity } = DEFAULT_CONFIG;
  const discriminant = jumpSpeed * jumpSpeed - 2 * gravity * rise;
  return discriminant < 0 ? null : (topSpeed * (jumpSpeed + Math.sqrt(discriminant))) / gravity;
};

/**
 * How close the straight line between two platforms' centres comes to the column's AXIS, in the
 * ground plane.
 *
 * The SEGMENT, not the infinite line through the two points — but that is a **guard against a future
 * layout, and it is unreachable on today's inputs.** Every platform in {@link TowerLayout.jumpSteps}
 * sits at {@link PLATFORM_ORBIT}, and for two points on the same circle the nearest approach to the
 * centre is the midpoint: the projection {@link pointToSegment} takes works out to exactly 0.5
 * **whatever the turn between them**, so its clamp never bites. Every pair it is actually handed is
 * one turn apart; even the 240° pair
 * section 2's chain leaves between consecutive platforms — which is never handed to it, and is the
 * reason {@link TowerLayout.jumpSteps} exists — would still come out at 0.5, at 2.3 u from the axis
 * and squarely inside the column. (An earlier version of this comment claimed the opposite: that a
 * chord more than a half turn apart has its nearest approach outside the span between its ends. It
 * does not, and no pair in this tower has ever exercised the clamp.)
 *
 * What it protects is the case where the two ends are at DIFFERENT radii, which nothing generates
 * today but a pad on its own orbit would: that projection then leaves [0, 1] whenever the axis is
 * "behind" one of the ends, and the infinite line would report a clearance measured at a point the player
 * never crosses — a jump waved through on geometry that is not on the path. Cheaper to clamp than to
 * assert every caller keeps both ends on one orbit.
 */
const axisClearance = (from: TowerPlatform, to: TowerPlatform): number =>
  pointToSegment({ x: 0, z: 0 }, from, to);

/** A point on a slab's TOP face, given in the slab's own axes — see {@link TowerPadProp}. */
const onPad = (p: TowerPlatform, along: number, outward: number): Vec3 => {
  const [face, out] = axesOf(p);
  return vec3(p.x + along * face.x + outward * out.x, p.y, p.z + along * face.z + outward * out.z);
};

/**
 * Jump steps in section 1. **Derived, not chosen**: the fewest steps that get 18 u up without any of
 * them gaining more than {@link JUMP_RISE} — `ceil(18 / 1.4)` = **13**, which puts the per-step rise
 * at 18/13 = **1.3846 u**, just inside the rule rather than exactly on it. Spec §3's own estimate for
 * this section is "~13 steps", so the derivation and the spec agree; it is written as a derivation
 * because as a literal it agreed with {@link JUMP_RISE} only by coincidence, and went on agreeing
 * with it however far either drifted.
 *
 * The rounding is the whole of the safety here: taking the ceiling can only make the steps SHORTER
 * than {@link JUMP_RISE}, never taller, so section 1 cannot grow past the jump apex whatever
 * {@link SECTION_2_START} becomes. What it can do is grow a step count nobody wanted, which is a
 * visible consequence rather than an unclimbable tower.
 *
 * **This count and {@link SECTION_2_LINKS} are what spec §14.2 says should move first.** Timed on a
 * scripted climb that never misses, a jump step costs **62–79 frames** at 60 fps — a mean of 69.6,
 * **1.160 s** — and a chained homing link **0.37 s**, so 13 steps against 4 links runs 15.1 s
 * against 2.4 s. Only three of section 2's four links are chained; the fourth ends on a platform and
 * costs an isolated link's 1.18 s, which is what makes 4 × 0.37 the wrong way to rebuild that 2.4.
 * §3 matched the sections on height-per-vocabulary and assumed the times would follow; they follow
 * the *count* instead. Neither number was changed for that — retuning the shape of the climb is the
 * owner's call, not a fix.
 *
 * **The knob for that retune is {@link JUMP_RISE} or {@link SECTION_2_START}, and there is a floor on
 * it.** Fewer steps means taller ones, and taller ones run into the apex: at 18 u this section cannot
 * be climbed in fewer than `ceil(18 / 1.6875)` = **11** steps, and the eleventh-step layout has
 * 1.6364 u steps with 0.05 u of margin. Cutting 15.1 s by much more than a sixth means lowering the
 * section rather than emptying it.
 */
const SECTION_1_STEPS = Math.ceil((SECTION_2_START - TOWER_FLOOR_Y) / JUMP_RISE);
/** Homing links in section 2. **Untuned**: 4, spec §3's "~4 crystals", which over 18 → 42 puts the
 *  rise per link at exactly **6.0 u** — the bottom of the spec's 6–8 band. The band is a comfort
 *  preference; the hard bound is `homingRange` 12, which no lock is made past, and which the chain
 *  meets at `hypot(2·CRYSTAL_ORBIT·sin(30°), 6.0)` = **9.14 u** crystal to crystal. Dropping this to
 *  2 would put them 13.84 u apart and make the section uncrossable, which is why
 *  {@link auditLayout} measures it. See {@link SECTION_1_STEPS} for what spec §14.2 measured this
 *  section against. */
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
  /** `[crystal, the pad its bounce lands on]` for every link that ends on a platform — the pairs
   *  {@link auditLayout} checks {@link BOUNCE_REACH} against. */
  readonly bounceLandings: readonly (readonly [Vec3, TowerPlatform])[];
  /** `[from, to]` for every transition the player crosses by JUMPING — the pairs
   *  {@link auditLayout} checks the column against. Built here rather than inferred from
   *  `platforms`, because "consecutive in climb order" is not the same as "jumped between": the pad
   *  that catches section 2's chain is four turns on from the slab before it, and the chord between
   *  those two passes the axis on the far side of the column. */
  readonly jumpSteps: readonly (readonly [TowerPlatform, TowerPlatform])[];
  /** `[height jumped from, height landed on]` for every jump the climb asks for — the pairs
   *  {@link auditLayout} checks {@link JUMP_APEX} against. A superset of {@link jumpSteps}: it also
   *  carries section 1's first step, which is jumped from the floor and so has a rise to check but no
   *  chord for the column rule to look at. Heights rather than platforms, because the rule is about
   *  the climb and the floor is not a platform. */
  readonly jumpRises: readonly (readonly [number, number])[];
  /** `[where the dash is aimed from, the crystal it locks on to]` for every homing link — the pairs
   *  {@link auditLayout} checks `homingRange` against. The first end is the capsule's CENTRE, because
   *  that is what `playerController` hands `selectHomingTarget` as its `from`: {@link CAPSULE_HALF}
   *  above a pad's top face when the link is pressed standing, and the previous crystal itself when
   *  it is chained off a bounce (see {@link BOUNCE_RISE}). */
  readonly homingLinks: readonly (readonly [Vec3, Vec3])[];
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
  const jumpSteps: (readonly [TowerPlatform, TowerPlatform])[] = [];
  const jumpRises: (readonly [number, number])[] = [];
  const homingLinks: (readonly [Vec3, Vec3])[] = [];
  let bearing = SPIRAL_START_DEGREES;

  /** Where a dash pressed on `pad` is aimed FROM: the capsule's centre, which rides
   *  {@link CAPSULE_HALF} above whatever it stands on. */
  const standingAim = (pad: TowerPlatform): Vec3 => vec3(pad.x, pad.y + CAPSULE_HALF, pad.z);

  /** A link that ends on a platform: a crystal `rise` above `fromY` — the last standing height, or
   *  the last crystal when the link is chained off one — and the pad its bounce lands on, one
   *  {@link BOUNCE_REACH} inboard of it. `aim` is where the dash is pressed from, which is not `fromY`
   *  in either case: see {@link TowerLayout.homingLinks}. Returns the pad it lands on. */
  const link = (fromY: number, aim: Vec3, rise: number, padWidth: number): TowerPlatform => {
    bearing += TURN_DEGREES;
    const crystal = at(CRYSTAL_ORBIT, bearing, fromY + rise);
    const pad = slab(bearing, crystal.y + BOUNCE_RISE, padWidth);
    crystals.push(crystal);
    platforms.push(pad);
    bounceLandings.push([crystal, pad]);
    homingLinks.push([aim, crystal]);
    return pad;
  };

  /** One jump step onto a new slab one turn on, recorded together with the platform it is jumped
   *  FROM. `from` is undefined only for the first step of section 1, which is jumped from the floor:
   *  that approach runs radially inward from {@link TOWER_SPAWN} at orbit 7 rather than around the
   *  column, so there is no chord for the column rule to check and nothing is lost by omitting it
   *  THERE. Its rise is checked like every other, from {@link TOWER_FLOOR_Y}. */
  const step = (y: number, from: TowerPlatform | undefined): TowerPlatform => {
    bearing += TURN_DEGREES;
    const pad = slab(bearing, y, PLATFORM_WIDTH);
    platforms.push(pad);
    jumpRises.push([from ? from.y : TOWER_FLOOR_Y, y]);
    if (from) jumpSteps.push([from, pad]);
    return pad;
  };

  // Section 1 — pure platform jumping, floor to 18. The rise is written as a fraction of the whole
  // section rather than as a repeated addition, so the last step lands on SECTION_2_START exactly —
  // and it stays under JUMP_RISE because SECTION_1_STEPS is derived from JUMP_RISE by rounding UP.
  let standing: TowerPlatform | undefined;
  for (let i = 1; i <= SECTION_1_STEPS; i++) {
    standing = step(TOWER_FLOOR_Y + ((SECTION_2_START - TOWER_FLOOR_Y) * i) / SECTION_1_STEPS, standing);
  }
  const section2Pad = platforms[platforms.length - 1];

  // Section 2 — the homing chain, 18 to 42. Only the LAST link ends on a platform; the three before
  // it end on the next crystal, which is what makes the section a chain rather than four hops.
  const chainRise = (SECTION_3_START - SECTION_2_START) / SECTION_2_LINKS;
  // The first link is pressed standing on the pad section 1 ends on; every one after it is pressed
  // in the air, at the crystal the previous bounce left from. That is the distance homingRange is
  // measured over, so it is carried rather than recomputed.
  let aim = standingAim(section2Pad);
  for (let i = 1; i < SECTION_2_LINKS; i++) {
    bearing += TURN_DEGREES;
    const crystal = at(CRYSTAL_ORBIT, bearing, SECTION_2_START + chainRise * i);
    crystals.push(crystal);
    homingLinks.push([aim, crystal]);
    aim = crystal;
  }
  const section3Pad = link(SECTION_2_START + chainRise * (SECTION_2_LINKS - 1), aim, chainRise, PLATFORM_WIDTH);

  // Section 3 — mixed, 42 to 62: two steps, a link, two steps, a link onto the summit.
  const linkRise =
    (SUMMIT_Y - SECTION_3_START - SECTION_3_LINKS * SECTION_3_STEPS_PER_RUN * JUMP_RISE) / SECTION_3_LINKS;
  let y = SECTION_3_START;
  standing = section3Pad;
  for (let i = 0; i < SECTION_3_LINKS; i++) {
    for (let s = 0; s < SECTION_3_STEPS_PER_RUN; s++) {
      y += JUMP_RISE;
      standing = step(y, standing);
    }
    const last = i === SECTION_3_LINKS - 1;
    standing = link(y, standingAim(standing), linkRise, last ? SUMMIT_PAD_WIDTH : PLATFORM_WIDTH);
    y = standing.y;
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
    platforms, crystals, checkpointPads: [section2Pad, section3Pad], bounceLandings, jumpSteps,
    jumpRises, homingLinks, props: [pedestal],
  };
}

/**
 * Every rule this file states as a BOUND, checked against the layout that was actually generated
 * rather than against the prose that produced it: the two the header opens with, the four found the
 * hard way, the embedding rule from {@link PLATFORM_ORBIT} and the walking-reach rule from
 * {@link TURN_DEGREES}. Four of them were violated by drafts of this file — the column rule by the
 * draft that SHIPPED, which is why it is here — and none of them shows up as anything but a level
 * that plays wrong.
 *
 * **The walking-reach rule is the second half of a bound the audit only knew one end of.** A slab
 * gap has a floor — narrower than {@link CAPSULE_RADIUS} and it is a strip nobody can stand on —
 * and a ceiling, which {@link TURN_DEGREES} names as the binding one: a player may hold Shift
 * through any jump in the tower, so a gap wider than {@link stepReach} at `maxSpeed` closes the
 * section to them. Only the floor was checked, and nothing else in this file bounds
 * {@link PLATFORM_WIDTH} from below while that same doc offers narrowing it as the price of a
 * smaller turn. The shipped tower is nowhere near it — the widest crossing is 0.922 u of air plus a
 * landing against 2.119 u of reach — but narrowing the width to 0.8 opens that air to 2.307 u, and
 * before this rule every warning here stayed silent on it. Widening {@link TURN_DEGREES} to 90°
 * opens it further still, to 2.546 u, and proves nothing about this rule: the column rule already
 * fires on all sixteen steps at that turn, the chord passing `4.6 · cos 45°` = 3.253 u from the axis
 * so the capsule's edge reaches 2.753 u where it needs 3.45. Narrowing the width is the perturbation
 * only this rule catches.
 *
 * **The header's own two rules were the last in**, and their absence was the sharpest version of the
 * problem this function exists for: the audit knew the four rules nobody had written down and not the
 * two everything else is derived from. A jump step past {@link JUMP_APEX} is a step the player cannot
 * make, and a crystal past `homingRange` is a crystal that never locks; either one ends the climb
 * where it stands, and both were held by arithmetic in a doc comment. They are checked first here
 * because they are the two that make a section impossible rather than unpleasant.
 *
 * **Two things about those rules are deliberately outside this.** Spec §3's 6–8 u comfort band for a
 * link is a preference and not a bound — a 5 u link is dull, not unclimbable — and is left to the
 * prose on {@link SECTION_2_LINKS} and {@link SECTION_3_LINKS}. The 35° selection cone is not a level
 * coordinate at all: what it measures is the angle between the crystal and where the CAMERA is
 * looking, which is the player's to decide and not this file's — the same reason the launch point of
 * a chained bounce is left unchecked below.
 *
 * **The embedding rule is here because it is the only one bounding {@link PLATFORM_ORBIT} from the
 * INSIDE, and it was the one the audit could not see.** The column rule wants the orbit further out
 * and the embedding rule wants it further in, so every re-solve that answers the first walks towards
 * breaking the second — which is exactly what the last one did, pushing the orbit 4.2 → 4.6 and
 * leaving 0.2 u of embedding held by arithmetic in a doc comment. The next such push detaches every
 * ledge from the column, and until this loop existed it would have passed a clean audit.
 *
 * **The two slab measures are not the same measure, and the difference is deliberate.** The overhang
 * rule uses {@link slabGap}, a separating-axis maximum over the four face normals: a lower bound on
 * the true distance between two rectangles, so passing it is conclusive and failing it is a warning
 * worth looking at rather than proof. That bias is only safe for a rule that fires on gaps too
 * NARROW. The walking-reach rule fires on gaps too WIDE, where under-measuring would hide exactly
 * what it is looking for, so it uses {@link footprintDistance} instead — exact, and no cheaper than
 * it needs to be at sixteen steps once per load.
 *
 * **What the column rule is run over.** {@link TowerLayout.jumpSteps} — the transitions the player
 * crosses by jumping — and not every consecutive pair of platforms, because "next in climb order" is
 * not "jumped to": section 2's chain leaves four turns between two platforms and the chord between
 * those passes the axis on the far side of the column. The transitions it therefore does NOT check are
 * the links, which go out to a crystal at {@link CRYSTAL_ORBIT} and come back down vertically and so
 * are never near the column, and the first step of section 1, which is jumped from the floor on a
 * radial approach from {@link TOWER_SPAWN} rather than around anything. It is the ideal line between
 * two centres, not a played one; {@link JUMP_PATH_MARGIN} is what stands in for the difference.
 *
 * **What the overhang loop is run over, and what it is deliberately not.** It walks `platforms` only.
 * Three things are outside it, each on purpose rather than by omission:
 *
 * - **The floor.** It is a standable surface (spec §4) and section 1's first slab genuinely is a lid
 *   over it — 18/13 = 1.3846 u up, less 0.4 u of slab, is 0.98 u of headroom against a 2 u capsule —
 *   so including it would warn. That is accepted rather than fixed, and the alternative is worse: the
 *   first step would have to rise to 2.4 u to clear the capsule, which is above the 1.6875 u jump
 *   apex, so it would stop being reachable from the floor at all. What the lid covers is one
 *   2.4 × 3.2 patch of a disc 28 u across, at orbit 3.0–6.2 where the column already takes the middle
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
function auditLayout(
  { platforms, bounceLandings, jumpSteps, jumpRises, homingLinks, props }: TowerLayout,
): void {
  for (const [from, to] of jumpRises) {
    // The apex is the whole of it: a jump is a ballistic arc from a standstill in the vertical, so
    // what it can gain does not depend on the run-up, the turn or the pad. Measured on the rise the
    // generator produced rather than on JUMP_RISE, because what has to be jumpable is the step that
    // exists — section 1 rounds its own rise down out of JUMP_RISE, and a future section need not.
    const rise = to - from;
    if (rise > JUMP_APEX) {
      console.warn(`[towerLevel] the step from y=${from} to y=${to} cannot be jumped — it gains ${rise.toFixed(4)} u against a jump apex of ${JUMP_APEX} u, so the section it is in cannot be climbed. See JUMP_RISE.`);
    }
  }

  for (const [aim, crystal] of homingLinks) {
    // `selectHomingTarget` measures the straight 3D line from the capsule's centre and refuses
    // anything past homingRange outright, so a link longer than this is not a hard link — it is a
    // crystal the reticle never offers and a dash that never fires.
    const reach = Math.hypot(crystal.x - aim.x, crystal.y - aim.y, crystal.z - aim.z);
    if (reach > DEFAULT_CONFIG.homingRange) {
      console.warn(`[towerLevel] the crystal at y=${crystal.y} is out of homing range from y=${aim.y} — ${reach.toFixed(3)} u against homingRange ${DEFAULT_CONFIG.homingRange}, so it can never be locked on to. See SECTION_2_LINKS.`);
    }
  }

  for (const [from, to] of jumpSteps) {
    // The column is a cylinder, so the whole of the jump is judged by the chord's nearest approach to
    // the axis; the capsule is a capsule, so its edge reaches CAPSULE_RADIUS further in than its own
    // path does, at every height it passes through.
    const path = axisClearance(from, to);
    const room = path - CAPSULE_RADIUS - TOWER_COLUMN_RADIUS;
    if (room < JUMP_PATH_MARGIN) {
      console.warn(`[towerLevel] the jump from y=${from.y} to y=${to.y} is blocked by the column — the line between them passes ${path.toFixed(3)} u from the axis, so a ${CAPSULE_RADIUS} u capsule's edge reaches ${(path - CAPSULE_RADIUS).toFixed(3)} u against a column of ${TOWER_COLUMN_RADIUS}: ${room.toFixed(3)} u where ${JUMP_PATH_MARGIN} is required. See PLATFORM_ORBIT.`);
    }
  }

  for (const ledge of platforms) {
    // Every slab is turned to face the column, so its inner edge is a straight line square on to the
    // axis at `orbit − depth/2`, and the rule is that the line falls INSIDE the column. Checked from
    // the generated slab's own orbit and depth rather than from the constants the loop above cites,
    // because a pad on its own orbit is exactly the case this has to keep catching.
    const innerEdge = Math.hypot(ledge.x, ledge.z) - ledge.depth / 2;
    if (innerEdge > TOWER_COLUMN_RADIUS) {
      console.warn(`[towerLevel] the slab at y=${ledge.y} does not reach the column — its inner edge is ${innerEdge.toFixed(3)} u from the axis against a column of ${TOWER_COLUMN_RADIUS}, so the ledge hangs off nothing and floats ${(innerEdge - TOWER_COLUMN_RADIUS).toFixed(3)} u clear of it. See PLATFORM_ORBIT.`);
    }
  }

  for (const [crystal, pad] of bounceLandings) {
    // The crystal is directly outboard of the pad's centre, so the radial edge is the nearest one.
    const reach = Math.hypot(crystal.x - pad.x, crystal.z - pad.z);
    const clearance = reach - pad.depth / 2;
    if (clearance < CAPSULE_RADIUS) {
      console.warn(`[towerLevel] the bounce at y=${crystal.y} rises into its own landing pad — ${clearance.toFixed(2)} u of room for a ${CAPSULE_RADIUS} u capsule. See BOUNCE_REACH.`);
    }

    // Where the bounce can put the capsule down, as an offset outward from the pad's centre: the
    // outermost the capsule can stand, inward to wherever the drift runs out. It rises on the pad's
    // own bearing and steers straight in, so the whole band sits on the pad's centre line and `along`
    // is zero throughout.
    //
    // TWO bands, because the player chooses the mode and the two rules below want opposite ends of
    // that choice (see BOUNCE_DRIFT_WALKING). Reaching the pad at all has to work on the NARROWER
    // one — a player may hold Shift through any bounce, and a landing only a runner can make is a
    // landing the level lets you fail by moving carefully. Standing clear of a prop has to hold on
    // the WIDER one, the keyless default, because that is where a bounce comes down for a player who
    // never touches the modifier.
    const outermost = pad.depth / 2 - CAPSULE_RADIUS;
    const innermostWalking = Math.max(reach - BOUNCE_DRIFT_WALKING, -outermost);
    const innermostRunning = Math.max(reach - BOUNCE_DRIFT_RUNNING, -outermost);
    if (innermostWalking > outermost) {
      console.warn(`[towerLevel] the bounce at y=${crystal.y} cannot reach its landing pad while walking — ${BOUNCE_DRIFT_WALKING.toFixed(2)} u of drift against the ${(reach - outermost).toFixed(2)} u it needs. See BOUNCE_REACH.`);
      continue;
    }

    for (const prop of props) {
      if (prop.pad !== pad) continue;
      // Distance from the prop's axis to the landing capsule's, over the whole band. It is convex in
      // the offset, so its minimum is at the band's own end nearest the prop.
      const nearest = Math.min(Math.max(prop.outward, innermostRunning), outermost);
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
      const gap = slabGap(below, above);
      if (gap < CAPSULE_RADIUS) {
        console.warn(`[towerLevel] the slab at y=${above.y} overhangs the one at y=${below.y} (gap ${gap.toFixed(2)} u), which has only ${(above.y - TOWER_SLAB_THICKNESS - below.y).toFixed(2)} u of headroom for a ${CAPSULE_HEIGHT} u capsule. See TURN_DEGREES.`);
      }
    }
  }

  for (const [from, to] of jumpSteps) {
    // The other end of TURN_DEGREES' gap rule, and the one it names as binding: a gap has to be
    // crossable by a player holding Shift, because they may hold it through any jump in the tower.
    // Measured against the step's own rise rather than JUMP_RISE, for the reason the apex rule is.
    const reach = stepReach(to.y - from.y, DEFAULT_CONFIG.maxSpeed);
    // A rise past the apex has no reach to compare against, and it is not this rule's to report: the
    // step is unjumpable at any speed, which the apex rule above already says in those words.
    if (reach === null) continue;
    // What the CENTRE has to travel: footprint to footprint, because a slab holds a capsule exactly
    // when the centre is over it — the same test at both ends of the jump. `footprintDistance`'s own
    // doc records why no capsule radius is subtracted at either end, and what the reading that does
    // subtract one says about walking this tower.
    const crossing = footprintDistance(from, to);
    if (crossing > reach) {
      console.warn(`[towerLevel] the step from y=${from.y} to y=${to.y} cannot be walked — landing on it means carrying the capsule's centre ${crossing.toFixed(3)} u against the ${reach.toFixed(3)} u a player holding Shift covers across a ${(to.y - from.y).toFixed(3)} u rise, so the section is closed to anyone who does. See TURN_DEGREES.`);
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
 *  overhead. The re-solve pushed {@link CRYSTAL_ORBIT} from 6.3 to 6.9 and left this alone, so the
 *  rule still holds but by 0.1 u where it used to hold by 0.7: **this is now the number the next push
 *  outward breaks first**, and it is also still outside the platforms' own outer corners at 6.32,
 *  which is what keeps the floor under the spawn clear of section 1's first slab. That last margin is
 *  thinner than 7 − 6.32 makes it look: the spawn is on the first slab's own bearing, so what stands
 *  in front of the capsule is that slab's outer FACE at `PLATFORM_ORBIT + PLATFORM_DEPTH/2` = 6.2, and
 *  the capsule's surface reaches 6.5 — **0.300 u of floor**, not 0.68, and the corners at 6.32 are off
 *  to either side of it. What saves the framing in the meantime is a bearing rather than a radius —
 *  the first crystal is a turn round the column, 6.95 u away across the floor and 24 u up, not
 *  overhead. */
const SPAWN_ORBIT = 7;

/**
 * Where the capsule's CENTRE starts: on the floor at {@link SPIRAL_FIRST_STEP_DEGREES}, so walking
 * straight in from the spawn arrives at the first step rather than at the face before it. Which way
 * the camera is pointing when the level opens is `followCamera`'s default yaw and is not decided
 * here, so nothing in this file claims the player is looking at anything.
 *
 * The height is {@link spawnCentreY}, the rule the hub spawns by as well: start just above the floor
 * so the capsule settles onto it, rather than embedded in a one-sided collider it would fall through.
 *
 * A readonly {@link Vec3} like every other coordinate here, and NOT a `Vector3` — which is what it
 * used to be, and the one exception in this file. `createPlayer` hands its spawn straight to
 * `PhysicsCharacterController`, whose `getPosition()` is documented as returning its LIVE internal
 * vector, so an exported babylon vector is a shared mutable the controller may write through. The hub
 * reached the same conclusion for the same consumer and answered it with a function returning a fresh
 * vector (`portalReturnSpawn`); the tower has no computation to hide behind one, so it exports the
 * value and `towerScene` converts at the call site. Both levels now hand that consumer something it
 * owns.
 */
export const TOWER_SPAWN: Vec3 = at(SPAWN_ORBIT, SPIRAL_FIRST_STEP_DEGREES, spawnCentreY(TOWER_FLOOR_Y));

const respawnAbove = (pad: TowerPlatform): Vec3 => vec3(pad.x, spawnCentreY(pad.y), pad.z);

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
export const TOWER_CHECKPOINTS: TowerCheckpoints = [
  { activateY: TOWER_FLOOR_Y, respawn: TOWER_SPAWN },
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
 *
 * **Arriving on top of it is not an approach the last bounce can make**, at {@link PEDESTAL_HEIGHT}
 * or at any other height these numbers could take. The climb {@link BOUNCE_AIRTIME} solves for `pad`,
 * solved instead for `pad + PEDESTAL_HEIGHT`, has two roots: 0.268 s and 0.482 s after launch — a
 * 0.214 s window in which the feet are above pedestal height, and the source of the "0.21 s" an
 * earlier draft already had right. What that draft got wrong was the drift inside it: it took
 * `½ · acceleration · 0.214²` = 0.30 u, acceleration from a standstill at the window's open — the
 * same rest-from-zero mistake {@link BOUNCE_REACH} corrects for the reach bound, made a second time
 * here. The player has been drifting under air control since launch, not from rest at 0.268 s:
 * `airDrift` gives 1.3128 u by the window's close, of which only 0.846 u falls inside the window —
 * against the 1.8 u = `BOUNCE_REACH − (TOWER_SUMMIT_RADIUS − CAPSULE_RADIUS)` it takes to reach the
 * disc's edge. Those are the WALKING figures; "no version of these numbers makes it one" needs the
 * widest drift the player can have, and running gives 1.5101 u by the close and **1.043 u** inside
 * the window, still 0.76 u short. The conclusion survived the error; the number didn't, and it moved
 * again with {@link BOUNCE_REACH} — the window itself does not, because it depends on the bounce and
 * not on the layout. The shipped case is safer still: {@link SUMMIT_PEDESTAL_OFFSET}'s offset puts
 * the disc `√(BOUNCE_REACH² + SUMMIT_PEDESTAL_OFFSET²)` = 3.05 u away, needing 2.55 u. The bounce
 * lands beside it and walks — see {@link SUMMIT_PEDESTAL_OFFSET}.
 */
export const TOWER_SUMMIT: Vec3 = ((): Vec3 => {
  const [pedestal] = layout.props;
  const spot = onPad(pedestal.pad, pedestal.along, pedestal.outward);
  return vec3(spot.x, spot.y + PEDESTAL_HEIGHT, spot.z);
})();
