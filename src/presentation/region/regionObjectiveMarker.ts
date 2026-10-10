import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreatePlane} from '@babylonjs/core/Meshes/Builders/planeBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../domain/region/regionLayout';

/** One depth-tested world marker, moved with the tracked destination. No physics or shadows. */
export function createRegionObjectiveMarker(scene:Scene){
 const root=new TransformNode('region-objective',scene);root.setEnabled(false);
 const material=(name:string,color:Color3,alpha:number)=>{
  const mat=new StandardMaterial(name,scene);mat.disableLighting=true;mat.emissiveColor=color;
  mat.alpha=alpha;mat.backFaceCulling=false;mat.disableDepthWrite=true;return mat;
 };
 const light=material('region-objective-light',new Color3(.28,.55,1),.38);
 light.alphaMode=Constants.ALPHA_ADD;
 const beam=CreateCylinder('region-objective-beam',{height:10,diameterBottom:1.1,diameterTop:2.1,tessellation:32,subdivisions:8,cap:Mesh.NO_CAP},scene);
 beam.parent=root;beam.position.y=5;beam.material=light;
 const positions=beam.getVerticesData(VertexBuffer.PositionKind)!;
 const colors:number[]=[];
 for(let i=0;i<positions.length;i+=3){const t=(positions[i+1]+5)/10;colors.push(1,1,1,Math.pow(1-t,2)*.7);}
 beam.setVerticesData(VertexBuffer.ColorKind,colors);beam.hasVertexAlpha=true;
 const halo=CreateTorus('region-objective-halo',{diameter:1.9,thickness:.035,tessellation:64},scene);
 halo.parent=root;halo.position.y=.06;halo.material=light;
 // One textured plane avoids coplanar layers fighting under the post-processing depth pass.
 const badge=CreatePlane('region-objective-exclamation',{size:.85,sideOrientation:Mesh.DOUBLESIDE},scene);
 badge.parent=root;badge.position.y=3.2;badge.billboardMode=Mesh.BILLBOARDMODE_ALL;
 const icon=material('region-objective-icon',Color3.White(),1);
 const texture=new Texture('/ui/objective-marker.png',scene);texture.hasAlpha=true;
 icon.diffuseTexture=texture;icon.emissiveTexture=texture;icon.useAlphaFromDiffuseTexture=true;
 badge.material=icon;
 for(const mesh of root.getChildMeshes()){mesh.isPickable=false;mesh.checkCollisions=false;}
 let time=0;
 const observer=scene.onBeforeRenderObservable.add(()=>{
  if(!root.isEnabled())return;
  time+=Math.min(.05,scene.getEngine().getDeltaTime()/1000);
  badge.position.y=3.2+Math.sin(time*2)*.09;
  light.alpha=.32+Math.sin(time*1.6)*.045;
  halo.scaling.setAll(1+Math.sin(time*1.6)*.07);
 });
 scene.onDisposeObservable.add(()=>scene.onBeforeRenderObservable.remove(observer));
 return {setTarget(id:string|null){
  const place=REGION_INTERACTION_PLACES.find(p=>p.id===id);
  root.setEnabled(!!place);
  if(place)root.position.set(place.x,regionHeight(place.x,place.z),place.z);
 }};
}
