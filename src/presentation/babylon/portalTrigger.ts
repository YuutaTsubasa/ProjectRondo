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
 * Half-height of the band around a pedestal's standing height that counts as being on it, in world
 * units. Measured from the capsule's CENTRE against the pedestal's top face plus `CAPSULE_HALF`,
 * which is why it is a half-height and not a ceiling.
 *
 * **Untuned**: 1.2 u — wide enough to survive the capsule's rest gap and a frame caught mid-step,
 * narrow enough that walking past at the foot of the pedestal, or clearing it in a jump, does not
 * fire. The hub's portal and the tower's summit reached the same number by the same reasoning, so it
 * is one constant rather than two (principle 6). The pedestals do differ — the hub's stands on a
 * height field and the tower's on a flat floor — but neither difference is in *this* number, and a
 * level that later needs its own band can take its own constant then rather than keeping a
 * knowingly duplicated literal against the day it might.
 */
export const PORTAL_HEIGHT_BAND = 1.2;

/**
 * Edge-triggers on entry. `inside` is the caller's question to answer — the pedestal is a cylinder,
 * so it is a planar distance and a height band, and that geometry stays on the Babylon side. What
 * this module owns is the edge rule and, in {@link PORTAL_HEIGHT_BAND}, the one number both callers
 * answer the height half of that test with; each level's own radius and centre stay with the level.
 */
export function stepPortalTrigger(trigger: PortalTrigger, inside: boolean): PortalTriggerResult {
  if (!inside) return { trigger: trigger.armed ? trigger : { armed: true }, fired: false };
  if (!trigger.armed) return { trigger, fired: false };
  return { trigger: { armed: false }, fired: true };
}
