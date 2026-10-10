import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {createRegionScene,type RegionScene} from '../../src/presentation/region/regionScene';
import {atlasCaptureBounds,createAtlasCamera} from '../../src/presentation/region/regionAtlasCapture';
const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!,metadata=document.querySelector('#metadata')!;
const generate=document.querySelector<HTMLButtonElement>('#generate')!,png=document.querySelector<HTMLButtonElement>('#png')!,manifest=document.querySelector<HTMLButtonElement>('#manifest')!;
const engine=new Engine(canvas,true,{preserveDrawingBuffer:true});engine.setHardwareScalingLevel(1);engine.setSize(1024,1024);
let region:RegionScene|undefined,receipt:object={},live=true;
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}
generate.onclick=async()=>{
 generate.disabled=true;png.disabled=true;manifest.disabled=true;status.textContent='正在載入場景與建築…';
 region?.dispose();region=undefined;
 try{
  const built=await createRegionScene(engine,canvas);if(!live){built.dispose();return;}region=built;built.suspendInput(true);built.audio.dispose();
  const scene=built.scene;scene.physicsEnabled=false;scene.animationsEnabled=false;scene.particlesEnabled=false;scene.fogMode=Scene.FOGMODE_NONE;
  built.player.root.setEnabled(false);for(const mesh of scene.meshes)if(mesh.infiniteDistance)mesh.setEnabled(false);
  const bounds=atlasCaptureBounds();scene.activeCamera=createAtlasCamera(scene,bounds);scene.clearColor=Color4.FromHexString('#253c53ff');
  scene.imageProcessingConfiguration.applyByPostProcess=false;
  scene.imageProcessingConfiguration.exposure=1;scene.imageProcessingConfiguration.contrast=1;
  await scene.whenReadyAsync();if(!live)return;
  // Build shader variants for the capture camera without running a permanent second render loop.
  for(let i=0;i<4;i++){scene.render();await new Promise<void>(r=>requestAnimationFrame(()=>r()));}
  receipt={image:'/maps/white-tide-atlas.png',size:1024,bounds,generatedAt:new Date().toISOString(),orientation:'north:+Z,east:+X',source:'createRegionScene'};
  metadata.textContent=JSON.stringify(receipt,null,2);status.textContent='生成完成 · 1024 × 1024 · 北方朝上';png.disabled=false;manifest.disabled=false;
 }catch(error){console.error(error);status.textContent='生成失敗，可以重新生成。';}finally{generate.disabled=false;}
};
png.onclick=()=>{if(!region)return;region.scene.render();const out=document.createElement('canvas');out.width=out.height=1024;const ctx=out.getContext('2d')!;ctx.translate(1024,0);ctx.scale(-1,1);ctx.drawImage(canvas,0,0);out.toBlob(blob=>{if(blob)download(blob,'white-tide-atlas.png');},'image/png');};
manifest.onclick=()=>download(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}),'white-tide-atlas.json');
window.addEventListener('pagehide',()=>{live=false;region?.dispose();engine.dispose();});
