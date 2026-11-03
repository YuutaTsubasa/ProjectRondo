import type {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CreatePolyhedron} from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import {CreateTorus} from '@babylonjs/core/Meshes/Builders/torusBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {PalaceLayout} from '../../domain/palace/palaceLayout';
import type {PalaceRun} from '../../domain/palace/palaceRun';
/** Cores are stationary homing anchors. Only the visual crystal bobs; collision stays authored. */
export function createPalaceCores(scene:Scene,layout:PalaceLayout){
 const material=new StandardMaterial('palaceCoreAzure',scene);
 material.diffuseColor=Color3.FromHexString('#3285ac');material.emissiveColor=Color3.FromHexString('#217394');material.specularColor=Color3.FromHexString('#bceeff');
 const rim=new StandardMaterial('palaceCoreRim',scene);rim.diffuseColor=Color3.FromHexString('#d7edf3');rim.emissiveColor=Color3.FromHexString('#438da3');
 const cores=layout.guards.filter(g=>g.kind==='azure-core').map((spawn,i)=>{
  const holder=new TransformNode('palaceCore'+i,scene);holder.position.set(spawn.x,spawn.y,0);
  const crystal=CreatePolyhedron('palaceCoreCrystal'+i,{type:1,size:.48},scene);crystal.material=material;crystal.parent=holder;
  const ring=CreateTorus('palaceCoreRing'+i,{diameter:1.25,thickness:.07,tessellation:32},scene);ring.rotation.x=Math.PI/2;ring.material=rim;ring.parent=holder;
  crystal.isPickable=false;ring.isPickable=false;
  return {id:spawn.id,holder,crystal,ring};
 });
 return {update(state:PalaceRun){
  for(const [i,core] of cores.entries()){
   const g=state.guards.find(g=>g.id===core.id)!;
   const burst=g.defeated?Math.min(1,g.defeatedFor/.26):0;
   core.holder.setEnabled(!g.defeated||burst<1);core.holder.scaling.setAll(1+burst*.8);
   core.crystal.visibility=core.ring.visibility=1-burst;
   core.crystal.position.y=Math.sin(state.elapsed*Math.PI/ .95+i)*.14;
   core.crystal.rotation.y=state.elapsed*.8+i;core.ring.rotation.z=state.elapsed*.5+i;
  }
 },dispose(){cores.forEach(c=>c.holder.dispose());material.dispose();rim.dispose();}};
}
