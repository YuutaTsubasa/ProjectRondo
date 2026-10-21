import {describe,expect,it} from 'vitest';
import {townSurfaceHeight} from '../../src/domain/town/townTerraces';
import {TOWN_BOUNDS,townLocation,outsideTown} from '../../src/domain/town/townLayout';
import {regionHeight,isRegionPositionSafe} from '../../src/domain/region/regionLayout';

// Player-sized clearance is checked separately against the rendered static bodies.
const route=[[-10,188],[-10,217],[-10,241],[-10,267],[-10,284],[29,284],[29,267],[29,217],[-10,217]];
describe('palace public floor',()=>{
 it('extends the city continuously into the hall and around the sea cloister',()=>{
  for(let i=1;i<route.length;i++){
   const [ax,az]=route[i-1],[bx,bz]=route[i],steps=Math.ceil(Math.hypot(bx-ax,bz-az)*2);
   for(let j=0;j<=steps;j++){
    const x=ax+(bx-ax)*j/steps,z=az+(bz-az)*j/steps;
    expect(townSurfaceHeight(x,z),`floor at ${x},${z}`).toBe(12);
    expect(regionHeight(x,z)).toBe(12);
    expect(outsideTown(x,13.3,z)).toBe(false);
    expect(isRegionPositionSafe({x,y:13.3,z})).toBe(true);
   }
  }
  expect(TOWN_BOUNDS.maxZ).toBeGreaterThanOrEqual(291);
 });
 it('names the public spaces and rejects unsupported space beyond their edges',()=>{
  expect(townLocation(-10,217)).toContain('王宮中庭');
  expect(townLocation(-10,253)).toContain('白光大廳');
  expect(townLocation(29,253)).toContain('海風迴廊');
  expect(townLocation(10,284)).toContain('王宮觀海臺');
  expect(townSurfaceHeight(-10,292)).toBeNull();
  expect(townSurfaceHeight(41,253)).toBeNull();
 });
});
