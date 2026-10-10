import type {mountMenuPortrait} from './menuPortraitRuntime';
export type PortraitRenderer = ReturnType<typeof mountMenuPortrait>;
interface Shared {readonly canvas:HTMLCanvasElement;readonly renderer:Promise<PortraitRenderer>;owner:symbol|null}
let shared:Shared|undefined;

/** One WebGL context and one loaded player model serve every portrait screen (title menu, stage
 * results). Screens borrow the canvas instead of building a second engine over a live stage. */
export function acquireMenuPortrait(host:HTMLElement){
 if(!shared){
  const canvas=document.createElement('canvas');canvas.dataset.menuPortrait='';
  const renderer=import('./menuPortraitRuntime').then(runtime=>runtime.mountMenuPortrait(canvas));
  const created:Shared={canvas,renderer,owner:null};shared=created;
  // A failed engine or model is not kept: the next screen retries from scratch.
  renderer.then(view=>view.ready).catch(()=>{
   if(shared===created)shared=undefined;
   void renderer.then(view=>view.dispose(),()=>{});
  });
 }
 const current=shared,lease=Symbol('portrait-lease');
 current.owner=lease;host.append(current.canvas);
 return {
  canvas:current.canvas,renderer:current.renderer,
  /** A newer screen can take the canvas over; only the current owner may drive it. */
  owns:()=>current.owner===lease,
  release(){
   if(current.owner!==lease)return;
   current.owner=null;current.canvas.remove();
   void current.renderer.then(view=>view.stop(),()=>{});
  },
 };
}

/** Free the shared context (tests, or a host shutting the app down). */
export function disposeMenuPortrait(){
 const current=shared;shared=undefined;
 if(!current)return;
 current.canvas.remove();void current.renderer.then(view=>view.dispose(),()=>{});
}
