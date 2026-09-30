import { expect, it } from 'vitest';
import { INITIAL_PLAYER_JUMP, stepPlayerJump } from '../../src/presentation/babylon/playerJump';
import type { GroundContactInput } from '../../src/presentation/babylon/groundContact';
const frame = (over: Partial<GroundContactInput> = {}) => ({ supported: false, jumpPressed: false, dashInFlight: false, verticalSpeed: 5, bounced: false, delta: 1 / 60, ...over });
it('allows one independent air jump and restores it only on landing', () => {
  const first = stepPlayerJump(INITIAL_PLAYER_JUMP, frame({ supported: true, jumpPressed: true }));
  expect(first.ground.jumpRequested).toBe(true); expect(first.airJumped).toBe(false);
  const second = stepPlayerJump(first.state, frame({ jumpPressed: true }));
  expect(second.airJumped).toBe(true); expect(second.state.contact.bufferedJumpFor).toBe(0);
  const third = stepPlayerJump(second.state, frame({ jumpPressed: true }));
  expect(third.airJumped).toBe(false);
  const landed = stepPlayerJump(third.state, frame({ supported: true, verticalSpeed: -1, delta: .2 }));
  expect(landed.state.airJumpSpent).toBe(false);
  const next = stepPlayerJump(landed.state, frame({ jumpPressed: true }));
  expect(next.ground.jumpRequested).toBe(true);
  expect(stepPlayerJump(next.state, frame({ jumpPressed: true })).airJumped).toBe(true);
});
it('does not refill on a grounded dash probe or its bounce, and cannot spend a jump mid-dash', () => {
  const spent = { ...INITIAL_PLAYER_JUMP, airJumpSpent: true };
  const dash = stepPlayerJump(spent, frame({ supported: true, dashInFlight: true, jumpPressed: true }));
  expect(dash.airJumped).toBe(false); expect(dash.state.airJumpSpent).toBe(true);
  const bounce = stepPlayerJump(dash.state, frame({ supported: true, bounced: true }));
  expect(bounce.state.airJumpSpent).toBe(true); expect(bounce.airJumped).toBe(false);
  expect(stepPlayerJump(bounce.state, frame({ jumpPressed: true })).airJumped).toBe(false);
});
it('protects the second jump climb when a nearby surface is still in probe range', () => {
  const first = stepPlayerJump(INITIAL_PLAYER_JUMP, frame({ supported: true, jumpPressed: true }));
  const second = stepPlayerJump(first.state, frame({ jumpPressed: true }));
  const rising = stepPlayerJump(second.state, frame({ supported: true, verticalSpeed: 8 }));
  expect(rising.ground.grounded).toBe(false); expect(rising.state.airJumpSpent).toBe(true);
});
