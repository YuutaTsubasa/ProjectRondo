import type {Scene} from '@babylonjs/core/scene';
import {CreateGround} from '@babylonjs/core/Meshes/Builders/groundBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Color3} from '@babylonjs/core/Maths/math.color';
/** A single opaque ocean surface: no large reflection targets or transparent sorting. */
export function createTownSea(scene:Scene){
 const sea=CreateGround('town-sea',{width:1600,height:1800},scene);sea.position.set(839,-3.5,0);sea.isPickable=false;
 const mat=new StandardMaterial('town-sea-material',scene);mat.diffuseColor=new Color3(.16,.43,.51);mat.emissiveColor=new Color3(.025,.065,.08);mat.specularColor=new Color3(.45,.55,.58);mat.specularPower=120;
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const a=Math.sin(x/size*Math.PI*12+y/size*Math.PI*8),b=Math.cos(x/size*Math.PI*4-y/size*Math.PI*16);const at=(y*size+x)*4;
  data.set([128+a*12,128+b*15,253,255],at);
 }
 const ripple=RawTexture.CreateRGBATexture(data,size,size,scene,true,false);ripple.gammaSpace=false;ripple.uScale=160;ripple.vScale=180;ripple.level=.25;mat.bumpTexture=ripple;sea.material=mat;
 scene.onBeforeRenderObservable.add(()=>{const dt=Math.min(scene.getEngine().getDeltaTime()/1000,.05);ripple.uOffset=(ripple.uOffset+dt*.004)%1;ripple.vOffset=(ripple.vOffset+dt*.002)%1;});
 return sea;
}
