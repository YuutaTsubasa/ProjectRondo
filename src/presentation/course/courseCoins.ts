import type {Scene} from '@babylonjs/core/scene';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {createBeveledBox} from '../palace/palaceArchitecture';
import type {Vec3} from '../../domain/math/vec3';
/** Three-dimensional minted coins share one material; collection has no collider or homing target. */
export function createCourseCoins(scene:Scene,positions:readonly Vec3[]){
 const gold=new PBRMaterial('courseCoinGold',scene);gold.albedoColor=Color3.FromHexString('#eac668');gold.metallic=.72;gold.roughness=.25;gold.emissiveColor=Color3.FromHexString('#372508');
 const meshes=positions.map((p,i)=>{
  const disc=CreateCylinder('coinDisc',{diameter:.58,height:.085,tessellation:24},scene);disc.rotation.x=Math.PI/2;
  const pieces=[disc];
  for(const side of [-1,1]){
   const rim=CreateTorus('coinRim',{diameter:.51,thickness:.032,tessellation:24},scene);rim.rotation.x=Math.PI/2;rim.position.z=side*.05;pieces.push(rim);
   const seal=createBeveledBox('coinSeal',{width:.23,height:.23,depth:.025,bevel:.012},scene);seal.rotation.z=Math.PI/4;seal.position.z=side*.055;pieces.push(seal);
  }
  pieces.forEach(mesh=>mesh.removeVerticesData(VertexBuffer.UVKind));
  const coin=Mesh.MergeMeshes(pieces,true,true)!;coin.name=`courseCoin_${i}`;coin.material=gold;coin.isPickable=false;coin.position.set(p.x,p.y,p.z);return coin;
 });
 return{meshes,update(collected:readonly number[],elapsed:number){
  const taken=new Set(collected);meshes.forEach((mesh,i)=>{mesh.setEnabled(!taken.has(i));mesh.rotation.y=elapsed*1.8+i*.23;});
 }};
}
