import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreateIcoSphere} from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {CITY_BLOCKS} from '../../domain/town/townDistricts';
import {townSurfaceHeight} from '../../domain/town/townTerraces';
import type {TownBounds} from './townAssets';

/** Edge furniture only: one body per substantial prop, eight static material batches, no lights. */
export function createTownStreetDetails(scene:Scene){
 const batches=new Map<PBRMaterial,Mesh[]>(),cameraSolids:TownBounds[]=[];
 const material=(name:string,hex:string)=>{
  const m=new PBRMaterial('street-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();
  m.roughness=.82;m.metallic=0;m.environmentIntensity=.22;return m;
 };
 const stone=material('stone','#e5dfd0'),wood=material('wood','#80684f'),blue=material('blue','#477fab'),
  iron=material('iron','#4c5a62'),leaf=material('leaf','#738457'),fruit=material('citrus','#d7a24b'),
  clay=material('clay','#b58467'),glass=material('lantern','#ffedc4');
 glass.emissiveColor=Color3.FromHexString('#ffdda0').toLinearSpace().scale(.2);
 const add=(m:Mesh,mat:PBRMaterial)=>{m.material=mat;m.isPickable=false;const list=batches.get(mat)??[];list.push(m);batches.set(mat,list);return m;};
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:PBRMaterial)=>{
  const m=CreateBox('street-'+id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return add(m,mat);
 };
 const solid=(id:string,x:number,z:number,w:number,h:number,d:number)=>{
  const y=townSurfaceHeight(x,z);
  if(y===null)throw new Error('Street furniture requires authored ground: '+id);
  const body=CreateBox('city-street-body-'+id,{width:w,height:h,depth:d},scene);
  body.position.set(x,y+h/2,z);body.isVisible=false;body.isPickable=false;
  new PhysicsAggregate(body,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);
  cameraSolids.push({min:new Vector3(x-w/2,y,z-d/2),max:new Vector3(x+w/2,y+h,z+d/2)});
  return y;
 };
 // A single counter under each inward-facing awning leaves the central door and promenade open.
 for(const b of CITY_BLOCKS.filter(b=>b.shop)){
  const side=b.z<76?1:-1,x=b.x-3,z=b.z+side*(b.depth/2+1.05),y=solid('counter-'+b.id,x,z,3,1.5,1.15);
  box('counter',x,y+.55,z,3,1.1,1.1,wood);
  box('counter-rim',x,y+1.12,z,3.1,.14,1.2,stone);
  for(const dx of [-.9,0,.9]){
   box('produce-tray',x+dx,y+1.24,z,.78,.15,.78,clay);
   for(const dz of [-.2,.2]){
    const produce=CreateIcoSphere('street-citrus',{radius:.17,subdivisions:1,flat:true},scene);
    produce.position.set(x+dx,y+1.42,z+dz);add(produce,fruit);
   }
  }
  // Timber shutters and a small three-part emblem make the shop readable without fake text.
  for(const dx of [-4,4])box('shutter',b.x+dx,y+2.2,b.z+side*(b.depth/2+.12),.45,2.1,.13,blue);
  for(const dx of [-.45,0,.45])box('shop-emblem',b.x+dx,y+4.3,b.z+side*(b.depth/2+.17),.2,.3,.08,stone);
 }
 // Pocket seating is placed outside both the journey and the large city loop.
 for(const [x,z] of [[-10,140],[-62,66]]){
  const y=solid('bench-'+x+'-'+z,x,z,3,1.25,1.05);
  box('bench-seat',x,y+.53,z,3,.16,1,wood);box('bench-back',x,y+.98,z+.44,3,.55,.12,wood);
  for(const dx of [-1.1,1.1])box('bench-leg',x+dx,y+.23,z,.18,.46,.75,iron);
 }
 for(const [x,z] of [[-10,118],[-10,143]]){
  const y=solid('planter-'+z,x,z,2.4,1.25,1.6);
  box('planter',x,y+.42,z,2.4,.84,1.6,stone);box('planter-rim',x,y+.87,z,2.5,.16,1.7,stone);
  const plant=CreateSphere('street-shrub',{diameter:1,segments:6},scene);plant.scaling.set(2.1,.65,1.35);plant.position.set(x,y+1.03,z);add(plant,leaf);
 }
 for(const [x,z] of [[-80,76],[60,76],[-60,125],[40,135],[-56,184],[36,184]]){
  const y=solid('lantern-'+x+'-'+z,x,z,.48,4.3,.48);
  box('lamp-foot',x,y+.22,z,.48,.44,.48,stone);box('lamp-post',x,y+2,z,.12,3.5,.12,iron);
  box('lamp-glass',x,y+3.8,z,.4,.62,.4,glass);box('lamp-cap',x,y+4.18,z,.6,.14,.6,iron);
  box('banner-arm',x+.62,y+3.4,z,1.4,.08,.08,iron);
  box('blue-banner',x+.72,y+2.66,z,.82,1.32,.06,blue);
  box('banner-hem',x+.72,y+2.06,z,.82,.1,.075,stone);
 }
 // Flush stone/drain trim frames the street, without adding collision seams or raised curbs.
 for(const [z,minX,maxX] of [[72.7,-80,60],[78.7,-80,60],[126.7,-80,60],[133.3,-80,60],[184.5,-64,42],[191.5,-64,42]]){
  const y=townSurfaceHeight((minX+maxX)/2,z)!;
  box('paving-border',(minX+maxX)/2,y+.012,z,maxX-minX,.018,.3,stone);
  box('drain-line',(minX+maxX)/2,y+.014,z+.22,maxX-minX,.018,.09,iron);
  for(let x=minX+3;x<maxX;x+=8){
   box('drain-grate',x,y+.027,z,.55,.012,.36,iron);
   for(const dx of [-.15,.15])box('grate-slot',x+dx,y+.035,z,.04,.009,.28,stone);
  }
 }
 const receivers:Mesh[]=[];
 for(const [mat,parts] of batches){
  const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;
  mesh.name='city-street-'+mat.name;mesh.isPickable=false;mesh.freezeWorldMatrix();receivers.push(mesh);
 }
 return {receivers,casters:receivers,cameraSolids};
}
