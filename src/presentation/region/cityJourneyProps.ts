import type {Scene} from '@babylonjs/core/scene';
import type {Material} from '@babylonjs/core/Materials/material';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {CITY_STOPS} from '../../domain/region/cityJourney';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../domain/region/regionLayout';
import {applyStoneUV} from '../palace/palaceStoneSurface';

export interface CityJourneyPropMaterials {
 wood:Material;ivory:Material;stone:Material;metal:Material;blue:Material;gold:Material;
}
/** Small story objects beside the existing beacons. One frozen batch per material and stop;
 * no new lights, materials, physics bodies or camera blockers. */
export function createCityJourneyProps(scene:Scene,materials:CityJourneyPropMaterials):{meshes:Mesh[]}{
 const meshes:Mesh[]=[];
 for(const stop of CITY_STOPS){
  const anchor=REGION_INTERACTION_PLACES.find(p=>p.id===stop.id)!;
  const floor=regionHeight(anchor.x,anchor.z);
  const groups=new Map<Material,{parts:Mesh[];names:string[]}>();
  const add=(mesh:Mesh,name:string,x:number,y:number,z:number,mat:Material)=>{
   mesh.position.set(anchor.x+x,floor+y,anchor.z+z);mesh.material=mat;mesh.isPickable=false;
   const group=groups.get(mat)??{parts:[],names:[]};group.parts.push(mesh);group.names.push(name);groups.set(mat,group);return mesh;
  };
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:Material)=>add(CreateBox(name,{width:w,height:h,depth:d},scene),name,x,y,z,mat);
  const cylinder=(name:string,x:number,y:number,z:number,height:number,diameter:number,mat:Material)=>add(CreateCylinder(name,{height,diameter,tessellation:12},scene),name,x,y,z,mat);
  const sphere=(name:string,x:number,y:number,z:number,diameter:number,mat:Material)=>add(CreateSphere(name,{diameter,segments:8},scene),name,x,y,z,mat);
  if(stop.id==='city-market'){
   // A waist-high delivery desk, open pages, the pen on the left and a sea-smoothed paperweight.
   const x=1.15,z=.65;
   box('delivery-desk',x,1,z,1.45,.1,.94,materials.wood);
   for(const dx of [-.58,.58])for(const dz of [-.32,.32])box('desk-leg',x+dx,.48,z+dz,.09,.96,.09,materials.wood);
   box('ledger-cover',x,1.073,z,.95,.042,.65,materials.blue);
   const left=box('delivery-ledger',x-.22,1.108,z,.44,.045,.6,materials.ivory);left.rotation.z=.04;
   const right=box('delivery-ledger',x+.22,1.108,z,.44,.045,.6,materials.ivory);right.rotation.z=-.04;
   for(const dx of [-.22,.22])for(let row=0;row<4;row++)box('ledger-writing',x+dx,1.138,z-.2+row*.105,.3,.005,.012,materials.metal);
   const pen=cylinder('ledger-pen',x-.59,1.082,z-.03,.43,.024,materials.metal);pen.rotation.x=Math.PI/2;pen.rotation.z=.2;
   const weight=sphere('paperweight',x+.3,1.194,z+.13,.22,materials.stone);weight.scaling.set(1,.52,.8);
  }else if(stop.id==='city-residential'){
   // A small bracket hangs from the existing beacon; the blue tie wraps the bell to quiet it.
   box('chime-bracket',.44,2.24,0,1.08,.085,.1,materials.wood);
   cylinder('chime-string',.88,2.075,0,.29,.022,materials.metal);
   const bell=CreateCylinder('chime-bell',{height:.34,diameterTop:.16,diameterBottom:.42,tessellation:16},scene);
   add(bell,'chime-bell',.88,1.765,0,materials.metal);
   sphere('chime-clapper',.88,1.53,0,.11,materials.metal);
   const tie=CreateTorus('chime-cloth-wrap',{diameter:.4,thickness:.07,tessellation:16},scene);
   add(tie,'chime-cloth-wrap',.88,1.68,0,materials.blue);
   sphere('chime-cloth-knot',1.08,1.65,-.05,.12,materials.blue);
   const tail=box('chime-cloth-tail',1.1,1.4,-.055,.09,.44,.035,materials.blue);tail.rotation.z=-.13;
   const shortTail=box('chime-cloth-tail',1.19,1.48,-.04,.075,.29,.035,materials.blue);shortTail.rotation.z=.25;
  }else if(stop.id==='city-forecourt'){
   const x=1.15,z=.65;
   for(const dx of [-.47,.47])box('route-board-post',x+dx,.7,z,.09,1.4,.1,materials.wood);
   box('old-route-board',x,1.57,z,1.35,.9,.13,materials.wood);
   box('route-board-face',x,1.57,z-.075,1.19,.74,.025,materials.ivory);
   // A blue maintenance route climbs toward a tower, then points west below the worn inscription.
   box('blue-route-line',x-.24,1.54,z-.093,.52,.027,.008,materials.blue);
   box('blue-route-line',x+.01,1.69,z-.093,.027,.32,.008,materials.blue);
   box('blue-route-line',x+.18,1.835,z-.093,.34,.027,.008,materials.blue);
   box('route-tower',x+.35,1.76,z-.095,.13,.22,.01,materials.metal);
   box('west-route-arrow',x-.02,1.32,z-.095,.67,.026,.01,materials.blue);
   for(const direction of [-1,1]){const head=box('west-route-arrow',x-.34,1.32+direction*.044,z-.095,.15,.026,.01,materials.blue);head.rotation.z=direction*.65;}
   for(let i=0;i<4;i++){const scratch=box('worn-inscription',x+.15+i*.08,1.4,z-.095,.045,.013,.009,materials.stone);scratch.rotation.z=.18;}
  }else{
   // The overlook already has a balustrade; a small brass bearing disc is enough to mark the view.
   const x=1.05,z=.65;
   cylinder('view-marker-foot',x,.07,z,.14,.4,materials.ivory);
   cylinder('view-marker-post',x,.54,z,.92,.13,materials.metal);
   cylinder('view-marker',x,1.025,z,.07,.68,materials.metal);
   box('view-marker-bearing',x,1.064,z,.53,.009,.022,materials.gold);
   box('view-marker-bearing',x,1.064,z,.022,.009,.53,materials.gold);
   for(const side of [-1,1]){const pointer=box('view-marker-west',x-.22,1.069,z+side*.038,.16,.012,.024,materials.ivory);pointer.rotation.y=side*.55;}
   sphere('view-marker-center',x,1.08,z,.07,materials.gold);
  }
  for(const [mat,group]of groups){
   // Primitive UV attributes differ; all these untextured accents share positions and normals.
   group.parts.forEach(mesh=>mesh.removeVerticesData(VertexBuffer.UVKind));
   const merged=Mesh.MergeMeshes(group.parts,true,true)!;
   merged.name=`cityJourney-${stop.id}-${meshes.length}`;merged.material=mat;merged.isPickable=false;
   merged.metadata={cityStopId:stop.id,parts:group.names};
   if(mat===materials.ivory||mat===materials.stone)applyStoneUV(merged);
   merged.freezeWorldMatrix();meshes.push(merged);
  }
 }
 return{meshes};
}
