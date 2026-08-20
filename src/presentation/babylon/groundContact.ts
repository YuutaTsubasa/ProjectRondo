/**
 * Turns the character controller's noisy ground probe plus a jump keypress into the two values the
 * domain actually needs: is the character grounded, and does it jump this frame. Pure, so the whole
 * thing is unit-tested rather than debugged in the browser.
 *
 * Three problems it solves, all measured on the hub terrain:
 *
 * 1. **Any upward velocity used to mean "airborne".** `playerController` previously refused to ground
 *    the character whenever the post-solve velocity pointed up. But walking across rolling terrain
 *    pushes the capsule up the entire time (+0.33..+0.42 u/s), so the character read as airborne for
 *    *every* frame of a plain walk — and since the domain only accepts a jump from a grounded motion,
 *    **jumping while walking was impossible**. That rule is gone; only a jump that has yet to clear
 *    the floor suppresses grounding now.
 * 2. **The probe chatters.** Walking sideways loses support on 84 of 150 frames, in bursts of 1-8
 *    frames, as the capsule crosses the terrain collider's triangles. {@link COYOTE_SECONDS} keeps the
 *    character jumpable across those bursts.
 * 3. **Presses land in the gaps.** A keypress inside one of those bursts used to be consumed and
 *    thrown away. {@link JUMP_BUFFER_SECONDS} remembers it and spends it the moment a jump is legal.
 */

/** How long after losing ground support a jump is still allowed. Covers the probe's 1-8 frame gaps. */
export const COYOTE_SECONDS = 0.15;
/** How long a jump press is remembered while waiting for the character to become jumpable. */
export const JUMP_BUFFER_SECONDS = 0.15;

export interface GroundContactState {
  /** Seconds since the probe last reported support; 0 while supported. */
  readonly airborneFor: number;
  /** A jump has been taken and the character has not been back on the ground since. */
  readonly jumpSpent: boolean;
  /** The jump is under way but the capsule has not physically left the floor yet. */
  readonly clearingFloor: boolean;
  /** Seconds of life left on a remembered jump press. */
  readonly bufferedJumpFor: number;
}

export const INITIAL_GROUND_CONTACT: GroundContactState = {
  airborneFor: 0,
  jumpSpent: false,
  clearingFloor: false,
  bufferedJumpFor: 0,
};

export interface GroundContactInput {
  /** The Havok support probe's verdict this frame. */
  readonly supported: boolean;
  /** A jump key-press was consumed this frame (edge-triggered). */
  readonly jumpPressed: boolean;
  /** Last frame's post-solve vertical velocity; positive is rising. */
  readonly verticalSpeed: number;
  readonly delta: number;
}

export interface GroundContactResult {
  readonly state: GroundContactState;
  /** What to hand the domain as `isGrounded`. */
  readonly grounded: boolean;
  /** What to hand the domain as `jumpRequested`. */
  readonly jumpRequested: boolean;
}

export const stepGroundContact = (
  state: GroundContactState,
  { supported, jumpPressed, verticalSpeed, delta }: GroundContactInput,
): GroundContactResult => {
  const airborneFor = supported ? 0 : state.airborneFor + delta;
  // The takeoff guard holds until the capsule has actually left the floor, or until it is falling
  // again — a jump straight into a low ceiling never lets the probe go and must not latch forever.
  const clearingFloor = state.clearingFloor && supported && verticalSpeed > 0;
  // Genuinely back on the ground: support, and no jump still on its way up.
  const onGround = supported && !clearingFloor;

  const buffered = jumpPressed ? JUMP_BUFFER_SECONDS : Math.max(0, state.bufferedJumpFor - delta);
  const jumpSpent = onGround ? false : state.jumpSpent;
  const jumpRequested = buffered > 0 && !clearingFloor && !jumpSpent && airborneFor <= COYOTE_SECONDS;

  return {
    state: {
      airborneFor,
      jumpSpent: jumpSpent || jumpRequested,
      clearingFloor: clearingFloor || jumpRequested,
      bufferedJumpFor: jumpRequested ? 0 : buffered,
    },
    // A coyote-time jump has to report grounded, because the domain only accepts a jump from a
    // grounded motion — that one frame of leniency is exactly what coyote time is.
    grounded: jumpRequested || onGround,
    jumpRequested,
  };
};
