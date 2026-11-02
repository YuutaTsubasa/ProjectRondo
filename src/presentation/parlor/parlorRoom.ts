import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreatePlane} from '@babylonjs/core/Meshes/Builders/planeBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {PointLight} from '@babylonjs/core/Lights/pointLight';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';
import {drawSign} from './parlorSign';
import type {TownBounds} from '../town/townAssets';
import {PARLOR_ROOM,PARLOR_TABLES,PARLOR_TABLE_SIZE,PARLOR_HOST,PARLOR_NAME,parlorChairs} from '../../domain/town/mahjongParlor';

const TABLE_TOP=.76,TILE={w:.028,h:.038,d:.021};
const DOOR_WIDTH=1.6,DOOR_HEIGHT=2.7;

/** Deterministic, so the parlor looks the same on every visit. */
function random(seed:number){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

export interface ParlorRoom {readonly casters:Mesh[];readonly receivers:Mesh[];readonly cameraSolids:TownBounds[]}

/** Code-authored interior of the converted townhouse: ivory stone walls, timber floor and four tables. */
export async function createParlorRoom(scene:Scene):Promise<ParlorRoom>{
 const pieces:{mesh:Mesh;cast:boolean}[]=[];const cameraSolids:TownBounds[]=[];
 const grain=createStoneTextures(scene);
 const material=(name:string,hex:string,roughness=.8,metallic=0)=>{const m=new PBRMaterial('parlor-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();m.roughness=roughness;m.metallic=metallic;m.environmentIntensity=.2;return m;};
 const stone=material('ivory','#d8d0bf'),trim=material('cut-stone','#ece6d8'),wood=material('wood','#7a5a3a',.6),darkWood=material('dark-wood','#4b3524',.55),felt=material('felt','#2f6b4f',.95),
  bronze=material('bronze','#a68b58',.4,.7),tile=material('tile','#f1ead8',.35),tileBack=material('tile-back','#3f8f6a',.4),cushion=material('cushion','#35604c',.9),
  lacquer=material('lacquer','#a8322d',.5),porcelain=material('porcelain','#f4f6f8',.3);
 for(const m of [stone,trim]){m.albedoTexture=grain.albedo;m.bumpTexture=grain.normal;}
 const glow=(name:string,hex:string,intensity=1)=>{const m=material(name,hex);m.emissiveColor=Color3.FromHexString(hex).toLinearSpace().scale(intensity);m.disableLighting=true;return m;};
 const windowGlass=glow('window','#cfe8f5',.9),doorLight=glow('doorway','#f3f0e4',1.1),lanternGlow=glow('lantern','#e0573f',.85);
 const add=(mesh:Mesh,mat:PBRMaterial,cast=true)=>{mesh.material=mat;mesh.isPickable=false;if(mat===stone||mat===trim)applyStoneUV(mesh);pieces.push({mesh,cast});return mesh;};
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:PBRMaterial,cast=true,yaw=0)=>{const m=CreateBox(id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.rotation.y=yaw;return add(m,mat,cast);};
 const cylinder=(id:string,x:number,y:number,z:number,d:number,h:number,mat:PBRMaterial,cast=true)=>{const m=CreateCylinder(id,{height:h,diameter:d,tessellation:20},scene);m.position.set(x,y,z);return add(m,mat,cast);};
 const solid=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,camera=true)=>{
  const mesh=CreateBox(id,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.isVisible=false;mesh.isPickable=false;
  new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);
  if(camera)cameraSolids.push({min:new Vector3(x-w/2,y-h/2,z-d/2),max:new Vector3(x+w/2,y+h/2,z+d/2)});
 };
 const {minX,maxX,minZ,maxZ,height}=PARLOR_ROOM,width=maxX-minX,depth=maxZ-minZ,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,wall=.3;

 // Shell. Walls and ceiling stay out of the shadow pass so the "sun" only grounds the furniture.
 solid('parlor-floor-collider',cx,-.5,cz,width+2,1,depth+2,false);
 box('parlor-floor',cx,-.02,cz,width,.04,depth,wood,false);
 for(let x=minX+.4;x<maxX;x+=.8)box('parlor-floor-seam',x,.001,cz,.012,.004,depth,darkWood,false);
 for(const [x,z,w,d] of [[cx,maxZ+wall/2,width+2*wall,wall],[minX-wall/2,cz,wall,depth],[maxX+wall/2,cz,wall,depth]] as const){
  box('parlor-wall',x,height/2,z,w,height,d,stone,false);solid('parlor-wall-collider',x,height/2,z,w+.2,height+2,d+.2);
 }
 const side=(width-DOOR_WIDTH)/2;
 for(const sign of [-1,1]){
  const x=sign*(DOOR_WIDTH/2+side/2);box('parlor-front-wall',x,height/2,minZ-wall/2,side,height,wall,stone,false);solid('parlor-front-collider',x,height/2,minZ-wall/2,side,height+2,wall+.2);
 }
 box('parlor-lintel',0,(height+DOOR_HEIGHT)/2,minZ-wall/2,DOOR_WIDTH,height-DOOR_HEIGHT,wall,stone,false);
 solid('parlor-door-collider',0,height/2,minZ-wall-.4,DOOR_WIDTH+.4,height+2,.6);
 box('parlor-doorway',0,DOOR_HEIGHT/2,minZ-wall+.02,DOOR_WIDTH,DOOR_HEIGHT,.02,doorLight,false);
 for(const sign of [-1,1])box('parlor-door-frame',sign*(DOOR_WIDTH/2+.06),DOOR_HEIGHT/2,minZ+.02,.12,DOOR_HEIGHT,.08,darkWood,false);
 box('parlor-door-head',0,DOOR_HEIGHT+.06,minZ+.02,DOOR_WIDTH+.24,.12,.08,darkWood,false);
 box('parlor-ceiling',cx,height+.1,cz,width+2*wall,.2,depth+2*wall,trim,false);
 solid('parlor-ceiling-collider',cx,height+.6,cz,width+2,1,depth+2);
 for(let z=minZ+1.25;z<maxZ;z+=2.5)box('parlor-beam',cx,height-.12,z,width,.24,.28,darkWood,false);
 // Wainscot, skirting and cornice keep the plain stone walls from reading as a box.
 for(const [x,z,w,d] of [[cx,maxZ-.02,width,.04],[minX+.02,cz,.04,depth],[maxX-.02,cz,.04,depth],[-(DOOR_WIDTH/2+side/2),minZ+.02,side,.04],[DOOR_WIDTH/2+side/2,minZ+.02,side,.04]] as const){
  box('parlor-wainscot',x,.5,z,w,1,d,wood,false);box('parlor-rail',x,1.02,z,w+.02,.05,d+.03,darkWood,false);box('parlor-cornice',x,height-.04,z,w,.08,d+.04,trim,false);
 }
 // Side windows: bright panes with mullions, as if the street and sea light came through.
 for(const sign of [-1,1])for(const z of [-2.4,1.2]){
  const x=sign*(maxX-.03);
  box('parlor-window',x,2.15,z,.02,1.5,1.3,windowGlass,false);
  box('parlor-window-frame',x,2.15,z,.08,1.62,.08,darkWood,false);box('parlor-window-frame',x,2.15,z,.08,.08,1.42,darkWood,false);
  for(const dy of [-.79,.79])box('parlor-window-sill',x,2.15+dy,z,.14,.08,1.42,trim,false);
 }

 // Tables: green felt, raised timber rim, chip drawers and bronze-shod legs.
 const half=PARLOR_TABLE_SIZE/2;
 for(const table of PARLOR_TABLES){
  const {x,z}=table;
  box('table-felt',x,TABLE_TOP,z,PARLOR_TABLE_SIZE-.08,.03,PARLOR_TABLE_SIZE-.08,felt);
  box('table-body',x,TABLE_TOP-.06,z,PARLOR_TABLE_SIZE,.1,PARLOR_TABLE_SIZE,wood);
  for(const [dx,dz,w,d] of [[0,half-.03,PARLOR_TABLE_SIZE,.06],[0,-half+.03,PARLOR_TABLE_SIZE,.06],[half-.03,0,.06,PARLOR_TABLE_SIZE-.12],[-half+.03,0,.06,PARLOR_TABLE_SIZE-.12]] as const)
   box('table-rim',x+dx,TABLE_TOP+.025,z+dz,w,.04,d,darkWood);
  for(const [dx,dz,w,d] of [[0,half+.01,.3,.02],[0,-half-.01,.3,.02],[half+.01,0,.02,.3],[-half-.01,0,.02,.3]] as const)box('table-drawer-pull',x+dx,TABLE_TOP-.07,z+dz,w,.03,d,bronze);
  for(const dx of [-1,1])for(const dz of [-1,1]){
   box('table-leg',x+dx*(half-.08),(TABLE_TOP-.1)/2,z+dz*(half-.08),.09,TABLE_TOP-.1,.09,darkWood);
   box('table-foot',x+dx*(half-.08),.04,z+dz*(half-.08),.11,.08,.11,bronze);
  }
  solid('table-collider',x,.5,z,PARLOR_TABLE_SIZE+.05,1,PARLOR_TABLE_SIZE+.05);
 }
 // Chairs face their table.
 for(const chair of parlorChairs()){
  const forward=new Vector3(Math.sin(chair.yaw),0,Math.cos(chair.yaw));
  const at=(along:number,y:number)=>new Vector3(chair.x-forward.x*along,y,chair.z-forward.z*along);
  const seat=at(0,.46);box('chair-seat',seat.x,seat.y,seat.z,.46,.06,.44,darkWood,true,chair.yaw);
  // Chairs are axis-aligned; one box covers seat and back for the player and the camera.
  const footprint=at(.05,.55),across=Math.abs(forward.x)>.5;solid('chair-collider',footprint.x,footprint.y,footprint.z,across?.55:.5,1.1,across?.5:.55);
  const pad=at(0,.5);box('chair-cushion',pad.x,pad.y,pad.z,.4,.04,.38,cushion,true,chair.yaw);
  const back=at(.21,.78);box('chair-back',back.x,back.y,back.z,.44,.5,.05,darkWood,true,chair.yaw);
  const crest=at(.21,1.04);box('chair-crest',crest.x,crest.y,crest.z,.46,.04,.06,bronze,true,chair.yaw);
  for(const dx of [-.19,.19])for(const along of [-.18,.18]){
   const right=new Vector3(forward.z,0,-forward.x),p=at(along,.215).add(right.scale(dx));
   box('chair-leg',p.x,p.y,p.z,.045,.43,.045,darkWood);
  }
 }

 // Tiles: thin instances of one ivory-faced, green-backed tile. Walls of 17 pairs, hands and discards.
 const tileFace=CreateBox('parlor-tile',{width:TILE.w,height:TILE.h*.72,depth:TILE.d},scene);tileFace.material=tile;tileFace.isPickable=false;
 const tileBackMesh=CreateBox('parlor-tile-back',{width:TILE.w,height:TILE.h*.28,depth:TILE.d},scene);tileBackMesh.material=tileBack;tileBackMesh.isPickable=false;
 const faces:Matrix[]=[],backs:Matrix[]=[];
 // Standing: face part above, green back below. Lying face-down shows the green back on top.
 const place=(x:number,y:number,z:number,yaw:number,pose:'standing'|'down'|'up')=>{
  const q=pose==='standing'?Quaternion.RotationYawPitchRoll(yaw,0,0):Quaternion.RotationYawPitchRoll(yaw,pose==='down'?Math.PI/2:-Math.PI/2,0);
  const up=Vector3.Up().applyRotationQuaternion(q);
  const base=new Vector3(x,y+(pose==='standing'?TILE.h/2:TILE.d/2),z);
  faces.push(Matrix.Compose(Vector3.One(),q,base.add(up.scale(TILE.h*.14))));
  backs.push(Matrix.Compose(Vector3.One(),q,base.add(up.scale(-TILE.h*.36))));
 };
 PARLOR_TABLES.forEach((table,index)=>{
  const roll=random(31+index*17),played=table.id===PARLOR_HOST.tableId||index===1;
  for(const [dx,dz,yaw] of [[0,-1,0],[1,0,Math.PI/2],[0,1,Math.PI],[-1,0,-Math.PI/2]] as const){
   const right=new Vector3(-dz,0,dx);
   const remaining=played?Math.floor(6+roll()*9):17;
   // Walls lie face-down two high, a hand's width in from the rim.
   for(let i=0;i<remaining;i++){
    const offset=(i-8)*TILE.w;
    for(const layer of [0,1])place(table.x+dx*.3+right.x*offset,TABLE_TOP+.015+layer*TILE.d,table.z+dz*.3+right.z*offset,yaw,'down');
   }
   if(!played||table.id===PARLOR_HOST.tableId&&dx<0)continue;
   for(let i=0;i<16;i++){const offset=(i-7.5)*TILE.w;place(table.x+dx*.42+right.x*offset,TABLE_TOP+.015,table.z+dz*.42+right.z*offset,yaw+Math.PI,'standing');}
  }
  if(!played)return;
  for(let i=0;i<22;i++){
   const row=Math.floor(i/6),column=i%6,quarter=i%4,qx=[0,1,0,-1][quarter],qz=[-1,0,1,0][quarter];
   place(table.x+qx*(.12+row*.03)+(column-2.5)*.03*qz+(roll()-.5)*.01,TABLE_TOP+.015,table.z+qz*(.12+row*.03)-(column-2.5)*.03*qx+(roll()-.5)*.01,quarter*Math.PI/2+(roll()-.5)*.15,'up');
  }
 });
 const pack=(mesh:Mesh,matrices:Matrix[])=>{const buffer=new Float32Array(matrices.length*16);matrices.forEach((m,i)=>m.copyToArray(buffer,i*16));mesh.thinInstanceSetBuffer('matrix',buffer,16,true);};
 pack(tileFace,faces);pack(tileBackMesh,backs);
 // Dice and a bronze wind indicator on the host table.
 const host=PARLOR_TABLES.find(t=>t.id===PARLOR_HOST.tableId)!;
 for(const [dx,dz] of [[.05,.02],[-.02,.06],[.01,-.04]])box('table-die',host.x+dx,TABLE_TOP+.025,host.z+dz,.016,.016,.016,porcelain,true,dx*9);
 cylinder('wind-indicator',host.x,TABLE_TOP+.03,host.z-.05,.07,.03,bronze);

 // Back wall: tea cabinet, the parlor plaque and a pair of lanterns.
 box('tea-cabinet',0,.5,maxZ-.35,2.4,1,.6,darkWood);box('tea-cabinet-top',0,1.02,maxZ-.35,2.5,.05,.66,wood);solid('tea-cabinet-collider',0,.6,maxZ-.35,2.5,1.2,.7);
 cylinder('teapot',-.5,1.13,maxZ-.35,.18,.16,porcelain);const lid=CreateSphere('teapot-lid',{diameter:.1,segments:10},scene);lid.position.set(-.5,1.22,maxZ-.35);add(lid,porcelain);
 for(const dx of [-.15,0,.15,.3])cylinder('teacup',dx,1.075,maxZ-.25,.06,.05,porcelain);
 cylinder('tile-case',.75,1.1,maxZ-.38,.32,.12,lacquer);
 const plaqueTexture=await drawSign(scene,'parlor-plaque',[PARLOR_NAME,'MAHJONG PARLOR · 十六張'],1024,320);
 const plaqueMat=material('plaque','#ffffff',.7);plaqueMat.albedoTexture=plaqueTexture;
 const plaque=CreatePlane('parlor-plaque',{width:2.6,height:.81,sideOrientation:Mesh.BACKSIDE},scene);plaque.position.set(0,2.75,maxZ-.06);plaque.rotation.y=Math.PI;add(plaque,plaqueMat,false);
 box('parlor-plaque-frame',0,2.75,maxZ-.03,2.78,.97,.04,darkWood,false);
 for(const x of [-2.2,2.2]){
  box('lantern-cord',x,3.85,maxZ-.6,.02,.7,.02,darkWood,false);
  const lantern=CreateSphere('lantern',{diameterX:.42,diameterY:.52,diameterZ:.42,segments:14},scene);lantern.position.set(x,3.3,maxZ-.6);add(lantern,lanternGlow,false);
  for(const dy of [-.27,.27])cylinder('lantern-cap',x,3.3+dy,maxZ-.6,.22,.05,bronze,false);
 }
 // Two warm fills keep the room readable without per-table lights.
 for(const [x,z] of [[0,-1.2],[0,3]]){const light=new PointLight('parlor-lamp',new Vector3(x,3.5,z),scene);light.diffuse=Color3.FromHexString('#ffd9a8');light.intensity=8;light.range=11;}
 for(const [x,z] of [[-3,-.6],[3,-.6],[-3,2.8],[3,2.8]]){
  box('pendant-cord',x,3.75,z,.015,.7,.015,darkWood,false);
  const shade=CreateCylinder('pendant-shade',{height:.22,diameterTop:.18,diameterBottom:.55,tessellation:20},scene);shade.position.set(x,3.32,z);add(shade,bronze,false);
  const bulb=CreateSphere('pendant-bulb',{diameter:.14,segments:8},scene);bulb.position.set(x,3.2,z);add(bulb,glow('bulb','#fff1d6',1.2),false);
 }
 // Potted plants in the front corners.
 for(const x of [minX+.6,maxX-.6]){
  cylinder('plant-pot',x,.25,minZ+.6,.5,.5,porcelain);
  const leaves=CreateSphere('plant-leaves',{diameterX:.8,diameterY:1.1,diameterZ:.8,segments:10},scene);leaves.position.set(x,1.05,minZ+.6);add(leaves,material('leaves','#4d6b3b',.9));
  solid('plant-collider',x,.6,minZ+.6,.6,1.2,.6);
 }

 const casters:Mesh[]=[tileFace,tileBackMesh],receivers:Mesh[]=[tileFace,tileBackMesh];
 const groups=new Map<string,{parts:Mesh[];cast:boolean}>();
 for(const {mesh,cast} of pieces){const key=mesh.material!.uniqueId+':'+cast;let group=groups.get(key);if(!group){group={parts:[],cast};groups.set(key,group);}group.parts.push(mesh);}
 for(const group of groups.values()){
  const mesh=Mesh.MergeMeshes(group.parts,true,true,undefined,false,false)!;mesh.name='parlor-static-'+mesh.material!.name;mesh.isPickable=false;mesh.freezeWorldMatrix();receivers.push(mesh);if(group.cast)casters.push(mesh);
 }
 return {casters,receivers,cameraSolids};
}
