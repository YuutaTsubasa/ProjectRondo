import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {TOWN_TERRACES,surfaceHeight,townSurfaceHeight} from '../../domain/town/townTerraces';
import {createArch} from '../palace/palaceArchitecture';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';
import type {TownBounds} from './townAssets';

/** The visible ramps themselves are the collision meshes; no separate guessed ground plane. */
export function createTownTerraces(scene:Scene){
 const pieces:Mesh[]=[],surfaces:Mesh[]=[],cameraSolids:TownBounds[]=[];
 const grain=createStoneTextures(scene);
 const material=(name:string,hex:string)=>{const m=new PBRMaterial('terrace-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();m.roughness=.82;m.environmentIntensity=.22;return m;};
 const stone=material('limestone','#dfd9ca'),trim=material('cornice','#f0e9db'),blue=material('slate','#597084');
 stone.albedoTexture=grain.albedo;stone.bumpTexture=grain.normal;
 const add=(m:Mesh,mat=stone)=>{m.material=mat;m.isPickable=false;applyStoneUV(m);pieces.push(m);return m;};
 const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone)=>{const m=CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return add(m,mat);};
 const rail=(x:number,z:number,y:number,w:number,d:number)=>{
  box('terrace-parapet',x,y+.5,z,w,1,d);box('terrace-coping',x,y+1.06,z,w+.06,.12,d+.12,trim);
  const body=CreateBox('terrace-rail-collider',{width:w,height:1.15,depth:d},scene);body.position.set(x,y+.575,z);body.isVisible=false;body.isPickable=false;
  new PhysicsAggregate(body,PhysicsShapeType.BOX,{mass:0,friction:.8},scene);
  cameraSolids.push({min:new Vector3(x-w/2,y,z-d/2),max:new Vector3(x+w/2,y+1.15,z+d/2)});
 };
 for(const s of TOWN_TERRACES){
  const w=s.maxX-s.minX,d=s.maxZ-s.minZ,cx=(s.minX+s.maxX)/2,cz=(s.minZ+s.maxZ)/2;
  const mesh=CreateBox('terrace-support-'+s.id,{width:w,height:1,depth:d},scene);
  const p=Array.from(mesh.getVerticesData('position')!);
  for(let i=0;i<p.length;i+=3){p[i]+=cx;p[i+2]+=cz;const top=surfaceHeight(s,p[i],p[i+2]);p[i+1]=p[i+1]>0?top:(s.id==='sky-arcade'?top-.65:-2);}
  const normals:number[]=[];VertexData.ComputeNormals(p,mesh.getIndices()!,normals);
  mesh.setVerticesData('position',p);mesh.setVerticesData('normal',normals);mesh.refreshBoundingInfo();
  mesh.material=stone;mesh.isPickable=false;
  mesh.setVerticesData("uv",p.flatMap((_,i)=>i%3===0?[p[i]/1.5,p[i+2]/1.5]:[]));
  new PhysicsAggregate(mesh,PhysicsShapeType.MESH,{mass:0,friction:.8},scene);surfaces.push(mesh);
  // Camera booms need the bodies too, especially the open underside of the bridge.
  // Short ramp slices conservatively follow the incline without sealing the path above it.
  const count=s.fromY===s.toY?1:12;
  for(let i=0;i<count;i++){
   const x0=s.axis==='x'?s.minX+w*i/count:s.minX,x1=s.axis==='x'?s.minX+w*(i+1)/count:s.maxX;
   const z0=s.axis==='z'?s.minZ+d*i/count:s.minZ,z1=s.axis==='z'?s.minZ+d*(i+1)/count:s.maxZ;
   const top=Math.max(surfaceHeight(s,x0,z0),surfaceHeight(s,x1,z1));
   cameraSolids.push({min:new Vector3(x0,s.id==='sky-arcade'?top-.65:-2,z0),max:new Vector3(x1,top,z1)});
  }
  // Only exposed boundary pieces receive parapets. Shared endpoints remain open.
  for(const horizontal of [true,false])for(const sign of [-1,1]){
   const lo=horizontal?s.minX:s.minZ,hi=horizontal?s.maxX:s.maxZ,n=Math.ceil((hi-lo)/2),length=(hi-lo)/n;
   for(let i=0;i<n;i++){
    const a=lo+(i+.5)*length,x=horizontal?a:(sign<0?s.minX:s.maxX),z=horizontal?(sign<0?s.minZ:s.maxZ):a;
    const y=surfaceHeight(s,x,z),outside=townSurfaceHeight(x+(horizontal?0:sign*.1),z+(horizontal?sign*.1:0));
    if(outside!==null&&Math.abs(outside-y)<.3)continue;
    rail(x,z,y,horizontal?length+.02:.35,horizontal?.35:length+.02);
   }
  }
  if(s.fromY!==s.toY){
   // Sloped central paving is readable; masonry steps flank it, outside the rails.
   const alongX=s.axis==='x',count=48;
   for(let i=0;i<count;i++){
    const t=(i+.5)/count,x=alongX?s.minX+w*t:cx,z=alongX?cz:s.minZ+d*t,y=surfaceHeight(s,x,z);
    const seam=box('ascent-paving-joint',x,y+.006,z,alongX?.018:w-.5,.012,alongX?d-.5:.018,blue);
    if(alongX)seam.rotation.z=Math.atan2(s.toY-s.fromY,w);else seam.rotation.x=-Math.atan2(s.toY-s.fromY,d);
    for(const side of [-1,1])box('ascent-flanking-step',alongX?x:cx+side*(w/2+.35),y/2-1,alongX?cz+side*(d/2+.35):z,alongX?w/count:.7,y+2,alongX?.7:d/count,trim);
   }
  }else{
   for(let x=s.minX+2;x<s.maxX;x+=3)box('terrace-paving-line',x,s.fromY+.008,cz,.022,.012,d-.5,blue);
   for(let z=s.minZ+2;z<s.maxZ;z+=3)box('terrace-paving-line',cx,s.fromY+.009,z,w-.5,.012,.022,blue);
  }
 }
 // The open arch under the overlook provides depth when seen from the old square.
 const arch=createArch('overlook-bridge-arch',{width:15,rise:5.5,thickness:.75,depth:7,segments:24},scene);arch.position.set(-51,5,52);add(arch,trim);
 for(const x of [-59.3,-42.7]){box('overlook-bridge-pier',x,2,52,1.4,6,7);box('overlook-pier-foot',x,-.6,52,2.2,.8,8,trim);}
 for(const [z,x0,x1,y] of [[2,-82,-58,6],[46,-82,-62,12]])for(let x=x0;x<=x1;x+=5){
  box('terrace-buttress',x,(y-2)/2,z-.35,.65,y+2,1.1,trim);
  box('terrace-buttress-cap',x,y-.3,z-.4,1,.5,1.4,trim);
 }
 const receivers=[...surfaces];
 for(const mat of [stone,trim,blue]){
  const group=pieces.filter(m=>m.material===mat);if(!group.length)continue;
  const merged=Mesh.MergeMeshes(group,true,true,undefined,false,false)!;merged.name='terrace-detail-'+mat.name;merged.isPickable=false;merged.freezeWorldMatrix();receivers.push(merged);
 }
 return {receivers,casters:receivers,cameraSolids};
}
