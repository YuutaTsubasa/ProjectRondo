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
 * Edge-triggers on entry. `inside` is the caller's question to answer — the pedestal is a cylinder,
 * so it is a planar distance and a height band, and that geometry stays on the Babylon side.
 */
export function stepPortalTrigger(trigger: PortalTrigger, inside: boolean): PortalTriggerResult {
  if (!inside) return { trigger: trigger.armed ? trigger : { armed: true }, fired: false };
  if (!trigger.armed) return { trigger, fired: false };
  return { trigger: { armed: false }, fired: true };
}
