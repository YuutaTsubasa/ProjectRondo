import type {Scene} from '@babylonjs/core/scene';
import type {Camera} from '@babylonjs/core/Cameras/camera';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer';
import {RenderTargetTexture} from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {PostProcess} from '@babylonjs/core/PostProcesses/postProcess';
import {Effect} from '@babylonjs/core/Materials/effect';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {PORTRAIT_PAINT_FRAGMENT} from './portraitPaintShader';

/** Imported roles cover the body; named facial materials protect the small expression features. */
export function portraitPaintProfile(name:string,role:string){
 if(role==='body')return {strength:.85,brush:1,metal:1};
 if(/hair/i.test(name))return {strength:.72,brush:.9,metal:0};
 if(/iris|eye white|crease|mouth interior|teeth|tongue/i.test(name))return {strength:0,brush:0,metal:0};
 return {strength:.10,brush:.08,metal:0};
}
class PortraitPaint extends MaterialPluginBase{
 constructor(material:StandardMaterial,private readonly profile:ReturnType<typeof portraitPaintProfile>){super(material,'PortraitPaint',220,{},true,true);}
 getUniforms(){return {ubo:[{name:'portraitPaint',size:3,type:'vec3'}],fragment:'uniform vec3 portraitPaint;'};}
 bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat3('portraitPaint',this.profile.strength,this.profile.metal,this.profile.brush);}
 getCustomCode(type:string):Record<string,string>|null{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'varying vec2 portraitUV;',CUSTOM_VERTEX_MAIN_END:`
   #ifdef UV1
    portraitUV=uv;
   #else
    portraitUV=positionUpdated.xy;
   #endif
  `};
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:`
   varying vec2 portraitUV;
   float paintHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float paintNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(paintHash(i),paintHash(i+vec2(1,0)),f.x),mix(paintHash(i+vec2(0,1)),paintHash(i+vec2(1,1)),f.x),f.y);}
  `,CUSTOM_FRAGMENT_BEFORE_FOG:`
   float grain=paintNoise(portraitUV*vec2(48.,210.));
   float fine=paintNoise(portraitUV*vec2(92.,380.));
   float brush=mix(.90,1.06,smoothstep(.2,.8,grain*.8+fine*.2));
   float facing=clamp((dot(normalW,normalize(vec3(-.55,.75,.75)))+.45)/1.3,0.,1.);
   vec3 cool=vec3(.68,.73,.84),mid=vec3(.86,.88,.93),warm=vec3(1.04,1.01,.94);
   vec3 paintLight=facing<.52?mix(cool,mid,smoothstep(.18,.52,facing)):mix(mid,warm,smoothstep(.52,.82,facing));
   float lum=dot(color.rgb,vec3(.2126,.7152,.0722));
   float chroma=max(color.r,max(color.g,color.b))-min(color.r,min(color.g,color.b));
   // Baked silver highlights are in the color map. Compress only neutral bright armor,
   // preserving dark undersuit, brown leather and the original facial texture.
   float silver=portraitPaint.y*(1.-smoothstep(.10,.25,chroma))*smoothstep(.24,.52,lum);
   vec3 basePaint=color.rgb*(mix(lum,.64,.42*silver)/max(lum,.001));
   color.rgb=mix(color.rgb,basePaint*paintLight*brush,portraitPaint.x);
  `};
 }
}
class PaintMask extends MaterialPluginBase{
 constructor(material:StandardMaterial,private readonly weight:number){super(material,'PaintMask',220,{},true,true);}
 getUniforms(){return {ubo:[{name:'paintWeight',size:1,type:'float'}],fragment:'uniform float paintWeight;'};}
 bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat('paintWeight',this.weight);}
 getCustomCode(type:string):Record<string,string>|null{return type==='fragment'?{CUSTOM_FRAGMENT_MAIN_END:'gl_FragColor.rgb=vec3(paintWeight);'}:null;}
}
/** Only the transparent portrait scene is processed; HTML and city illustration stay untouched. */
export function applyPortraitPainting(scene:Scene,camera:Camera,meshes:readonly AbstractMesh[]):()=>void{
 const materials=new Map<StandardMaterial,StandardMaterial>();
 const mask=new RenderTargetTexture('portraitPaintMask',{ratio:1},scene,{generateMipMaps:false,samplingMode:Texture.NEAREST_SAMPLINGMODE});
 mask.clearColor=new Color4(0,0,0,0);mask.activeCamera=camera;mask.renderList=[];
 for(const mesh of meshes){
  const material=mesh.material;if(!(material instanceof StandardMaterial))continue;
  let maskMaterial=materials.get(material);
  if(!maskMaterial){
   const role=material.metadata?.gltf?.extras?.playerMaterial?.role;
   const profile=portraitPaintProfile(material.name,role);
   new PortraitPaint(material,profile);
   maskMaterial=new StandardMaterial(`portraitMask:${material.name}`,scene);
   maskMaterial.disableLighting=true;maskMaterial.backFaceCulling=material.backFaceCulling;
   maskMaterial.diffuseTexture=material.diffuseTexture;maskMaterial.alpha=material.alpha;
   maskMaterial.useAlphaFromDiffuseTexture=material.useAlphaFromDiffuseTexture;
   maskMaterial.transparencyMode=material.transparencyMode;
   new PaintMask(maskMaterial,profile.brush);materials.set(material,maskMaterial);
  }
  mask.renderList.push(mesh);mask.setMaterialForRendering(mesh,maskMaterial);
 }
 scene.customRenderTargets.push(mask);
 Effect.ShadersStore.rondoPortraitPaintFragmentShader=PORTRAIT_PAINT_FRAGMENT;
 const post=new PostProcess('portraitPaint','rondoPortraitPaint',['texel','radius'],['paintMask'],1,camera,Texture.BILINEAR_SAMPLINGMODE);
 post.samples=4;
 post.onApply=effect=>{
  effect.setTexture('paintMask',mask);effect.setFloat2('texel',1/Math.max(1,post.width),1/Math.max(1,post.height));
  effect.setFloat('radius',Math.max(2,Math.min(7,post.height/190)));
 };
 let disposed=false;
 const dispose=()=>{
  if(disposed)return;disposed=true;
  scene.onDisposeObservable.remove(onDispose);
  const index=scene.customRenderTargets.indexOf(mask);if(index>=0)scene.customRenderTargets.splice(index,1);
  post.dispose(camera);mask.dispose();for(const material of materials.values())material.dispose(false,false);
 };
 const onDispose=scene.onDisposeObservable.addOnce(dispose);
 return dispose;
}
