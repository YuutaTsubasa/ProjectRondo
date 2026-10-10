import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TownBounds} from './townAssets';
// Twice the follow camera near plane. Never let collision collapse its focal distance:
// TargetCamera.setTarget at the camera position zeros its internal reference vector,
// so even moving away on later frames cannot restore a valid view matrix.
const MIN_CAMERA_DISTANCE = .1;
const PADDING = .25;
const AXES = ['x','y','z'] as const;

/** Fraction of aim→aim+delta where the segment enters the padded box; null when it never does. */
function entry(aim:Vector3,delta:Vector3,bounds:TownBounds,pad:number):number|null{
 let near=0,far=1;
 for(const axis of AXES){
  const low=bounds.min[axis]-pad,high=bounds.max[axis]+pad;
  if(Math.abs(delta[axis])<1e-8){if(aim[axis]<low||aim[axis]>high)return null;}
  else{const a=(low-aim[axis])/delta[axis],b=(high-aim[axis])/delta[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
 }
 return near<=far&&far>=0?near:null;
}
const contains=(bounds:TownBounds,p:Vector3,pad:number)=>AXES.every(axis=>p[axis]>=bounds.min[axis]-pad&&p[axis]<=bounds.max[axis]+pad);

/** Shorten the player-to-camera segment before it enters an authored solid. */
export function townCameraPosition(aim:Vector3,desired:Vector3,solids:readonly TownBounds[]):Vector3{
 const delta=desired.subtract(aim),distance=delta.length();
 if(distance===0)return aim.add(new Vector3(0,0,MIN_CAMERA_DISTANCE));
 // A solid farther from the aim than the boom (plus padding) cannot be reached this frame.
 const reach=distance+PADDING;
 let limit=1;
 for(const bounds of solids){
  const dx=Math.max(bounds.min.x-aim.x,0,aim.x-bounds.max.x),dy=Math.max(bounds.min.y-aim.y,0,aim.y-bounds.max.y),dz=Math.max(bounds.min.z-aim.z,0,aim.z-bounds.max.z);
  if(dx*dx+dy*dy+dz*dz>reach*reach)continue;
  // The segment can only start inside a solid's padding (hugging a wall) or inside its box (an
  // authored box larger than its collider, such as a rounded boulder). Measuring entry from inside
  // would read 0 and pull the camera into the character, so fall back to the bare box, and ignore a
  // box that already contains the aim: the camera cannot be in front of it.
  let pad=PADDING;
  if(contains(bounds,aim,PADDING)){if(contains(bounds,aim,0))continue;pad=0;}
  const near=entry(aim,delta,bounds,pad);
  if(near!==null)limit=Math.min(limit,Math.max(0,near-.025));
 }
 return aim.add(delta.scale(Math.max(limit,Math.min(1,MIN_CAMERA_DISTANCE/distance))));
}
