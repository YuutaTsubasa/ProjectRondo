import {describe,it,expect} from 'vitest';
import {TERRACE_ROUTE,townSurfaceHeight} from '../../src/domain/town/townTerraces';
import {outsideTown} from '../../src/domain/town/townLayout';
import {regionHeight,isRegionPositionSafe} from '../../src/domain/region/regionLayout';
describe('coastal city ascent',()=>{
 it('supports a continuous route from the old street to a twelve-metre overlook',()=>{
  let peak=0;
  for(let i=1;i<TERRACE_ROUTE.length;i++){
   const [ax,az]=TERRACE_ROUTE[i-1],[bx,bz]=TERRACE_ROUTE[i];
   const distance=Math.hypot(bx-ax,bz-az),steps=Math.ceil(distance*4);
   let previous=townSurfaceHeight(ax,az)!;
   for(let j=0;j<=steps;j++){
    const x=ax+(bx-ax)*j/steps,z=az+(bz-az)*j/steps,y=townSurfaceHeight(x,z);
    expect(y).not.toBeNull();
    expect(Math.abs(y!-previous)).toBeLessThanOrEqual(.07);
    expect(regionHeight(x,z)).toBeCloseTo(y!,5);
    expect(outsideTown(x,y!+1.3,z)).toBe(false);
    expect(isRegionPositionSafe({x,y:y!+1.3,z})).toBe(true);
    previous=y!;peak=Math.max(peak,y!);
   }
  }
  expect(peak).toBe(12);
 });
 it('leaves the existing story and expedition ground at zero and rejects unsupported western space',()=>{
  for(const [x,z] of [[0,-54],[-20,43],[-6,33],[33,-20]])expect(townSurfaceHeight(x,z)).toBe(0);
  expect(townSurfaceHeight(-90,-40)).toBeNull();
  expect(outsideTown(-90,1,-40)).toBe(true);
  expect(isRegionPositionSafe({x:-90,y:1,z:-40})).toBe(false);
 });
});

it('supports both ascent roads through a large explorable city and back to the old square',()=>{
 const route=[[-30,50],[-30,76],[-70,76],[-70,130],[-70,188],[50,188],[50,130],[50,76],[30,76],[30,50]];
 for(let i=1;i<route.length;i++){
  const [ax,az]=route[i-1],[bx,bz]=route[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)*4);
  let previous=townSurfaceHeight(ax,az)!;
  for(let j=0;j<=n;j++){
   const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n,y=townSurfaceHeight(x,z);
   expect(y,'unsupported '+[x,z]).not.toBeNull();
   expect(Math.abs(y!-previous)).toBeLessThan(.08);
   expect(isRegionPositionSafe({x,y:y!+1.3,z})).toBe(true);previous=y!;
  }
 }
 expect(townSurfaceHeight(-10,188)).toBe(12);
 expect(townSurfaceHeight(-10,130)).toBe(6);
});
