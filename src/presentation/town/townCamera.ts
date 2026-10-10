import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TownBounds} from './townAssets';
/** Shorten the player-to-camera segment before it enters an authored solid. */
export function townCameraPosition(aim:Vector3,desired:Vector3,solids:readonly TownBounds[]):Vector3{
 const delta=desired.subtract(aim);let limit=1;
 for(const bounds of solids){
  let near=0,far=1;
  for(const axis of ['x','y','z'] as const){
   const low=bounds.min[axis]-.25,high=bounds.max[axis]+.25;
   if(Math.abs(delta[axis])<1e-8){if(aim[axis]<low||aim[axis]>high){far=-1;break;}}
   else{const a=(low-aim[axis])/delta[axis],b=(high-aim[axis])/delta[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
  }
  if(near<=far&&far>=0&&near>=0)limit=Math.min(limit,Math.max(0,near-.025));
 }
 return aim.add(delta.scale(limit));
}
