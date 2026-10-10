import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';
import {createNaturalFoliage} from '../babylon/naturalFoliage';
import type {TownAssetPlacement,TownBounds} from './townAssets';
import {createTownSea} from './townSea';
import {createTownBackdrop} from './townBackdrop';
import {gateCollisionBounds} from './townGate';
import {arcadeCollisionBounds} from './townArcade';
import {TOWN_BOUNDS} from '../../domain/town/townLayout';
export interface TownSceneryOptions { southExitWidth?:number; backdrop?:boolean; sea?:boolean }
export function createTownScenery(scene:Scene,assets:readonly TownAssetPlacement[],options:TownSceneryOptions={}){
 const pieces:{mesh:Mesh;cast:boolean}[]=[];const cameraSolids:TownBounds[]=[];
 const grain=createStoneTextures(scene);
 const material=(name:string,hex:string,roughness=.8,metallic=0)=>{const m=new PBRMaterial('town-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();m.roughness=roughness;m.metallic=metallic;m.environmentIntensity=.15;return m;};
 const stone=material('ivory','#cfc8b8'),light=material('cut-stone','#e6e0d2'),paving=material('paving','#c5beb0'),road=material('street','#a8aaa7'),blue=material('blue-inlay','#697f8c'),gold=material('bronze','#a68b58',.4,.7),wood=material('wood','#756448'),grass=material('garden','#65754a'),water=material('fountain-water','#518d9b',.24,.1);
 for(const m of [stone,light,paving,road]){m.albedoTexture=grain.albedo;m.bumpTexture=grain.normal;m.metallicTexture=grain.roughness;m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=true;}
 const add=(mesh:Mesh,mat:PBRMaterial,cast=true)=>{mesh.material=mat;mesh.isPickable=false;if(mat.albedoTexture)applyStoneUV(mesh);pieces.push({mesh,cast});return mesh;};
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone,cast=true)=>{const m=CreateBox(id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return add(m,mat,cast);};
 const cylinder=(id:string,x:number,y:number,z:number,d:number,h:number,mat=stone)=>{const m=CreateCylinder(id,{height:h,diameter:d,tessellation:32},scene);m.position.set(x,y,z);return add(m,mat);};
 const solid=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,camera=true)=>{
  const mesh=CreateBox(id,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.isVisible=false;mesh.isPickable=false;
  new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);
  if(camera)cameraSolids.push({min:new Vector3(x-w/2,y-h/2,z-d/2),max:new Vector3(x+w/2,y+h/2,z+d/2)});
 };
 const depth=TOWN_BOUNDS.maxZ-TOWN_BOUNDS.minZ,centerZ=(TOWN_BOUNDS.maxZ+TOWN_BOUNDS.minZ)/2;
 solid('town-ground-collider',0,-1,centerZ,80,2,depth,false);
 box('town-foundation',0,-1.6,centerZ,80,3.2,depth,stone,false);
 box('town-ground',0,-.035,centerZ,80,.06,depth,paving,false);
 // Walkable paving overlays are flush; collision remains one continuous flat support.
 box('street-bed',0,.009,-19,9,.018,84,road,false);
 for(let z=-60;z<15;z+=3)for(let x=-3;x<=3;x+=3)box('street-slab',x,.023,z,2.94,.025,2.94,paving,false);
 for(const x of [-4.8,4.8])box('street-border',x,.026,-19,.32,.05,84,blue,false);
 box('square-field',0,.015,24,26,.028,25,light,false);
 for(let x=-12;x<=12;x+=3)for(let z=13;z<=35;z+=3)box('square-tile',x,.032,z,2.95,.025,2.95,(Math.round(x/3+z/3)%3===0?paving:light),false);
 box('sea-walk',33,.025,centerZ,8,.05,depth-8,light,false);box('cross-street',20,.026,24,30,.05,7,paving,false);
 for(const x of [-6.3,6.3])box('sidewalk',x,.02,-20,2.3,.04,84,light,false);
 // Low parapets make the water boundary visible; falling beyond it still resets safely.
 const parapets:number[][]=[[39,centerZ,1,depth],[-39,centerZ,1,depth],[0,56,78,1]];
 const opening=Math.max(0,Math.min(76,options.southExitWidth??0));
 if(opening){const width=(78-opening)/2;for(const sign of [-1,1])parapets.push([sign*(opening/2+width/2),TOWN_BOUNDS.minZ+1,width,1]);}
 else parapets.push([0,TOWN_BOUNDS.minZ+1,78,1]);
 for(const [x,z,w,d] of parapets){
  box('town-parapet',x,.62,z,w,1.24,d);box('parapet-coping',x,1.3,z,w+.18,.18,d+.18,light);solid('parapet-collider',x,.7,z,w,1.4,d);
 }
 for(let z=-61;z<=55;z+=8){box('sea-post',39,1,z,1.6,2,1.6,light);solid('sea-post-collider',39,1,z,1.6,2,1.6);}
 // Stable authored collision, independent of generated open seams and thin decorative parts.
 for(const asset of assets){
  const size=asset.bounds.max.subtract(asset.bounds.min),center=asset.bounds.min.add(asset.bounds.max).scale(.5);
  if(asset.kind==='gate'||asset.kind==='arcade'){
   const collisionBounds=asset.kind==='gate'?gateCollisionBounds(asset.bounds):arcadeCollisionBounds(asset.bounds);
   for(const [index,bounds] of collisionBounds.entries()){
    const dimensions=bounds.max.subtract(bounds.min),at=bounds.min.add(bounds.max).scale(.5);
    solid(asset.id+'-collider-'+index,at.x,at.y,at.z,dimensions.x,dimensions.y,dimensions.z);
   }
   // Walls join the outer piers only; the central street remains open.
   if(asset.kind==='gate'){
   const inner=size.x*.46,width=39-inner;
   for(const sign of [-1,1]){
    const x=sign*(39+inner)/2;
    box('gate-wing-wall',x,1.6,center.z,width,3.2,1.2,stone);
    box('gate-wing-coping',x,3.25,center.z,width,.18,1.4,light);
    solid('gate-wing-collider',x,1.65,center.z,width,3.3,1.4);
   }
   }
  }else solid(asset.id+'-collider',center.x,size.y/2,center.z,size.x*.92,size.y,size.z*.92);
  // Overall bounds include roof eaves and porticoes; a visible box here would cover recessed facades.

 }
 // Broad basin is a focal point while leaving a walkable ring around the plaza.
 cylinder('fountain-base',0,.18,24,6.6,.36,light);cylinder('fountain-basin',0,.4,24,5.7,.55,stone);
 const rim=CreateTorus('fountain-rim',{diameter:5.6,thickness:.3,tessellation:48},scene);rim.position.set(0,.75,24);add(rim,light);
 cylinder('fountain-surface',0,.68,24,5.15,.035,water);cylinder('fountain-stem',0,1.3,24,.7,1.5,light);cylinder('fountain-upper-bowl',0,2,24,2.1,.28,light);
 const cap=CreateSphere('fountain-finial',{diameter:.5,segments:16},scene);cap.position.set(0,2.35,24);add(cap,gold);
 solid('fountain-collider',0,.75,24,6.2,1.5,6.2);
 const tree=(x:number,z:number,index:number)=>{
  box('planter',x,.35,z,2.6,.7,2.6,light);box('planter-soil',x,.71,z,2.2,.025,2.2,grass);solid('planter-collider',x,.4,z,2.6,.8,2.6);
  cylinder('tree-trunk',x,2,z,.28,2.7,wood);
  const leaves=createNaturalFoliage(scene,'town-tree-'+index,[{center:[x,4.1,z],radius:[1.5,1.65,1.5],sprays:360},{center:[x+.7,3.9,z+.2],radius:[1.1,1.1,1.1],sprays:160}],418+index);
  pieces.push({mesh:leaves,cast:true});
 };
 [[-7.8,-32],[7.8,-32],[-7.8,-17],[7.8,-17],[-7.8,-2],[7.8,-2],[-10,15],[10,15],[-10,34],[10,34],[30,8],[30,39]].forEach(([x,z],i)=>tree(x,z,i));
 for(const [x,z] of [[-8,-24],[8,-9],[-8,6],[8,12],[-11,30],[27,19.5],[36,-16],[36,8],[36,35]]){
  cylinder('lamp-foot',x,.15,z,.48,.3,stone);cylinder('lamp-pole',x,1.9,z,.12,3.5,gold);box('lamp-cage',x,3.7,z,.45,.6,.45,gold);box('lamp-glass',x,3.7,z,.36,.46,.36,light);
 }
 for(const [x,z] of [[-10,20],[10,30],[34,0],[34,32]]){
  box('bench-seat',x,.52,z,2.6,.15,.65,wood);box('bench-back',x,.96,z+.3,2.6,.8,.12,wood);for(const dx of [-1,1])box('bench-leg',x+dx,.25,z,.15,.5,.5,gold);solid('bench-collider',x,.6,z,2.6,1.2,.7);
 }
 if(options.backdrop!==false)createTownBackdrop(scene);
 if(options.sea!==false)createTownSea(scene);
 const casters:Mesh[]=[],receivers:Mesh[]=[];
 const groups=new Map<string,{parts:Mesh[];cast:boolean}>();
 for(const {mesh,cast} of pieces){const key=mesh.material!.uniqueId+':'+cast;let group=groups.get(key);if(!group){group={parts:[],cast};groups.set(key,group);}group.parts.push(mesh);}
 for(const group of groups.values()){
  const mesh=Mesh.MergeMeshes(group.parts,true,true,undefined,false,false)!;mesh.name='town-static-'+mesh.material!.name;mesh.isPickable=false;mesh.freezeWorldMatrix();receivers.push(mesh);if(group.cast)casters.push(mesh);
 }
 return {casters,receivers,cameraSolids};
}
