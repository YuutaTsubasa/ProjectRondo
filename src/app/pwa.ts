import {writable} from 'svelte/store';

type InstallPrompt = Event & {prompt:()=>Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export type PwaStatus = {installable:boolean; updateAvailable:boolean; busy:boolean; error:string};
export const pwaStatus=writable<PwaStatus>({installable:false,updateAvailable:false,busy:false,error:''});

export function createPwaClient(host:Window, serviceWorker:ServiceWorkerContainer, reload:()=>void) {
 let prompt:InstallPrompt|undefined;
 let registration:ServiceWorkerRegistration|undefined;
 let requestedUpdate=false;
 // An earlier worker was already serving this origin; a later controller change is then an update,
 // not the first install. A hard refresh leaves the page uncontrolled, hence the active check below.
 let existing=!!serviceWorker.controller;
 let reloadAvailable=false;
 let disposed=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const listeners:Array<()=>void>=[];
 function listen(target:EventTarget,name:string,fn:EventListener) {
  target.addEventListener(name,fn);listeners.push(()=>target.removeEventListener(name,fn));
 }
 const status=(value:Partial<PwaStatus>)=>{if(!disposed)pwaStatus.update(s=>({...s,...value}));};
 listen(host,'beforeinstallprompt',event=>{
  event.preventDefault();prompt=event as InstallPrompt;status({installable:true});
 });
 listen(host,'appinstalled',()=>{prompt=undefined;status({installable:false});});
 listen(serviceWorker,'controllerchange',()=>{
  // Another tab may activate an update. Never reload this game without its player's consent.
  if(requestedUpdate){clearTimeout(timer);reload();}
  else {reloadAvailable=existing;existing=true;status({updateAvailable:reloadAvailable});}
 });
 const ready=serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(result=>{
  if(disposed)return;
  registration=result;existing||=!!result.active;
  // A first install also passes through `waiting` on its way to active; only a worker waiting behind
  // an active one is an update. (Not `controller`: a hard refresh loads the page uncontrolled.)
  const check=()=>status({updateAvailable:reloadAvailable||!!result.active&&!!result.waiting});
  check();
  const watch=()=>{
   const installing=result.installing;
   if(installing)listen(installing,'statechange',check);
  };
  listen(result,'updatefound',watch);watch();
  // Browser checks on launch; revisiting the menu also checks after long play sessions.
 }).catch(error=>{console.warn('PWA registration unavailable',error);});
 return {
  ready,
  async install() {
   const event=prompt;if(!event)return;
   prompt=undefined;status({installable:false,busy:true,error:''});
   try{await event.prompt();await event.userChoice;}
   catch{status({error:'無法開啟安裝提示，請從瀏覽器選單安裝。'});}
   finally{status({busy:false});}
  },
  async checkUpdate(){try{await registration?.update();}catch{/* Offline checks must not interrupt the menu. */}},
  update() {
   if(reloadAvailable){reload();return;}
   const waiting=registration?.active?registration.waiting:undefined;
   if(!waiting){status({updateAvailable:false});return;}
   requestedUpdate=true;status({busy:true,error:''});
   timer=setTimeout(()=>{requestedUpdate=false;status({busy:false,error:'更新尚未完成，請稍後再試。'});},15000);
   waiting.postMessage({type:'ACTIVATE_UPDATE'});
  },
  dispose(){disposed=true;clearTimeout(timer);listeners.forEach(remove=>remove());},
 };
}
export let pwaClient:ReturnType<typeof createPwaClient>|undefined;
export function startPwa() {
 if(!import.meta.env.PROD || !window.isSecureContext || '__TAURI_INTERNALS__' in window || !('serviceWorker' in navigator))return;
 pwaClient=createPwaClient(window,navigator.serviceWorker,()=>window.location.reload());
}
