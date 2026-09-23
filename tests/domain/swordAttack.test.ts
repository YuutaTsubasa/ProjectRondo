import { expect, it } from 'vitest';
import { stepSwordAttack, NO_SWORD_ATTACK } from '../../src/domain/hub/character/swordAttack';
const frame = (over = {}) => ({ pressed: false, homing: false, from: {x:0,y:1,z:0}, facing: {x:0,y:-1}, targets: [{x:0,y:1,z:-1.5}, {x:0,y:1,z:1}, {x:0,y:1,z:-5}], delta: .05, ...over });
it('hits nearby frontal targets only once in the active slash window', () => {
  let result = stepSwordAttack(NO_SWORD_ATTACK, frame({ pressed: true }));
  expect(result.state.seconds).toBe(0); expect(result.hits).toEqual([]);
  const hits: number[] = [];
  for (let i=0;i<12;i++) { result = stepSwordAttack(result.state, frame()); hits.push(...result.hits); }
  expect(hits).toEqual([0]); expect(result.state.seconds).toBeNull();
});
it('does not restart an active slash on repeated presses and cancels for Homing', () => {
  const started = stepSwordAttack(NO_SWORD_ATTACK, frame({ pressed:true }));
  const next = stepSwordAttack(started.state, frame({ pressed:true }));
  expect(next.state.seconds).toBe(.05);
  expect(stepSwordAttack(next.state, frame({ homing:true, pressed:true })).state).toEqual(NO_SWORD_ATTACK);
});
it('rejects vertical targets outside blade reach', () => {
  let result = stepSwordAttack(NO_SWORD_ATTACK, frame({ pressed:true, targets:[{x:0,y:4,z:-1}] }));
  const hits: number[] = [];
  for(let i=0;i<10;i++) { result=stepSwordAttack(result.state, frame({ targets:[{x:0,y:4,z:-1}] })); hits.push(...result.hits); }
  expect(hits).toEqual([]);
});
