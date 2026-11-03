import type {Scene} from '@babylonjs/core/scene';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';
import {TOWN_BUILDINGS,type TownBuildingKind} from '../../domain/town/townLayout';
export interface TownBounds {min:Vector3;max:Vector3}
export interface TownAssetPlacement {id:string;kind:TownBuildingKind;root:TransformNode;meshes:AbstractMesh[];bounds:TownBounds}
/** Originals stay container-owned. Copies share geometry, textures and materials. */
export async function createTownAssets(scene:Scene):Promise<TownAssetPlacement[]> {
 const placed:TownAssetPlacement[]=[];
 for(const kind of ['house','shop','tower','gate','arcade'] as const){
  const container=await LoadAssetContainerAsync(`/town/${kind}.glb`,scene);
  scene.onDisposeObservable.addOnce(()=>container.dispose());
  for(const material of container.materials)if(material instanceof PBRMaterial){material.environmentIntensity=.18;material.backFaceCulling=false;}
  for(const b of TOWN_BUILDINGS.filter(b=>b.kind===kind)){
   const entries=container.instantiateModelsToScene(name=>`${b.id}:${name}`,false,{doNotInstantiate:true});
   const pivot=new TransformNode(b.id,scene);
   entries.rootNodes.forEach(node=>node.parent=pivot);
   const raw=pivot.getHierarchyBoundingVectors(true);
   const size=raw.max.subtract(raw.min);const scale=b.height/size.y;
   if(!Number.isFinite(scale)||scale<=0)throw new Error(`Invalid town model bounds: ${kind}`);
   const content=new TransformNode(`${b.id}:origin`,scene);
   entries.rootNodes.forEach(node=>node.parent=content);content.parent=pivot;
   content.position.set(-(raw.min.x+raw.max.x)/2,-raw.min.y,-(raw.min.z+raw.max.z)/2);
   pivot.scaling.setAll(scale);pivot.rotation.y=b.yaw;pivot.position.set(b.x,b.baseY??0,b.z);
   const meshes=pivot.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);
   meshes.forEach(mesh=>{mesh.computeWorldMatrix(true);mesh.isPickable=false;mesh.receiveShadows=true;});
   const bounds=pivot.getHierarchyBoundingVectors(true);
   placed.push({id:b.id,kind,root:pivot,meshes,bounds});
  }
 }
 return placed;
}
