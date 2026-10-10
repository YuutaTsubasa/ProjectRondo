import {Engine} from '@babylonjs/core/Engines/engine';
import {createMenuPortraitScene} from './menuPortraitScene';
export function mountMenuPortrait(canvas:HTMLCanvasElement){
 const engine=new Engine(canvas,true,{alpha:true,premultipliedAlpha:true,stencil:true,preserveDrawingBuffer:import.meta.env.DEV});
 engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,1.5));
 const view=createMenuPortraitScene(engine);
 let disposed=false;
 const render=()=>view.render();
 return {...view,
  resize(){if(disposed)return;engine.resize();view.invalidate();},
  start(){if(!disposed)engine.runRenderLoop(render);},
  stop(){engine.stopRenderLoop(render);},
  dispose(){if(disposed)return;disposed=true;engine.stopRenderLoop(render);view.dispose();engine.dispose();},
 };
}
