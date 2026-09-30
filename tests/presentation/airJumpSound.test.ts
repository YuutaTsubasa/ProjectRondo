import { expect, it } from 'vitest';
import { stepJumpSound } from '../../src/presentation/audio/jumpSound';
it('plays another takeoff cue for an air jump without a false landing', () => {
  expect(stepJumpSound({ offGround:true }, { airborne:true, homing:false, bounced:false, airJumped:true }).cue).toBe('jump.takeoff');
});
