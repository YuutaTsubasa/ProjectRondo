/**
 * The single source of truth for whether the character is on the ground.
 *
 * It turns the character controller's noisy support probe plus a jump keypress into everything the
 * rest of the game needs: what the domain gets as `isGrounded` / `jumpRequested`, and what the
 * animation layer gets as "off the ground". Pure, so the whole thing is unit-tested rather than
 * debugged in the browser — and having exactly one machine decide this means the physics and the
 * visuals cannot drift into disagreeing about it.
 *
 * Four problems it solves, all measured on the hub terrain:
 *
 * 1. **Any upward velocity used to mean "airborne".** `playerController` once refused to ground the
 *    character whenever the post-solve velocity pointed up. Walking across rolling terrain pushes the
 *    capsule up the entire time (+0.33..+0.42 u/s), so the character read as airborne for *every*
 *    frame of a plain walk — and since the domain only accepts a jump from a grounded motion,
 *    **jumping while walking was impossible**. Only a jump that is still climbing suppresses
 *    grounding now.
 * 2. **The probe chatters.** Walking sideways loses support on 84 of 150 frames, in bursts of 1-8
 *    frames, as the capsule crosses the terrain collider's triangles. {@link COYOTE_SECONDS} keeps
 *    the character jumpable across those bursts, and {@link FALL_GRACE_SECONDS} keeps the animation
 *    from flickering through them.
 * 3. **Presses land in the gaps.** A keypress inside one of those bursts used to be consumed and
 *    thrown away. {@link JUMP_BUFFER_SECONDS} remembers it and spends it the moment a jump is legal.
 * 4. **Ground re-acquired mid-climb cancelled the jump.** Jumping while running uphill lifts the
 *    capsule clear, then the rising ground ahead comes back within probe reach while the character is
 *    still going up. Grounding there makes the domain zero the climb and the character sticks to the
 *    slope. The `rising` state below ignores the probe entirely until the climb is over. A homing
 *    bounce is the same shape of climb — the domain hands out `homingBounceSpeed` and then, from a
 *    grounded motion, zeroes it on the very next frame — and a crystal low enough that the probe
 *    finds floor under the arrival is exactly the case, so a bounce enters `rising` too.
 * 5. **A press was spent on a jump the domain was never going to take.** The probe reports support on
 *    frames of a homing dash — the skim `slopeMotion` records — and again under the crystal a dash
 *    arrives at, and this machine used to answer such a frame with `jumpRequested`. On a dash frame
 *    the domain's homing branch does not read `jumpRequested` at all, so the press produced nothing
 *    and the buffer had already been emptied for it; on the frame after an arrival it produced an
 *    ordinary jump, and reporting `grounded` for that jump is what stopped the same press reaching
 *    `homingLock`, so chaining off a low crystal degraded silently into a hop. {@link
 *    GroundContactInput.dashInFlight} and {@link GroundContactInput.bounced} are therefore read
 *    *before* the press is spent, not after: on those frames the press stays in the buffer, and
 *    `grounded` stays false so the lock is the machine offered it.
 */

/** How long after losing ground support a jump is still allowed. Covers the probe's 1-8 frame gaps. */
export const COYOTE_SECONDS = 0.15;
/** How long a jump press is remembered while waiting for the character to become jumpable. */
export const JUMP_BUFFER_SECONDS = 0.15;
/**
 * How long an *uncommanded* loss of support has to last before it counts as being off the ground.
 * A jump is airborne immediately; this only filters the probe's chatter. At run speed the capsule
 * genuinely skips off the terrain's crests in bursts of 2-27 frames, and throwing a jump pose at a
 * two-frame hop looks far worse than ignoring it.
 */
export const FALL_GRACE_SECONDS = 0.2;
/**
 * Backstop on how long a jump may be considered "still climbing". Generous — a default jump reaches
 * its apex in `jumpSpeed / gravity` = 0.375s — because this is a safety valve, not a tuning knob.
 *
 * It exists because `rising` leaves on `verticalSpeed <= 0`, and that value comes from the physics
 * solver rather than the domain: a surface that kept pushing the capsule up would hold the state open,
 * and the result would be silent (never grounded again, so no jumping and the feet never re-plant).
 * Nothing on the hub's terrain does that — pressing into its 44.6° and 51.7° barrier faces at run
 * speed was measured ending the climb normally, and no 40-60° face exists inside the playable radius
 * at all — but that is a property of today's terrain, not of this module.
 */
export const MAX_RISING_SECONDS = 1.5;

/**
 * Where the character stands relative to the ground. A union rather than a bag of flags, so
 * combinations that mean nothing — "clearing the floor" while also two seconds into a fall — cannot
 * be constructed in the first place.
 */
export type GroundContact =
  /** Standing on something. The only state a jump can start from without coyote time. */
  | { readonly kind: 'grounded' }
  /**
   * A climb the domain started — a jump, or the bounce off a homing arrival — is under way and still
   * going up. The support probe is deliberately ignored here: it re-acquires as soon as ground comes
   * back within reach, and grounding mid-climb would cancel the climb. Ends when the character stops
   * rising — so a jump into a low ceiling cannot latch — or at {@link MAX_RISING_SECONDS}, whichever
   * comes first.
   */
  | { readonly kind: 'rising'; readonly seconds: number }
  /** Off the ground and not climbing. `seconds` feeds coyote time and the fall grace. */
  | { readonly kind: 'airborne'; readonly seconds: number; readonly jumpSpent: boolean };

export interface GroundContactState {
  readonly contact: GroundContact;
  /** Seconds of life left on a remembered jump press. Orthogonal to where the character is. */
  readonly bufferedJumpFor: number;
}

export const INITIAL_GROUND_CONTACT: GroundContactState = {
  contact: { kind: 'grounded' },
  bufferedJumpFor: 0,
};

export interface GroundContactInput {
  /** The Havok support probe's verdict this frame. */
  readonly supported: boolean;
  /** A jump key-press was consumed this frame (edge-triggered). */
  readonly jumpPressed: boolean;
  /**
   * A homing dash is under way this frame — `CharacterMotion.homing !== null` from last frame's
   * result, the same boolean `homingLock` is handed as `HomingLockInput.dashInFlight`. The domain
   * spends such a frame in its homing branch, which never reads `jumpRequested`, so a press answered
   * with a jump here would be answered by nothing at all.
   */
  readonly dashInFlight: boolean;
  /** Last frame's post-solve vertical velocity; positive is rising. */
  readonly verticalSpeed: number;
  /**
   * A homing dash arrived and the domain handed out its bounce on the PREVIOUS frame
   * (`Player.homingBounced`). One frame late for the same reason {@link verticalSpeed} is: the domain
   * step that decides it runs after this machine has already answered for the frame.
   */
  readonly bounced: boolean;
  readonly delta: number;
}

export interface GroundContactResult {
  readonly state: GroundContactState;
  /** What to hand the domain as `isGrounded`. */
  readonly grounded: boolean;
  /** What to hand the domain as `jumpRequested`. */
  readonly jumpRequested: boolean;
  /**
   * What the animation layer should treat as "off the ground": true for a whole jump, and for a fall
   * that has outlasted {@link FALL_GRACE_SECONDS}, but never for the probe's brief dropouts.
   */
  readonly airborne: boolean;
}

export const stepGroundContact = (
  state: GroundContactState,
  { supported, jumpPressed, dashInFlight, verticalSpeed, bounced, delta }: GroundContactInput,
): GroundContactResult => {
  const buffered = jumpPressed ? JUMP_BUFFER_SECONDS : Math.max(0, state.bufferedJumpFor - delta);
  const settled = advance(state.contact, supported, verticalSpeed, delta);

  // A dash owns the frame it is flying on and the frame its bounce leaves the ground, so a press on
  // either is not this machine's to spend (problem 5 above). Refusing it *before* the spend rather
  // than overriding `contact` after is what routes it somewhere: `buffered` still holds it, and on
  // the bounce frame `contact` is `rising`, so `grounded` is false and `homingLock` is handed the
  // same press as the chain dash it was meant to be. On a dash frame the lock is already committed
  // and ignores presses, so there the buffer is the whole of the answer.
  const dashOwnsFrame = dashInFlight || bounced;
  const jumpRequested = buffered > 0 && !dashOwnsFrame && canJump(settled);
  const contact: GroundContact = jumpRequested || bounced ? { kind: 'rising', seconds: 0 } : settled;

  return {
    state: { contact, bufferedJumpFor: jumpRequested ? 0 : buffered },
    // A coyote-time jump has to report grounded, because the domain only accepts a jump from a
    // grounded motion — that one frame of leniency is exactly what coyote time is.
    grounded: jumpRequested || contact.kind === 'grounded',
    jumpRequested,
    airborne: isAirborne(contact),
  };
};

const advance = (
  contact: GroundContact, supported: boolean, verticalSpeed: number, delta: number,
): GroundContact => {
  switch (contact.kind) {
    case 'grounded':
      return supported ? contact : { kind: 'airborne', seconds: delta, jumpSpent: false };
    case 'rising': {
      const seconds = contact.seconds + delta;
      if (verticalSpeed > 0 && seconds < MAX_RISING_SECONDS) return { kind: 'rising', seconds };
      return supported ? { kind: 'grounded' } : { kind: 'airborne', seconds: 0, jumpSpent: true };
    }
    case 'airborne':
      return supported ? { kind: 'grounded' } : { ...contact, seconds: contact.seconds + delta };
    default:
      return assertNever(contact);
  }
};

const canJump = (contact: GroundContact): boolean => {
  switch (contact.kind) {
    case 'grounded':
      return true;
    case 'rising':
      return false;
    case 'airborne':
      return !contact.jumpSpent && contact.seconds <= COYOTE_SECONDS;
    default:
      return assertNever(contact);
  }
};

const isAirborne = (contact: GroundContact): boolean => {
  switch (contact.kind) {
    case 'grounded':
      return false;
    case 'rising':
      return true;
    // `jumpSpent` means this fall began as a jump, so it needs no confirming — only an uncommanded
    // loss of support has to outlast the grace before it counts.
    case 'airborne':
      return contact.jumpSpent || contact.seconds > FALL_GRACE_SECONDS;
    default:
      return assertNever(contact);
  }
};

const assertNever = (value: never): never => {
  throw new Error(`unhandled ground contact: ${JSON.stringify(value)}`);
};
