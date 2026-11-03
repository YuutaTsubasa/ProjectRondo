import {describe,expect,it} from 'vitest';
import {TOWN_BUILDINGS} from '../../src/domain/town/townLayout';
import {isRegionPositionSafe,regionHeight} from '../../src/domain/region/regionLayout';
import {nearbyRegionPlace} from '../../src/domain/region/regionObjectives';
import {
 PARLOR_HOUSE_ID,PARLOR_ENTRANCE,PARLOR_RETURN,PARLOR_ROOM,PARLOR_SPAWN,PARLOR_EXIT,PARLOR_HOST,PARLOR_TABLES,
 parlorChairs,nearbyParlorSpot,outsideParlor,parlorTalk,PARLOR_TALKS,
 PARLOR_ORIGIN,PARLOR_ARRIVAL,toParlorRoom,fromParlorRoom,inParlor,
} from '../../src/domain/town/mahjongParlor';

const house=TOWN_BUILDINGS.find(b=>b.id===PARLOR_HOUSE_ID)!;
const inRoom=(x:number,z:number,margin=0)=>x>=PARLOR_ROOM.minX+margin&&x<=PARLOR_ROOM.maxX-margin&&z>=PARLOR_ROOM.minZ+margin&&z<=PARLOR_ROOM.maxZ-margin;

describe('the mahjong parlor entrance on Ivory Street',()=>{
 it('belongs to an existing street-facing townhouse',()=>{
  expect(house.kind).toBe('house');
  // East houses face the street (-x); the entrance stands between the facade and the sidewalk.
  expect(Math.sign(house.x)).toBe(1);
  expect(PARLOR_ENTRANCE.x).toBeLessThan(house.x-3.6);
  expect(PARLOR_ENTRANCE.x).toBeGreaterThan(6.3);
  expect(Math.abs(PARLOR_ENTRANCE.z-house.z)).toBeLessThan(1);
 });
 it('returns the player to safe town ground within reach of the door',()=>{
  expect(isRegionPositionSafe(PARLOR_RETURN)).toBe(true);
  expect(PARLOR_RETURN.y-regionHeight(PARLOR_RETURN.x,PARLOR_RETURN.z)).toBeCloseTo(1.3);
  expect(nearbyRegionPlace(PARLOR_RETURN,[PARLOR_ENTRANCE],regionHeight)?.id).toBe('parlor');
 });
});

describe('the parlor interior',()=>{
 it('spawns inside the door, beside the exit',()=>{
  expect(inRoom(PARLOR_SPAWN.x,PARLOR_SPAWN.z,.5)).toBe(true);
  expect(outsideParlor(PARLOR_SPAWN)).toBe(false);
  expect(nearbyParlorSpot(PARLOR_SPAWN)).toBe('exit');
  expect(PARLOR_EXIT.z).toBeLessThan(PARLOR_ROOM.minZ+1);
 });
 it('keeps tables, chairs and the host inside the walls without overlapping',()=>{
  const chairs=parlorChairs();
  expect(PARLOR_TABLES.length).toBeGreaterThanOrEqual(3);
  expect(chairs).toHaveLength(PARLOR_TABLES.length*4-1);
  for(const t of PARLOR_TABLES)expect(inRoom(t.x,t.z,1.6)).toBe(true);
  for(const c of chairs)expect(inRoom(c.x,c.z,.4)).toBe(true);
  for(const [i,a] of PARLOR_TABLES.entries())for(const b of PARLOR_TABLES.slice(i+1))
   expect(Math.max(Math.abs(a.x-b.x),Math.abs(a.z-b.z))).toBeGreaterThanOrEqual(3.2);
  expect(inRoom(PARLOR_HOST.x,PARLOR_HOST.z,1)).toBe(true);
  // The host floats in its table's aisle seat, so that seat has no chair.
  const table=PARLOR_TABLES.find(t=>t.id===PARLOR_HOST.tableId)!;
  expect(PARLOR_HOST.z).toBeCloseTo(table.z);expect(PARLOR_HOST.x).toBeLessThan(table.x);
  expect(Math.abs(table.x)).toBeGreaterThan(Math.abs(PARLOR_HOST.x));
  expect(chairs.filter(c=>c.tableId===table.id).map(c=>c.side).sort()).toEqual(['east','north','south']);
 });
 it('keeps a clear aisle from the door to the host',()=>{
  for(const t of PARLOR_TABLES)expect(Math.abs(t.x)-1.3).toBeGreaterThan(1.2);
  expect(Math.hypot(PARLOR_HOST.x-PARLOR_EXIT.x,PARLOR_HOST.z-PARLOR_EXIT.z)).toBeGreaterThan(5);
 });
 it('offers talking near the host and leaving near the door only',()=>{
  expect(nearbyParlorSpot({x:PARLOR_HOST.x-1.2,y:1.2,z:PARLOR_HOST.z})).toBe('host');
  expect(nearbyParlorSpot({x:PARLOR_EXIT.x,y:1.2,z:PARLOR_EXIT.z+.5})).toBe('exit');
  expect(nearbyParlorSpot({x:0,y:1.2,z:1})).toBeUndefined();
  expect(nearbyParlorSpot({x:PARLOR_HOST.x-1.2,y:4,z:PARLOR_HOST.z})).toBeUndefined();
  expect(nearbyParlorSpot({x:NaN,y:1.2,z:0})).toBeUndefined();
 });
 it('recovers positions that escape the room',()=>{
  expect(outsideParlor({x:0,y:1.2,z:0})).toBe(false);
  expect(outsideParlor({x:PARLOR_ROOM.maxX+1,y:1.2,z:0})).toBe(true);
  expect(outsideParlor({x:0,y:-2,z:0})).toBe(true);
  expect(outsideParlor({x:0,y:1.2,z:Infinity})).toBe(true);
 });
});

describe('talking to 一目元',()=>{
 it('introduces itself once, then rotates through the rest',()=>{
  expect(parlorTalk(0)).toBe('ichimoku_first');
  const later=Array.from({length:PARLOR_TALKS.length*2},(_,i)=>parlorTalk(i+1));
  expect(later).not.toContain('ichimoku_first');
  expect(new Set(later)).toEqual(new Set(PARLOR_TALKS.filter(id=>id!=='ichimoku_first')));
  expect(later[0]).not.toBe(later[1]);
 });
 it('treats invalid counts as a first visit',()=>{
  expect(parlorTalk(-1)).toBe('ichimoku_first');
  expect(parlorTalk(Number.NaN)).toBe('ichimoku_first');
  expect(parlorTalk(2.5)).toBe('ichimoku_first');
 });
});

describe('the parlor inside the region world',()=>{
 it('sits outside every region and town position, so the two never overlap',()=>{
  const corners=[[PARLOR_ROOM.minX,PARLOR_ROOM.minZ],[PARLOR_ROOM.maxX,PARLOR_ROOM.maxZ]].map(([x,z])=>fromParlorRoom({x,y:1.2,z}));
  for(const c of corners)expect(isRegionPositionSafe(c)).toBe(false);
  expect(PARLOR_ORIGIN.x+PARLOR_ROOM.minX).toBeGreaterThan(85+100);
 });
 it('converts between room and world coordinates',()=>{
  const p={x:1,y:2,z:3};
  expect(toParlorRoom(fromParlorRoom(p))).toEqual(p);
  expect(inParlor(PARLOR_ARRIVAL)).toBe(true);
  expect(nearbyParlorSpot(toParlorRoom(PARLOR_ARRIVAL))).toBe('exit');
  expect(inParlor(PARLOR_RETURN)).toBe(false);
  expect(inParlor({x:0,y:1.2,z:0})).toBe(false);
 });
});
