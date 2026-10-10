import {describe,it,expect} from 'vitest';
import {TOWN_BUILDINGS,TOWN_SPAWN,outsideTown,townLocation} from '../../src/domain/town/townLayout';
describe('town preview layout',()=>{
 it('keeps the entrance and main street clear of facades',()=>{
  expect(outsideTown(TOWN_SPAWN.x,TOWN_SPAWN.y,TOWN_SPAWN.z)).toBe(false);
  for(const b of TOWN_BUILDINGS.filter(b=>b.z<15&&b.kind!=='gate')) expect(Math.abs(b.x)).toBeGreaterThanOrEqual(12);
  const gate=TOWN_BUILDINGS.find(b=>b.kind==='gate')!;
  expect(gate).toBeDefined();expect(TOWN_SPAWN.z).toBeLessThan(gate.z-6);
  expect(new Set(TOWN_BUILDINGS.map(b=>b.id)).size).toBe(TOWN_BUILDINGS.length);
  expect(new Set(TOWN_BUILDINGS.map(b=>b.kind))).toEqual(new Set(['house','shop','tower','gate','arcade']));
 });
 it('recovers sea falls and escaped bounds, but permits the street and promenade',()=>{
  expect(outsideTown(0,1,22)).toBe(false);expect(outsideTown(35,1,22)).toBe(false);
  expect(outsideTown(44,-1,22)).toBe(true);expect(outsideTown(0,-4,10)).toBe(true);
  expect(outsideTown(0,1,90)).toBe(true);expect(outsideTown(NaN,1,0)).toBe(true);
 });
 it('names the town districts according to position',()=>{
  expect(townLocation(0,-24)).toContain('街');expect(townLocation(0,23)).toContain('廣場');expect(townLocation(33,23)).toContain('海');
 });
});
