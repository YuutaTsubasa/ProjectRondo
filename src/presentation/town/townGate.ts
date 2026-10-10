import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TownBounds} from './townAssets';

/** Portal profile measured against arch+gateway export; only for its axis-aligned placement.
 * Overall bounds include the open arch, so never use one solid box for this asset. */
export function gateCollisionBounds(bounds:TownBounds):TownBounds[]{
 const width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 const cx=(bounds.min.x+bounds.max.x)/2;
 const box=(left:number,right:number,bottom:number):TownBounds=>({
  min:new Vector3(cx+left*width,bounds.min.y+bottom*height,bounds.min.z),
  max:new Vector3(cx+right*width,bounds.max.y,bounds.max.z),
 });
 // Keep a ~4.35 m ground-level opening at the placed 11 m height. Stepped upper
 // sections follow the rising arch so central jumps have more headroom than at its shoulders.
 return [box(-.5,-.18,0),box(.18,.5,0),
  ...[.48,.58,.63,.63,.58,.48].map((bottom,i)=>box(-.18+i*.06,-.18+(i+1)*.06,bottom))];
}
