import { expect, it } from 'vitest';
import { COURSE_MOVEMENT } from '../../../src/domain/course/courseMovement';
import { step } from '../../../src/domain/hub/character/characterMovement';
import { IDLE } from '../../../src/domain/hub/character/characterMotion';
import { NONE_INPUT } from '../../../src/domain/hub/character/movementInput';
import { fromRaw } from '../../../src/domain/kernel/normalizedPlanarDirection';
const input = { ...NONE_INPUT, direction: fromRaw({ x:0, y:-1 }), runRequested:true };
it('reaches the faster trial run speed in under half a second', () => {
  let motion = IDLE;
  for(let frame=0;frame<28;frame++) motion=step(motion,input,COURSE_MOVEMENT,1/60);
  expect(Math.hypot(motion.velocity.x,motion.velocity.z)).toBeCloseTo(10);
});
it('stops from full speed within two world units', () => {
  let motion = { ...IDLE, velocity: {x:0,y:0,z:-10} }, distance=0;
  for(let frame=0;frame<30;frame++) {
    motion=step(motion,NONE_INPUT,COURSE_MOVEMENT,1/60);
    distance+=Math.hypot(motion.velocity.x,motion.velocity.z)/60;
  }
  expect(motion.velocity.z).toBe(0); expect(distance).toBeLessThan(2);
});
