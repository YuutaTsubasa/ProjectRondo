import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {ACTIVITY_HOSTS} from '../../content/activityHosts';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../domain/region/regionLayout';

/** Ten static town hosts share two colored silhouettes and one material; no rigs or animation work. */
export function createActivityHosts(scene:Scene){
 const material=new StandardMaterial('activity-host-cloth',scene);material.diffuseColor=Color3.White();material.specularColor.set(.08,.08,.08);
 const template=(uniform:string)=>{
  const parts:Mesh[]=[];
  const part=(mesh:Mesh,x:number,y:number,z:number,color:string)=>{
   mesh.position.set(x,y,z);const c=Color3.FromHexString(color);const colors:number[]=[];
   for(let i=0;i<mesh.getTotalVertices();i++)colors.push(c.r,c.g,c.b,1);
   mesh.setVerticesData(VertexBuffer.ColorKind,colors);parts.push(mesh);return mesh;
  };
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>part(CreateBox(name,{width:w,height:h,depth:d},scene),x,y,z,color);
  const limb=(name:string,x:number,y:number,z:number,h:number,diameter:number,color:string)=>part(CreateCylinder(name,{height:h,diameter,tessellation:10},scene),x,y,z,color);
  const skin='#dfb897',dark='#393b49',ivory='#eee6d2',gold='#d7b76a';
  for(const sign of [-1,1]){
   limb('trouser',sign*.14,.49,0,.76,.19,dark);box('boot',sign*.14,.12,-.065,.21,.23,.37,'#45404a');
   const arm=limb('sleeve',sign*.38,1.18,0,.60,.17,uniform);arm.rotation.z=sign*.12;
   part(CreateSphere('hand',{diameter:.17,segments:6},scene),sign*.415,.85,-.02,skin);
  }
  part(CreateCylinder('coat',{height:.72,diameterTop:.61,diameterBottom:.48,tessellation:10},scene),0,1.18,0,uniform);
  box('waist-belt',0,.91,-.005,.5,.085,.34,dark);box('buckle',0,.91,-.183,.10,.08,.025,gold);
  box('shirt',0,1.43,-.20,.19,.17,.06,ivory);box('jacket-trim',0,1.16,-.26,.035,.37,.025,gold);
  for(const sign of [-1,1])box('epaulette',sign*.265,1.51,0,.16,.055,.22,gold);
  limb('neck',0,1.57,0,.18,.16,skin);
  const head=part(CreateSphere('head',{diameter:.36,segments:10},scene),0,1.78,0,skin);head.scaling.set(1,1.16,.93);
  const hair=part(CreateSphere('hair',{diameter:.375,segments:8},scene),0,1.86,.035,'#53423c');hair.scaling.y=.65;
  for(const sign of [-1,1])box('eye',sign*.069,1.80,-.163,.035,.031,.018,dark);
  box('nose',0,1.75,-.178,.047,.062,.05,skin);box('smile',0,1.69,-.153,.067,.013,.015,'#996b59');
  limb('cap',0,1.99,0,.11,.40,uniform);box('cap-brim',0,1.95,-.15,.39,.035,.24,dark);box('cap-badge',0,1.99,-.205,.07,.065,.015,gold);
  const merged=Mesh.MergeMeshes(parts,true,true)!;merged.name='activity-host-template-'+uniform;merged.material=material;merged.isPickable=false;merged.setEnabled(false);return merged;
 };
 const templates={blue:template('#44658b'),teal:template('#477b7b')};
 const meshes=ACTIVITY_HOSTS.map(host=>{
  const anchor=REGION_INTERACTION_PLACES.find(p=>p.id===host.stageId)!;
  const mesh=templates[host.uniform].clone('region-activity-host-'+host.stageId)!;
  mesh.setEnabled(true);mesh.position.set(anchor.x,regionHeight(anchor.x,anchor.z),anchor.z);
  mesh.metadata={stageId:host.stageId,hostName:host.name};mesh.isPickable=false;mesh.addLODLevel(85,null);mesh.freezeWorldMatrix();return mesh;
 });
 return {meshes};
}
