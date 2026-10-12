import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {createArch} from '../palace/palaceArchitecture';
import {createStoneTextures,applyStoneUV} from '../palace/palaceStoneSurface';

/** Distant silhouette only. Spatial batches keep culling useful; no physics or dynamic shadows. */
export function createTownSkyline(scene:Scene):Mesh[]{
 const grain=createStoneTextures(scene),batches=new Map<string,Mesh[]>();let district='palace';
 const material=(name:string,hex:string,roughness=.85)=>{const m=new PBRMaterial('skyline-'+name,scene);m.albedoColor=Color3.FromHexString(hex).toLinearSpace();m.roughness=roughness;m.environmentIntensity=.25;return m;};
 const stone=material('ivory','#ddd9cd'),light=material('edges','#eee9da'),slate=material('roofs','#536c85'),glass=material('recesses','#657983'),gold=material('brass','#b5a675',.5),green=material('cypress','#50684b'),rock=material('cliff','#91978c');
 stone.albedoTexture=grain.albedo;stone.bumpTexture=grain.normal;
 const add=(mesh:Mesh,mat=stone)=>{mesh.material=mat;mesh.isPickable=false;applyStoneUV(mesh);if(district==='palace'||district==='viaduct'){mesh.position.z+=119;mesh.position.y-=16;}const key=district+':'+mat.name;const list=batches.get(key)??[];list.push(mesh);batches.set(key,list);return mesh;};
 const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone)=>{const m=CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return add(m,mat);};
 const cone=(name:string,x:number,y:number,z:number,r:number,h:number,mat=slate,top=0)=>{const m=CreateCylinder(name,{diameterBottom:r*2,diameterTop:top,height:h,tessellation:8},scene);m.position.set(x,y,z);return add(m,mat);};
 const arch=(x:number,y:number,z:number,width:number,rise:number,depth:number,thickness=.5)=>{const m=createArch('skyline-arch',{width,rise,depth,thickness,segments:16},scene);m.position.set(x,y,z);return add(m,light);};
 const cypress=(x:number,y:number,z:number,h=8)=>{const m=CreateSphere('skyline-cypress',{diameter:2,segments:8},scene);m.scaling.set(h*.12,h/2,h*.12);m.position.set(x,y+h/2,z);return add(m,green);};
 const roof=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
  const m=new Mesh('skyline-gable',scene),data=new VertexData();
  const p=[-w/2,0,-d/2,w/2,0,-d/2,0,h,-d/2,-w/2,0,d/2,w/2,0,d/2,0,h,d/2];
  const indices=[0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3],normals:number[]=[];
  VertexData.ComputeNormals(p,indices,normals);data.positions=p;data.indices=indices;data.normals=normals;data.applyToMesh(m);m.convertToFlatShadedMesh();const roofNormals=m.getVerticesData("normal")!;for(let i=0;i<roofNormals.length;i++)roofNormals[i]*=-1;m.setVerticesData("normal",roofNormals);slate.backFaceCulling=false;m.position.set(x,y,z);return add(m,slate);
 };
 const recess=(x:number,bottom:number,spring:number,z:number,width:number,rise:number)=>{
  const m=new Mesh('arched-recess',scene),data=new VertexData(),p:number[]=[x,bottom+.1,z,x-width/2,bottom,z,x+width/2,bottom,z],indices:number[]=[],normals:number[]=[];
  for(let i=0;i<=16;i++){const a=i/16*Math.PI;p.push(x+Math.cos(a)*width/2,spring+Math.sin(a)*rise,z);}
  const count=p.length/3;for(let i=1;i<count;i++)indices.push(0,i,i+1<count?i+1:1);
  for(let i=0;i<count;i++)normals.push(0,0,-1);
  data.positions=p;data.indices=indices;data.normals=normals;data.applyToMesh(m);glass.backFaceCulling=false;add(m,glass);
 };
 const windows=(x:number,y:number,z:number,w:number,h:number)=>{
  const count=Math.max(1,Math.floor(w/3.4));
  for(let i=0;i<count;i++){
   const wx=x+(i-(count-1)/2)*3.4;
   recess(wx,y+h*.29,y+h*.77,z-.03,1.1,.7);
   box('window-jamb',wx-.65,y+h*.53,z+.07,.16,h*.5,.25,light);box('window-jamb',wx+.65,y+h*.53,z+.07,.16,h*.5,.25,light);
   arch(wx,y+h*.77,z,1.12,.7,.22,.16);
   box('window-sill',wx,y+h*.28,z,1.65,.17,.4,light);
  }
 };
 const house=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
  box('skyline-house',x,y+h/2,z,w,h,d);box('house-cornice',x,y+h,z,w+.5,.32,d+.5,light);
  roof(x,y+h,z,w+1,h*.45,d+1);windows(x,y,z-d/2-.08,w,h);
  box('house-plinth',x,y+.3,z,w+.3,.6,d+.3,light);
 };
 const tower=(x:number,y:number,z:number,r:number,h:number)=>{
  cone('tower-shaft',x,y+h/2,z,r,h,stone,r*2);
  for(const level of [.1,.57,.88])cone('tower-belt',x,y+h*level,z,r*1.09,.5,light,r*2.18);
  cone('tower-spire',x,y+h+r*1.9,z,r*1.14,r*3.8);
  cone('spire-finial',x,y+h+r*3.8+.7,z,.17,1.4,gold);
  for(const side of [-1,1]){
   box('tower-buttress',x+side*r*.78,y+h*.43,z-r*.8,.5,h*.86,.8,light);
   box('belfry-recess',x+side*r*.36,y+h*.75,z-r*.96,r*.37,h*.22,.16,glass);
  }
 };
 // Cliff fingers interrupt the rectangular podium and connect the city to its headland.
 {
  const m=new Mesh('royal-headland',scene),data=new VertexData(),p:number[]=[],indices:number[]=[],normals:number[]=[];
  const segments=48,rows=5;
  for(let i=0;i<=segments;i++)for(let r=0;r<rows;r++){
   const x=-105+i*3.2,t=r/(rows-1),ripple=Math.sin(i*1.8)*1.1+Math.cos(i*.63)*2;
   p.push(x,-5+t*(20+Math.sin(i*.3)*2),76+t*14+ripple*(1-t*.5));
  }
  for(let i=0;i<segments;i++)for(let r=0;r<rows-1;r++){const a=i*rows+r,b=a+rows;indices.push(a,a+1,b,b,a+1,b+1);}
  VertexData.ComputeNormals(p,indices,normals);data.positions=p;data.indices=indices;data.normals=normals;data.applyToMesh(m);rock.backFaceCulling=false;add(m,rock);
 }
 box('royal-lower-terrace',-30,15,126,122,26,72);
 box('royal-lower-coping',-30,28.2,126,124,.7,74,light);
 box('royal-upper-terrace',-30,32,132,82,8,48);
 box('royal-upper-coping',-30,36.2,132,84,.65,50,light);
 // Recessed retaining arcades: dark bays behind real thick arches.
 for(let x=-84;x<=24;x+=9){
  recess(x,10.5,20,89.05,6,4);
  arch(x,20,89.2,6,4,1,.7);
  for(const side of [-1,1])box('retaining-pier',x+side*3.65,13.5,89.2,.8,20,1.2,light);
  cypress(x,28.6,96,6+(x%3+3));
 }
 house(-30,36.6,134,44,17,24);
 house(-58,36.6,134,12,12,32);house(-2,36.6,134,12,12,32);
 tower(-30,36.6,134,5,43);
 for(const [x,z] of [[-67,113],[7,113],[-67,151],[7,151]])tower(x,36.6,z,2.6,19);
 // Upper front gallery.
 for(let x=-60;x<=0;x+=6){arch(x,40,112,4.7,2.5,3);box('gallery-column',x-2.7,38.3,112,.65,3.4,3,light);}
 box('gallery-entablature',-30,43.25,112,67,.7,4,light);
 for(let x=-84;x<=24;x+=18)tower(x,28.5,94,1.4,8);
 // Long coastal viaduct, with genuine openings visible from the town.
 district='viaduct';
 for(let i=0;i<8;i++){
  const x=44+i*15;
  arch(x,13,114,12.2,10,5,1.1);
  box('viaduct-pier',x-7.5,7,114,2.1,27,5);
  box('viaduct-capital',x-7.5,18,114,3.2,.8,6,light);
 }
 box('viaduct-deck',96.5,25,114,124,1.7,6);
 for(const z of [111,117])box('viaduct-parapet',96.5,26.4,z,124,1.1,.45,light);
 tower(158,26,114,2.5,13);
 // Gardens behind the playable terrace frame its open sea-facing view.
 district='west-garden';
 for(const [x,y,z] of [[-82,6,4],[-82,6,20],[-82,12,52],[-62,6,4]]){
  box('garden-planter',x,y+.35,z,2,.7,2,light);cypress(x,y+.7,z,6);
 }
 const result:Mesh[]=[];
 for(const [name,parts] of batches){const m=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;m.name='town-skyline-'+name;m.isPickable=false;m.freezeWorldMatrix();result.push(m);}
 return result;
}
