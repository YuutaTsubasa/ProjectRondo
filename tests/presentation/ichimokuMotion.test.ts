import {describe,expect,it} from 'vitest';
import {ICHIMOKU_MOTION,hoverOffset,tentacleSway,eyeLook} from '../../src/presentation/parlor/ichimokuMotion';
describe('一目元 procedural idle',()=>{
 it('floats within a few centimetres',()=>{
  for(let t=0;t<10;t+=.1)expect(Math.abs(hoverOffset(t))).toBeLessThanOrEqual(ICHIMOKU_MOTION.bob);
  expect(hoverOffset(0)).toBe(0);
 });
 it('swings tentacle tips further than roots and desynchronises neighbours',()=>{
  const peak=(segment:number)=>Math.max(...Array.from({length:200},(_,i)=>Math.abs(tentacleSway(i*.05,3,segment,5).pitch)));
  expect(peak(4)).toBeGreaterThan(peak(0)*2);
  expect(peak(4)).toBeLessThanOrEqual(ICHIMOKU_MOTION.swayTip);
  expect(tentacleSway(1,0,2,5).pitch).not.toBeCloseTo(tentacleSway(1,1,2,5).pitch);
  expect(Number.isFinite(tentacleSway(1,0,0,1).pitch)).toBe(true);
 });
 it('looks toward a target in front, in model space',()=>{
  // Model turned to face -z (yaw π): a target at -z and to world -x is on the model's +x side.
  const eye={x:0,y:1.8,z:0};
  expect(eyeLook(eye,{x:0,y:1.8,z:-3},Math.PI)).toEqual({yaw:expect.closeTo(0),pitch:expect.closeTo(0)});
  expect(eyeLook(eye,{x:-1,y:1.8,z:-3},Math.PI).yaw).toBeGreaterThan(0);
  expect(eyeLook(eye,{x:0,y:1.2,z:-3},Math.PI).pitch).toBeLessThan(0);
 });
 it('clamps to the VRM look range and rests for targets behind or invalid',()=>{
  const eye={x:0,y:1.8,z:0};
  expect(eyeLook(eye,{x:-10,y:1.8,z:-.5},Math.PI).yaw).toBeCloseTo(ICHIMOKU_MOTION.lookLimit);
  expect(eyeLook(eye,{x:0,y:-10,z:-1},Math.PI).pitch).toBeCloseTo(-ICHIMOKU_MOTION.lookLimit);
  expect(eyeLook(eye,{x:0,y:1.8,z:3},Math.PI)).toEqual({yaw:0,pitch:0});
  expect(eyeLook(eye,{x:NaN,y:1.8,z:-3},Math.PI)).toEqual({yaw:0,pitch:0});
 });
});
