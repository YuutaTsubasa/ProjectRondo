import { INITIAL_GROUND_CONTACT, stepGroundContact, spendBufferedJump, type GroundContactInput, type GroundContactState } from './groundContact';

export interface PlayerJumpState {
  readonly contact: GroundContactState;
  readonly airJumpSpent: boolean;
}
export const INITIAL_PLAYER_JUMP: PlayerJumpState = { contact: INITIAL_GROUND_CONTACT, airJumpSpent: false };

/** Keep the tested ground/coyote/buffer rules and add exactly one air impulse per landing. */
export function stepPlayerJump(state: PlayerJumpState, input: GroundContactInput) {
  const ground = stepGroundContact(state.contact, input);
  const dashOwnsFrame = input.dashInFlight || input.bounced;
  const landed = ground.grounded && !dashOwnsFrame;
  const spent = landed ? false : state.airJumpSpent;
  const airJumped = !dashOwnsFrame && !ground.jumpRequested && !ground.jumpAvailable
    && !spent && ground.state.bufferedJumpFor > 0;
  const contact: GroundContactState = airJumped
    ? { ...spendBufferedJump(ground.state), contact: { kind: 'rising', seconds: 0 } }
    : ground.state;
  return {
    state: { contact, airJumpSpent: spent || airJumped },
    ground: airJumped ? { ...ground, grounded: false, airborne: true } : ground,
    airJumped,
  };
}
