import {expect,it} from 'vitest';
import {relativeBearing, bearingTo, minimapOffset} from '../../src/presentation/hud/hudNavigation';
it('wraps compass bearings at north without a full-turn jump',()=>{
 expect(relativeBearing(5,355)).toBe(10);
 expect(relativeBearing(355,5)).toBe(-10);
 expect(relativeBearing(0,180)).toBe(-180);
});
it('matches the atlas: +Z is north and +X is east',()=>{
 expect(bearingTo({x:0,z:0},{x:0,z:10})).toBe(0);
 expect(bearingTo({x:0,z:0},{x:10,z:0})).toBe(90);
 expect(bearingTo({x:0,z:0},{x:0,z:-10})).toBe(180);
});
it('keeps nearby destinations exact and pins distant ones to the map rim',()=>{
 expect(minimapOffset({x:10,z:10},{x:13,z:14},60)).toEqual({x:3,y:-4});
 const edge=minimapOffset({x:0,z:0},{x:300,z:400},60);
 expect(edge.x).toBeCloseTo(36);expect(edge.y).toBeCloseTo(-48);
 expect(minimapOffset({x:1,z:1},{x:1,z:1},60)).toEqual({x:0,y:0});
});
