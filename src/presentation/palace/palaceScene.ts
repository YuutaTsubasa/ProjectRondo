import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { IBL_URL, IBL_FACE_SIZE, IBL_INTENSITY } from '../babylon/ibl';
import { createShadows } from '../babylon/shadows';
import { createInput } from '../babylon/input';
import { loadKnight, driveKnightAnimation, type Knight, type KnightMotionSample } from '../babylon/knight';
import { CAPSULE_HALF } from '../babylon/capsule';
import { createHomingReticle } from '../babylon/homingReticle';
import { exposeDevHandle } from '../babylon/devHandles';
import { PALACE_LAYOUT } from '../../domain/palace/palaceLayout';
import { createPalaceRun, stepPalaceRun, selectPalaceTarget, type PalaceRun } from '../../domain/palace/palaceRun';
import { createPalaceScenery } from './palaceScenery';
import { loadPalaceGuards } from './palaceGuards';
import { createPalaceAudio } from './palaceAudio';

export interface PalaceScene {
  readonly scene:Scene;
  readonly state:PalaceRun;
  advance(dt:number):PalaceRun;
  reset():PalaceRun;
  suspendInput(on:boolean):void;
  dispose():void;
}
export async function createPalaceScene(engine:Engine):Promise<PalaceScene> {
  const scene=new Scene(engine);
  const input=createInput();input.setEnabled(false);
  let knight:Knight|undefined,stopAnimation:(()=>void)|undefined;
  let guards:Awaited<ReturnType<typeof loadPalaceGuards>>|undefined;
  let audio:ReturnType<typeof createPalaceAudio>|undefined;
  try{
    scene.useRightHandedSystem=true;
    scene.clearColor=Color4.FromHexString('#e1edf3ff');
    scene.imageProcessingConfiguration.toneMappingEnabled=true;
    scene.imageProcessingConfiguration.exposure=.85;
    const camera=new FreeCamera('palaceSideCamera',new Vector3(10,6,25),scene);
    camera.minZ=.1;camera.maxZ=100;camera.fov=.63;
    scene.activeCamera=camera;
    const ambient=new HemisphericLight('palaceAmbient',Vector3.Up(),scene);
    ambient.intensity=.65;ambient.groundColor=new Color3(.16,.19,.22);
    const sun=new DirectionalLight('palaceSun',new Vector3(-.4,-1,-.7),scene);
    sun.position.set(20,35,18);sun.intensity=.9;
    scene.environmentTexture=new HDRCubeTexture(IBL_URL,scene,IBL_FACE_SIZE,false,true,false,true);
    scene.environmentIntensity=IBL_INTENSITY;
    const shadows=createShadows(sun,camera,{cascades:2,maxZ:60});
    const scenery=createPalaceScenery(scene,shadows);
    let state=createPalaceRun();
    const playerRoot=new TransformNode('palacePlayer',scene);
    playerRoot.position.set(state.player.x,state.player.y+CAPSULE_HALF,0);
    playerRoot.rotation.y=-Math.PI/2;
    knight=await loadKnight(scene,playerRoot,shadows,()=>state.player.grounded?state.player.y:null);
    const motion=():KnightMotionSample=>({
      planarSpeed:Math.abs(state.player.vx),airborne:!state.player.grounded,
      homing:state.player.homing!==null,homingEntrySeconds:.5,bounced:state.player.bounced,
      airJumped:state.player.airJumped,swordSeconds:state.player.swordSeconds,
    });
    stopAnimation=driveKnightAnimation(scene,knight,motion,()=>({walk:4,run:10,airtime:25.6/30}));
    guards=await loadPalaceGuards(scene,shadows);
    const reticle=createHomingReticle(scene);
    audio=createPalaceAudio();
    let cameraX=state.player.x+4,cameraY=2.7;
    const update=(snap=false)=>{
      const p=state.player;
      playerRoot.position.set(p.x,p.y+CAPSULE_HALF,0);
      playerRoot.rotation.y=-p.facing*Math.PI/2;
      const dying=p.deadFor>0;
      playerRoot.rotation.z=dying?-p.facing*Math.min(1,(.7-p.deadFor)/.45)*1.3:0;
      for(const mesh of playerRoot.getChildMeshes())
        mesh.visibility=p.invulnerable>0&&Math.floor(state.elapsed*14)%2===0?.38:1;
      const desiredX=Math.max(9,Math.min(PALACE_LAYOUT.width-9,p.x+4));
      const desiredY=Math.max(2.2,Math.min(6,p.y+2.5));
      if(snap){cameraX=desiredX;cameraY=desiredY;}
      else{cameraX+=(desiredX-cameraX)*.14;cameraY+=(desiredY-cameraY)*.1;}
      camera.position.set(cameraX,cameraY+3.2,25);
      camera.setTarget(new Vector3(cameraX,cameraY,0));
      guards!.update(state);scenery.update(state,cameraX);
      const targetId=selectPalaceTarget(state);
      const target=state.guards.find(g=>g.id===targetId);
      if(target&&!dying)reticle.showAt({x:target.x,y:target.y+.95,z:.2});
      else reticle.hide();
    };
    let disposed=false,suspended=true;
    const api:PalaceScene={
      scene,get state(){return state;},
      advance(dt){
        if(disposed||suspended)return state;
        const before=state;
        state=stepPalaceRun(state,{axis:input.axis().x,jump:input.consumeJump(),attack:input.consumeAttack(),dt});
        update(state.deaths!==before.deaths||state.player.deadFor===0&&before.player.deadFor>0);
        audio!.update(before,state);scene.render();return state;
      },
      reset(){
        state=createPalaceRun();input.setEnabled(false);input.setEnabled(!suspended);
        scene.resetLastAnimationTimeFrame();update(true);return state;
      },
      suspendInput(on){
        if(disposed)return;
        suspended=on;input.setEnabled(!on);audio!.pause(on);
        if(!on)scene.resetLastAnimationTimeFrame();
      },
      dispose(){
        if(disposed)return;disposed=true;
        input.dispose();audio?.dispose();stopAnimation?.();knight?.release();guards?.dispose();scene.dispose();
      },
    };
    update(true);
    exposeDevHandle(scene,'palace',api);
    return api;
  }catch(error){
    input.dispose();audio?.dispose();stopAnimation?.();knight?.release();guards?.dispose();scene.dispose();throw error;
  }
}
