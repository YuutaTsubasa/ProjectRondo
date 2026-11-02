import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreatePlane} from '@babylonjs/core/Meshes/Builders/planeBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {drawSign} from '../parlor/parlorSign';
import {PARLOR_ENTRANCE,PARLOR_NAME} from '../../domain/town/mahjongParlor';

/** Marks the converted townhouse from the street: a hanging signboard and two lanterns at its door. */
export async function createParlorFrontage(scene:Scene):Promise<{casters:Mesh[]}>{
 const material=(name:string,hex:string,roughness=.7,metallic=0)=>{const m=new PBRMaterial('parlor-front-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();m.roughness=roughness;m.metallic=metallic;m.environmentIntensity=.18;return m;};
 const wood=material('wood','#4b3524',.55),bronze=material('bronze','#a68b58',.4,.7),lantern=material('lantern','#b8382f',.6);
 lantern.emissiveColor=Color3.FromHexString('#e0573f').toLinearSpace().scale(.45);
 // The facade stands about 0.9 m behind the entrance spot; the sign hangs from a bracket in front of it.
 const facadeX=PARLOR_ENTRANCE.x+.95,z=PARLOR_ENTRANCE.z,meshes:Mesh[]=[];
 const box=(name:string,x:number,y:number,dz:number,w:number,h:number,d:number,mat:PBRMaterial)=>{const m=CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z+dz);m.material=mat;m.isPickable=false;meshes.push(m);return m;};
 box('parlor-front-bracket',facadeX-.45,4.15,0,.9,.08,.08,wood);
 for(const dz of [-.7,.7])box('parlor-front-chain',facadeX-.75,3.95,dz,.03,.4,.03,bronze);
 box('parlor-front-board',facadeX-.75,3.35,0,.08,.86,1.95,wood);
 const texture=await drawSign(scene,'parlor-front-sign',[PARLOR_NAME],1024,384);
 const face=material('sign','#ffffff',.75);face.albedoTexture=texture;
 for(const side of [-1,1]){
  const plane=CreatePlane('parlor-front-sign',{width:1.8,height:.68,sideOrientation:Mesh.BACKSIDE},scene);
  plane.position.set(facadeX-.75+side*.045,3.35,z);plane.rotation.y=side*Math.PI/2;plane.material=face;plane.isPickable=false;meshes.push(plane);
 }
 for(const dz of [-1.15,1.15]){
  box('parlor-front-lantern-hook',facadeX-.2,3.05,dz,.4,.04,.04,bronze);
  const body=CreateSphere('parlor-front-lantern',{diameterX:.36,diameterY:.46,diameterZ:.36,segments:12},scene);body.position.set(facadeX-.38,2.7,z+dz);body.material=lantern;body.isPickable=false;meshes.push(body);
  for(const dy of [-.24,.24]){const cap=CreateCylinder('parlor-front-lantern-cap',{height:.04,diameter:.18,tessellation:14},scene);cap.position.set(facadeX-.38,2.7+dy,z+dz);cap.material=bronze;cap.isPickable=false;meshes.push(cap);}
 }
 meshes.forEach(m=>m.freezeWorldMatrix());
 return {casters:meshes};
}
