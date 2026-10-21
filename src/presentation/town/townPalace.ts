import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {createArch,createColumn,createBeveledBox,createDome} from '../palace/palaceArchitecture';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';
import {PALACE_FLOOR_Y as floor} from '../../domain/town/townPalace';
import type {TownBounds} from './townAssets';

/** Public palace architecture. Floors and exposed-edge rails belong to the shared town terraces. */
export function createTownPalace(scene:Scene){
 const batches=new Map<string,Mesh[]>(),cameraSolids:TownBounds[]=[];let zone='court';
 const grain=createStoneTextures(scene);
 const material=(name:string,hex:string,roughness=.78)=>{
  const m=new PBRMaterial('palace-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();
  m.roughness=roughness;m.metallic=0;m.environmentIntensity=.35;return m;
 };
 const stone=material('white-limestone','#e7e2d5'),ivory=material('carved-ivory','#faf2df'),slate=material('blue-slate','#4a6985'),inlay=material('blue-marble','#7d9fa8'),brass=material('warm-brass','#b89c60',.35),water=material('reflecting-water','#69a6af',.25);
 stone.albedoTexture=grain.albedo;stone.bumpTexture=grain.normal;
 // A small baked bounce term keeps white stone readable beneath the roof without extra lights.
 stone.emissiveColor=new Color3(.025,.026,.025);ivory.emissiveColor=new Color3(.03,.029,.025);brass.metallic=.65;
 const add=(mesh:Mesh,mat:PBRMaterial=stone)=>{
  mesh.material=mat;mesh.isPickable=false;if(mat===stone)applyStoneUV(mesh);
  else if(!mesh.isVerticesDataPresent('uv'))mesh.setVerticesData('uv',new Float32Array(mesh.getTotalVertices()*2));
  const key=zone+':'+mat.name,group=batches.get(key)??[];group.push(mesh);batches.set(key,group);return mesh;
 };
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone)=>{
  const m=createBeveledBox('palace-'+id,{width:w,height:h,depth:d,bevel:Math.min(.08,h*.15)},scene);m.position.set(x,y,z);return add(m,mat);
 };
 const bounds=(x:number,y:number,z:number,w:number,h:number,d:number)=>({min:new Vector3(x-w/2,y-h/2,z-d/2),max:new Vector3(x+w/2,y+h/2,z+d/2)});
 const solid=(id:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const m=CreateBox('palace-body-'+id,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.isVisible=false;m.isPickable=false;
  new PhysicsAggregate(m,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);cameraSolids.push(bounds(x,y,z,w,h,d));
 };
 const masonry=(id:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone)=>{box(id,x,y,z,w,h,d,mat);solid(id,x,y,z,w,h,d);};
 const meshBody=(mesh:Mesh)=>{
  const body=mesh.clone(mesh.name+'-body',null)!;body.isVisible=false;body.isPickable=false;
  new PhysicsAggregate(body,PhysicsShapeType.MESH,{mass:0,friction:.8},scene);
 };
 const arch=(id:string,x:number,spring:number,z:number,width:number,rise:number,depth=1,turn=false,thickness=.65)=>{
  const m=createArch('palace-arch-'+id,{width,rise,depth,thickness,segments:24},scene);m.position.set(x,spring,z);if(turn)m.rotation.y=Math.PI/2;
  meshBody(m);add(m,ivory);
  // Small bounds follow the ring, preserving the opening for a shoulder-height camera.
  for(let i=0;i<16;i++){
   const points=[i*Math.PI/16,(i+1)*Math.PI/16].flatMap(a=>[[Math.cos(a)*width/2,Math.sin(a)*rise],[Math.cos(a)*(width/2+thickness),Math.sin(a)*(rise+thickness)]]);
   const lo=Math.min(...points.map(p=>p[0])),hi=Math.max(...points.map(p=>p[0])),bottom=Math.min(...points.map(p=>p[1])),top=Math.max(...points.map(p=>p[1]));
   cameraSolids.push(turn?bounds(x,spring+(bottom+top)/2,z+(lo+hi)/2,depth,top-bottom,hi-lo):bounds(x+(lo+hi)/2,spring+(bottom+top)/2,z,hi-lo,top-bottom,depth));
  }
 };
 const column=(id:string,x:number,z:number,h:number,r=.62)=>{
  const m=createColumn('palace-column-'+id,{height:h,radius:r},scene);m.position.set(x,floor,z);meshBody(m);add(m,ivory);
  cameraSolids.push(bounds(x,floor+h/2,z,r*2.9,h,r*2.9));
 };
 const sill=(id:string,x:number,z:number,w:number,d:number)=>{
  masonry(id,x,floor+.55,z,w,1.1,d);box(id+'-coping',x,floor+1.14,z,w+.12,.18,d+.12,ivory);
 };
 // Two low reflecting basins flank a broad ceremonial path, never interrupting its axis.
 for(const x of [-30,10]){
  const basin=CreateCylinder('palace-court-basin',{diameter:7,height:.45,tessellation:32},scene);basin.position.set(x,floor+.225,222);add(basin,ivory);
  const surface=CreateCylinder('palace-court-water',{diameter:6.35,height:.025,tessellation:32},scene);surface.position.set(x,floor+.46,222);add(surface,water);
  const rim=CreateTorus('palace-court-rim',{diameter:6.7,thickness:.28,tessellation:40},scene);rim.position.set(x,floor+.5,222);add(rim,ivory);
  solid('reflecting-basin',x,floor+.3,222,7,.6,7);
 }
 for(const x of [-16.5,-3.5])box('court-processional-inlay',x,floor+.018,219,.16,.025,20,inlay);

 zone='hall';
 // Front and rear facades: three true arched bays, with the middle bay open to walk through.
 for(const z of [229,277]){
  for(const x of [-37,-19,-1,17]){
   masonry('facade-pier',x,20,z,2,16,2);
   box('facade-pilaster',x,20,z-1.05,.75,16,.4,ivory);
  }
  for(const x of [-28,8]){sill('facade-window-sill',x,z,16,1.4);arch('facade-window',x,20,z,16,5,1.4);}
  for(const x of [-17,-3])masonry('portal-pier',x,16,z,2,8,2.2);
  arch('public-portal',-10,20,z,12,5,2.2);
  masonry('facade-entablature',-10,26.8,z,56,2.4,2.2);
  box('facade-cornice',-10,28.15,z,57,.45,2.8,ivory);
  // Stepped gable and a carved sun medallion identify the public doorway from the forecourt.
  box('portal-pediment',-10,29.1,z,17,1.5,2.5,ivory);
  box('portal-crown',-10,30.1,z,11,.7,2.7,ivory);
  const sun=CreateTorus('palace-sun-medallion',{diameter:2.7,thickness:.22,tessellation:32},scene);sun.rotation.x=Math.PI/2;sun.position.set(-10,26.6,z+(z===229?-1.2:1.2));add(sun,brass);
 }
 // Tall side windows are actual openings to daylight. Two east bays are public side doors.
 for(const x of [-38,18]){
  for(const z of [229,241,253,265,277])masonry('window-pier',x,19,z,1.5,14,2);
  for(const z of [235,247,259,271]){
   arch('side-window',x,20,z,10,4,1.5,true);
   if(x===-38||z===247||z===259)sill('side-window-sill',x,z,1.5,10);
  }
  masonry('side-cornice',x,25,253,1.8,2,48);
  box('side-cornice-trim',x,26.15,253,2.1,.3,49,ivory);
 }
 // Processional nave and its two aisles. Columns are profiled stone, not square pillars.
 for(const z of [237,251,265]){
  for(const x of [-26,6])column('nave',x,z,10.6,.7);
  arch('nave-rib',-10,22.6,z,30,5.2,.65,false,.55);
  for(const x of [-26,6]){
   const collar=CreateTorus('palace-column-brass-collar',{diameter:1.62,thickness:.07,tessellation:24},scene);
   collar.position.set(x,21.45,z);add(collar,brass);
  }
 }
 // Blue standards and restrained brass edges mark the public hall without obscuring its windows.
 for(const x of [-37.12,17.12])for(const z of [241,265]){
  box('nave-standard',x,20.1,z,.08,4.2,1.45,slate);
  box('standard-top',x,22.22,z,.12,.12,1.7,brass);
  box('standard-hem',x,18.05,z,.12,.12,1.45,brass);
 }
 for(const z of [229,277])box('facade-brass-line',-10,25.75,z+(z===229?1.15:-1.15),55,.08,.08,brass);
 // A raised nave roof leaves two continuous clearstory slots above the side aisles.
 for(const x of [-33,13])masonry('aisle-roof',x,26.5,253,10,.55,49,slate);
 for(const side of [-1,1]){
  const panel=box('nave-roof',-10+side*8,30.8,253,Math.hypot(16,4),.5,50,slate);panel.rotation.z=-side*Math.atan2(4,16);meshBody(panel);
  // Conservative roof bounds stop high orbit angles; ordinary booms stay well below them.
  cameraSolids.push(bounds(-10+side*8,30.8,253,16.3,4.6,50));
 }
 box('nave-ridge',-10,33,253,.6,.5,51,ivory);
 for(const x of [-16, -4])box('nave-marble-border',x,floor+.018,253,.22,.025,48,inlay);
 for(const z of [239,253,267]){
  const medallion=CreateCylinder('palace-floor-medallion',{diameter:5,height:.024,tessellation:12},scene);medallion.position.set(-10,floor+.025,z);add(medallion,inlay);
  const ring=CreateTorus('palace-floor-ring',{diameter:5.3,thickness:.065,tessellation:40},scene);ring.position.set(-10,floor+.043,z);add(ring,brass);
 }
 // Small roof lanterns give the facade an articulated silhouette without blocking the court.
 for(const x of [-37,17]){
  const drum=CreateCylinder('palace-lantern-drum',{diameter:4,height:3,tessellation:16},scene);drum.position.set(x,29.7,229);add(drum,ivory);
  const dome=createDome('palace-lantern-dome',{radius:2.35,height:3,segments:24},scene);dome.position.set(x,31.2,229);add(dome,slate);
  box('lantern-finial',x,34.7,229,.15,1,.15,brass);
 }

 zone='cloister';
 for(const z of [229,241,253,265,277]){
  for(const x of [20,38])column('sea-gallery',x,z,8,.55);
  arch('sea-gallery',29,20,z,16.4,3,1);
 }
 // The outside arcade frames the sea at eye level; its only low barrier is the terrace parapet.
 for(const z of [235,247,259,271])arch('sea-view',38,20,z,10.4,3,.8,true);
 masonry('cloister-roof',29,24.3,253,22,.6,49,slate);
 for(const x of [19,39])box('gallery-roof-coping',x,24.72,253,.4,.25,50,ivory);
 for(const x of [24,34])box('cloister-paving-border',x,floor+.018,253,.12,.025,48,inlay);
 // Quiet north terrace: seats face east; the central and eastern return lanes remain open.
 for(const x of [-33,8]){
  masonry('view-bench',x,floor+.45,286,3,.9,.7,ivory);
  box('view-bench-back',x,floor+.95,286.25,3,.8,.18,stone);
 }
 const receivers:Mesh[]=[];
 for(const [key,parts] of batches){
  const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;mesh.name='palace-public-'+key;mesh.isPickable=false;mesh.freezeWorldMatrix();receivers.push(mesh);
 }
 return {receivers,casters:receivers,cameraSolids};
}
