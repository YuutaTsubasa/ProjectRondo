import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TownBounds} from './townAssets';

/** Measured classical+arch export, placed axis-aligned. Four piers and vaulted
 * shoulders leave a cross-shaped passage; a whole asset box would seal it. */
export function arcadeCollisionBounds(bounds:TownBounds):TownBounds[]{
 const size=bounds.max.subtract(bounds.min),center=bounds.min.add(bounds.max).scale(.5);
 const box=(x0:number,x1:number,z0:number,z1:number,bottom=0):TownBounds=>({
  min:new Vector3(center.x+x0*size.x,bounds.min.y+bottom*size.y,center.z+z0*size.z),
  max:new Vector3(center.x+x1*size.x,bounds.max.y,center.z+z1*size.z),
 });
 const xPiers=[[-.47,-.27],[.27,.47]] as const,zPiers=[[-.47,-.25],[.25,.47]] as const;
 const solids:TownBounds[]=[box(-.5,.5,-.5,.5,.66)];
 for(const [x0,x1] of xPiers)for(const [z0,z1] of zPiers)solids.push(box(x0,x1,z0,z1));
 // Six strips approximate each arch's curved underside; the centre stays taller.
 for(const [i,bottom] of [.47,.55,.61,.61,.55,.47].entries()){
  for(const [z0,z1] of zPiers)solids.push(box(-.27+i*.09,-.27+(i+1)*.09,z0,z1,bottom));
  for(const [x0,x1] of xPiers)solids.push(box(x0,x1,-.25+i/12,-.25+(i+1)/12,bottom));
 }
 return solids;
}
