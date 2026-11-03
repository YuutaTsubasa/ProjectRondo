import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {createTownStreetDetails} from './townStreetDetails';
import {CITY_BLOCKS} from '../../domain/town/townDistricts';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';
import type {TownBounds} from './townAssets';

/** Street-scale architecture, batched per district; authored bodies remain separate physics. */
export function createTownDistricts(scene:Scene){
 const batches=new Map<string,Mesh[]>(),cameraSolids:TownBounds[]=[];let district='market';
 const grain=createStoneTextures(scene);
 const material=(name:string,color:string,roughness=.8)=>{const m=new PBRMaterial('city-'+name,scene);m.albedoColor=Color3.FromHexString(color).toLinearSpace();m.roughness=roughness;m.metallic=0;m.environmentIntensity=.22;return m;};
 const stone=material('limestone','#dedbce'),trim=material('carved-stone','#f0eadd'),roof=material('slate','#47647e'),window=material('window','#334958',.4),blue=material('blue-cloth','#3f709f'),wood=material('oak','#766151'),green=material('garden','#607449'),brass=material('brass','#b8a174',.45);
 stone.albedoTexture=grain.albedo;stone.bumpTexture=grain.normal;
 const add=(m:Mesh,mat:PBRMaterial)=>{m.material=mat;m.isPickable=false;if(mat===stone)applyStoneUV(m);const key=district+':'+mat.name;const parts=batches.get(key)??[];parts.push(m);batches.set(key,parts);return m;};
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone)=>{const m=CreateBox('city-'+id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return add(m,mat);};
 const solid=(id:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const m=CreateBox('city-body-'+id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.isVisible=false;m.isPickable=false;
  new PhysicsAggregate(m,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);
  cameraSolids.push({min:new Vector3(x-w/2,y-h/2,z-d/2),max:new Vector3(x+w/2,y+h/2,z+d/2)});
 };
 for(const b of CITY_BLOCKS){
  district=b.id.split('-')[0];const {x,z,width:w,depth:d,height:h,baseY:y}=b;
  box(b.id,x,y+h/2,z,w,h,d);solid(b.id,x,y+h/2,z,w,h,d);
  for(const dy of [.25,h*.48,h])box('cornice',x,y+dy,z,w+.35,.3,d+.35,trim);
  for(const sx of [-1,1])for(const sz of [-1,1])box('corner-pilaster',x+sx*(w/2-.25),y+h/2,z+sz*(d/2-.05),.55,h,.45,trim);
  const rise=w*.27,angle=Math.atan2(rise,w/2),length=Math.hypot(w/2,rise)+.55;
  for(const side of [-1,1]){const panel=box('pitched-roof',x+side*w/4,y+h+rise/2,z,length,.32,d+1.1,roof);panel.rotation.z=-side*angle;}
  for(const side of [-1,1]){
   const gable=new Mesh('city-gable',scene),data=new VertexData();
   data.positions=[x-w/2,y+h,z+side*d/2,x+w/2,y+h,z+side*d/2,x,y+h+rise,z+side*d/2];
   data.indices=side<0?[0,2,1]:[0,1,2];const normals:number[]=[];VertexData.ComputeNormals(data.positions,data.indices,normals);data.normals=normals;data.applyToMesh(gable);add(gable,stone);
  }
  box('ridge-cap',x,y+h+rise,z,.32,.35,d+1.2,roof);
  box('chimney',x+w*.26,y+h+rise*.7,z+d*.2,.8,2.2,.8,trim);
  // Closed exterior doors and windows on both street fronts; no playable interiors.
  for(const side of [-1,1]){
   const face=z+side*(d/2+.035);
   for(const dx of [-w*.3,0,w*.3])for(const level of [h*.28,h*.72]){
    if(level<h*.4&&dx===0)continue;
    const wx=x+dx,wy=y+level;
    box('window',wx,wy,face,1.35,2,.06,window);
    for(const s of [-1,1])box('window-jamb',wx+s*.78,wy,face,.18,2.35,.22,trim);
    box('window-sill',wx,wy-1.1,face,1.85,.2,.4,trim);
    box('window-lintel',wx,wy+1.12,face,1.85,.22,.25,trim);
   }
   box('door',x,y+1.45,face,1.65,2.9,.08,wood);
   box('door-canopy',x,y+3.1,face+side*.4,2.5,.3,1.05,trim);
   if(b.shop){
    const awning=box('shop-awning',x,y+3.2,face+side*1.35,w-1,.13,2.6,blue);awning.rotation.x=side*.12;
    box('shop-sign',x,y+4.3,face,w*.55,.65,.2,wood);
    for(const sx of [-1,1])box('awning-post',x+sx*(w/2-.8),y+1.55,face+side*2.3,.12,3.1,.12,brass);
   }
  }
 }
 const planter=(x:number,z:number,y:number,w:number,d:number)=>{
  box('planter',x,y+.3,z,w,.6,d,trim);box('planting',x,y+.64,z,w-.5,.15,d-.5,green);solid('planter',x,y+.4,z,w,.8,d);
  for(const sx of [-1,1]){const m=CreateSphere('city-cypress',{diameter:2,segments:10},scene);m.scaling.set(.85,3.5,.85);m.position.set(x+sx*(w/2-1.2),y+4.1,z);add(m,green);}
 };
 district='market';
 for(const x of [-30,10])planter(x,103,0,12,6);
 district='court';
 for(const x of [-35,15])for(const z of [178,201])planter(x,z,12,14,4);
 // Benches face the palace and sea, leaving the forecourt's east-west route clear.
 for(const x of [-32,12])for(const z of [181,198]){
  box('bench',x,12.55,z,3,.2,.8,wood);box('bench-back',x,13,z+.35,3,.8,.12,wood);
  solid('bench',x,12.65,z,3,1.3,.9);
 }
 // Paired blue banners give the open royal approach a visible destination.
 for(const x of [-20,0]){
  const pole=CreateCylinder('city-standard',{height:7,diameter:.16,tessellation:8},scene);pole.position.set(x,15.5,205);add(pole,brass);
  box('royal-banner',x+1,17.6,205,1.8,2.6,.07,blue);
 }
 const receivers:Mesh[]=[];
 for(const [key,parts] of batches){const m=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;m.name='city-blocks-'+key;m.isPickable=false;m.freezeWorldMatrix();receivers.push(m);}
 const details=createTownStreetDetails(scene);
 receivers.push(...details.receivers);cameraSolids.push(...details.cameraSolids);
 return {receivers,casters:receivers,cameraSolids};
}
