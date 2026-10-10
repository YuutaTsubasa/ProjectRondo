import type {mountMenuPortrait} from './menuPortraitRuntime';
export type PortraitRenderer = ReturnType<typeof mountMenuPortrait>;
interface Shared {
 readonly canvas:HTMLCanvasElement;readonly renderer:Promise<PortraitRenderer>;
 owner:symbol|null;loaded:boolean;keepers:number;idle:ReturnType<typeof setTimeout>|undefined;
}
/** An unused portrait is freed after this long, so free exploration holds no second WebGL context. */
export const PORTRAIT_IDLE_RELEASE_MS = 20_000;
let shared:Shared|undefined;

function create():Shared{
 const canvas=document.createElement('canvas');canvas.dataset.menuPortrait='';
 const renderer=import('./menuPortraitRuntime').then(runtime=>runtime.mountMenuPortrait(canvas));
 const created:Shared={canvas,renderer,owner:null,loaded:false,keepers:0,idle:undefined};
 renderer.then(view=>view.ready).then(()=>{created.loaded=true;},()=>{
  // A failed engine or model is not kept: the next screen retries from scratch.
  if(shared===created)shared=undefined;
  clearTimeout(created.idle);void renderer.then(view=>view.dispose(),()=>{});
 });
 return created;
}
function hold():Shared{
 shared??=create();
 clearTimeout(shared.idle);shared.idle=undefined;
 return shared;
}
function scheduleIdleRelease(current:Shared){
 clearTimeout(current.idle);current.idle=undefined;
 if(current.owner!==null||current.keepers>0)return;
 current.idle=setTimeout(()=>{if(shared===current&&current.owner===null&&current.keepers===0)disposeMenuPortrait();},PORTRAIT_IDLE_RELEASE_MS);
}

/** One WebGL context and one loaded player model serve every portrait screen (title menu, stage
 * results). Screens borrow the canvas instead of building a second engine over a live stage. */
export function acquireMenuPortrait(host:HTMLElement){
 const current=hold(),lease=Symbol('portrait-lease');
 current.owner=lease;host.append(current.canvas);
 return {
  canvas:current.canvas,renderer:current.renderer,
  /** Already loaded by an earlier screen or a warm-up: show it at once, without a fade. */
  loaded:current.loaded,
  /** A newer screen can take the canvas over; only the current owner may drive it. */
  owns:()=>current.owner===lease,
  release(){
   if(current.owner!==lease)return;
   current.owner=null;current.canvas.remove();
   void current.renderer.then(view=>view.stop(),()=>{});
   scheduleIdleRelease(current);
  },
 };
}

/** Load the portrait ahead of a screen that will need it (a stage's results) and keep it loaded
 * until the returned release is called. */
export function retainMenuPortrait():()=>void{
 const current=hold();current.keepers++;
 let released=false;
 return()=>{if(released)return;released=true;current.keepers--;scheduleIdleRelease(current);};
}

/** Free the shared context now (idle release, tests, or a host shutting the app down). */
export function disposeMenuPortrait(){
 const current=shared;shared=undefined;
 if(!current)return;
 clearTimeout(current.idle);current.canvas.remove();
 void current.renderer.then(view=>view.dispose(),()=>{});
}
