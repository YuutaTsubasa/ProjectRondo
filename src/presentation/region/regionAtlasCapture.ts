import type {Scene} from '@babylonjs/core/scene';
import {Camera} from '@babylonjs/core/Cameras/camera';
import {TargetCamera} from '@babylonjs/core/Cameras/targetCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {REGION_BOUNDS} from '../../domain/region/regionLayout';
export interface AtlasBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export function atlasCaptureBounds():AtlasBounds {
 const side=Math.max(REGION_BOUNDS.maxX-REGION_BOUNDS.minX,REGION_BOUNDS.maxZ-REGION_BOUNDS.minZ)+24;
 const cx=(REGION_BOUNDS.minX+REGION_BOUNDS.maxX)/2,cz=(REGION_BOUNDS.minZ+REGION_BOUNDS.maxZ)/2;
 return {minX:cx-side/2,maxX:cx+side/2,minZ:cz-side/2,maxZ:cz+side/2};
}
/** North (+Z) is at the top. A right-handed overhead view is mirrored horizontally
 * when exported so east (+X) agrees with the HUD's world-to-map projection. */
export function createAtlasCamera(scene:Scene,bounds:AtlasBounds):TargetCamera {
 const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
 const camera=new TargetCamera('atlas-capture',new Vector3(cx,360,cz),scene);
 camera.upVector=new Vector3(0,0,1);camera.setTarget(new Vector3(cx,0,cz));
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
 camera.orthoLeft=-(bounds.maxX-bounds.minX)/2;camera.orthoRight=-camera.orthoLeft;
 camera.orthoBottom=-(bounds.maxZ-bounds.minZ)/2;camera.orthoTop=-camera.orthoBottom;
 camera.minZ=1;camera.maxZ=800;
 return camera;
}
