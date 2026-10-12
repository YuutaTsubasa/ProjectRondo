import {STAGE_IDS} from '../../src/domain/stage/stageIds';
import {CITY_STOPS} from '../../src/domain/region/cityJourney';
import {NodeIO} from '@gltf-transform/core';
import {getBounds} from '@gltf-transform/functions';
import {TOWN_BUILDINGS} from '../../src/domain/town/townLayout';
import { describe, expect, it } from 'vitest';
import { REGION_PLACES, REGION_SPAWN, REGION_TRAILS, regionHeight, isRegionPositionSafe } from '../../src/domain/region/regionLayout';

describe('first region traversal', () => {
  it('joins the town and outdoor road at exactly the same supported height', () => {
    for (let x = -5; x <= 5; x += .5) {
      expect(regionHeight(x, -63)).toBe(0);
      expect(Math.abs(regionHeight(x, -63.1))).toBeLessThan(.02);
    }
    expect(isRegionPositionSafe(REGION_SPAWN)).toBe(true);
  });
  it('keeps every authored trail continuously walkable with comfortable slopes', () => {
    for (const trail of REGION_TRAILS) for (let i = 1; i < trail.length; i++) {
      const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
      let previous = regionHeight(ax, az);
      for (let step = 1; step <= steps; step++) {
        const x = ax + (bx - ax) * step / steps, z = az + (bz - az) * step / steps;
        const y = regionHeight(x, z);
        expect(isRegionPositionSafe({ x, y: y + 1.3, z })).toBe(true);
        expect(Math.abs(y - previous) / (Math.hypot(bx - ax, bz - az) / steps)).toBeLessThan(.55);
        previous = y;
      }
    }
  });
  it('provides every stage and city stop with safe, gently sloped interaction clearings', () => {
    expect(REGION_PLACES.map(p => p.id).sort()).toEqual([...STAGE_IDS,...CITY_STOPS.map(s=>s.id),'cove','homecoming','ridge','signal','watch'].sort());
    for (const place of REGION_PLACES) {
      const y = regionHeight(place.x, place.z);
      expect(isRegionPositionSafe({ ...place, y: y + 1.3 })).toBe(true);
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        expect(Math.abs(regionHeight(place.x + dx, place.z + dz) - y)).toBeLessThan(.8);
      }
    }
  });
  it('recovers sea falls, invalid positions and escape around the town platform', () => {
    expect(isRegionPositionSafe({ x: 60, y: 1, z: 0 })).toBe(false);
    expect(isRegionPositionSafe({ x: 90, y: 1, z: -180 })).toBe(false);
    expect(isRegionPositionSafe({ x: 0, y: -13, z: -118 })).toBe(false);
    expect(isRegionPositionSafe({ x: NaN, y: 1, z: 0 })).toBe(false);
  });
});

it('places the palace tower course west of the white tower with distinct nearby interactions', () => {
 const course=REGION_PLACES.find(p=>p.id==='course')!;
 expect(course.name).toBe('白宮天廊');expect(course.x).toBe(-20);expect(course.z).toBe(43);
 expect(regionHeight(course.x,course.z)).toBe(0);
 for(const other of REGION_PLACES.filter(p=>p.id!=='course'))expect(Math.hypot(course.x-other.x,course.z-other.z)).toBeGreaterThan(8);
});

it('keeps the northwest entry and its approach clear of actual scaled town asset bounds',async()=>{
 const io=new NodeIO();
 const footprints=await Promise.all([...new Set(TOWN_BUILDINGS.map(b=>b.kind))].map(async kind=>{
  const doc=await io.read('public/town/'+kind+'.glb');return [kind,getBounds(doc.getRoot().listScenes()[0])] as const;
 }));
 const bounds=new Map(footprints);
 // The southern approach skirts the square's tree planters; the arch is 11.7 units wide.
 const route=[[-6,38],[-20,38],[-20,43]];
 for(const building of TOWN_BUILDINGS){
  const raw=bounds.get(building.kind)!,scale=building.height/(raw.max[1]-raw.min[1]);
  const width=(raw.max[0]-raw.min[0])*scale,depth=(raw.max[2]-raw.min[2])*scale;
  const halfX=(Math.abs(Math.cos(building.yaw))*width+Math.abs(Math.sin(building.yaw))*depth)/2;
  const halfZ=(Math.abs(Math.sin(building.yaw))*width+Math.abs(Math.cos(building.yaw))*depth)/2;
  const overlaps=(x:number,z:number,r:number)=>Math.abs(x-building.x)<halfX+r&&Math.abs(z-building.z)<halfZ+r;
  expect(overlaps(-20,43,6),building.id+' overlaps course arch').toBe(false);
  for(let i=1;i<route.length;i++)for(let t=0;t<=1;t+=.05){
   const [ax,az]=route[i-1],[bx,bz]=route[i];
   expect(overlaps(ax+(bx-ax)*t,az+(bz-az)*t,.7),building.id+' blocks approach').toBe(false);
  }
 }
});
