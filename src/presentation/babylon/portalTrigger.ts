/**
 * Whether the portal will fire the next time the player is inside it. Disarmed means the player is
 * standing in it now and has not left since it last fired — or has not left since the scene was
 * built, which is what makes arriving on top of your own trigger safe.
 */
export interface PortalTrigger {
  readonly armed: boolean;
}

/** Disarmed: the first frame outside arms it. See `PortalTrigger` for why it is not armed. */
export const PORTAL_START: PortalTrigger = { armed: false };

export interface PortalTriggerResult {
  readonly trigger: PortalTrigger;
  readonly fired: boolean;
}

/**
 * How far the capsule's centre may sit from the height it has when its feet are on the pedestal's
 * top face and still count as standing on it, in world units.
 *
 * **It is not what excludes a jump over the pedestal, and no number here could be.** A jump only
 * passes over the pedestal while it is ABOVE the top face — below it the capsule hits the pedestal —
 * so the heights such a jump is seen at run from 0 (grazing the rim) up to its apex, and a band that
 * did not admit 0 would not admit standing either. Excluding the jump is
 * {@link PedestalStand.airborne}'s job; this number only decides which SURFACE a *supported* frame is
 * standing on.
 *
 * That is the correction, not a refinement: at 1.2 u this constant was documented as the thing that
 * kept a jump from firing the portal, and it was not. The hub's pedestal is 0.55 u tall, so a capsule
 * standing on it has its centre `0.55 + CAPSULE_HALF` over the surrounding ground, while a jump from
 * that ground carries the centre from `CAPSULE_HALF` to `CAPSULE_HALF + jumpSpeed²/(2·gravity)` =
 * 2.6875 u over it — every height a jump can be over the plinth at was inside 1.2 u of the standing
 * height, so running across the hub's plaza and jumping over the plinth swapped the scene. The
 * tower's summit pedestal is the same 0.55 and fired the same way, exiting the tower on a jump.
 *
 * **Untuned**: 0.4 u, with both of its bounds known and neither of them close. Above it,
 * `groundContact.ts`'s `FALL_GRACE_SECONDS`: an uncommanded loss of support still reads `!airborne`
 * for 0.2 s, over which gravity 24 carries the capsule `24/2 · 0.2²` = **0.48 u**, so a wider band
 * would let a walk-off from something standing over the pedestal read as standing on the pedestal
 * (`portalTrigger.test.ts` holds this end). Below it, the rest gap the character controller leaves
 * under a supported capsule, **measured at 0.096 u** on the hub's plinth — teleported above it, let
 * fall, sampled once settled — which leaves 0.30 u of the band spare for a frame caught mid-step.
 */
export const PORTAL_STANDING_BAND = 0.4;

/** One frame's answer to "is the player standing on this pedestal?", in the pedestal's own terms. */
export interface PedestalStand {
  /** Planar distance from the pedestal's axis to the capsule's CENTRE. */
  readonly planarDistance: number;
  /** The pedestal's radius. Each level's own, since each level's pedestal is its own to place. */
  readonly radius: number;
  /** The capsule's centre, less the height that centre has when its feet are on the top face. */
  readonly aboveStandingHeight: number;
  /**
   * `Player.airborne` — off the ground for the CAPSULE, debounced by `groundContact.ts`. True for
   * the whole of any jump, including its descent, which is what makes this the half of the test that
   * a jump over the pedestal fails.
   */
  readonly airborne: boolean;
}

/**
 * Whether the player is standing on the pedestal — spec §5's "the act of standing on it is already
 * deliberate", which is the whole reason the portal has no confirm key.
 *
 * Three conditions, and each covers a case the others do not:
 *
 * - **Supported.** A jump reads `airborne` from takeoff to touchdown, so no part of an arc over the
 *   pedestal can fire the portal. This is the condition the height band was wrongly credited with.
 * - **Planar.** What keeps a player walking past at the foot of the pedestal out is this, not the
 *   band: the pedestal is solid, so a capsule on the ground beside it cannot bring its centre nearer
 *   the axis than `radius + CAPSULE_RADIUS`. At ground level the height difference is only the
 *   pedestal's own 0.55 u, well inside any usable band.
 * - **Height.** Which supported surface the frame is on — see {@link PORTAL_STANDING_BAND}.
 */
export const standingOnPedestal = (
  { planarDistance, radius, aboveStandingHeight, airborne }: PedestalStand,
): boolean =>
  !airborne
  && planarDistance <= radius
  && Math.abs(aboveStandingHeight) <= PORTAL_STANDING_BAND;

/**
 * Edge-triggers on entry. `inside` is {@link standingOnPedestal}'s answer, which is a separate
 * function because the levels differ in where their pedestal is and how wide it is, and agree on
 * everything else. What this module owns is the edge rule and, in {@link standingOnPedestal}, the one
 * test both levels answer "is the player on the pedestal?" with.
 */
export function stepPortalTrigger(trigger: PortalTrigger, inside: boolean): PortalTriggerResult {
  if (!inside) return { trigger: trigger.armed ? trigger : { armed: true }, fired: false };
  if (!trigger.armed) return { trigger, fired: false };
  return { trigger: { armed: false }, fired: true };
}
