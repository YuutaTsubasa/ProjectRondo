import {deviceInput,type UiAction} from './deviceInput';
import {navigateUi,sendKey} from './uiNavigation';
/** One poller for the whole application; scenes only register their current input ownership. */
export function startInputRuntime(){
 let frame=0,disposed=false,focused=true;
 const keyboard=(e:KeyboardEvent)=>{if(e.isTrusted&&!e.metaKey&&!e.ctrlKey&&!e.altKey)deviceInput.claim('keyboard');};
 const pointer=(e:PointerEvent)=>{if(e.isTrusted)deviceInput.claim(e.pointerType==='touch'?'touch':'keyboard');};
 const blur=()=>{focused=false;deviceInput.clear();};
 const focus=()=>{focused=true;deviceInput.clear();};
 const visibility=()=>{deviceInput.clear();focused=!document.hidden&&document.hasFocus();};
 const stop=deviceInput.onUi((action:UiAction)=>{
  if(document.hidden)return;
  if(deviceInput.getState().playing){const key=({pause:'Escape',interact:'e',map:'m'} as Partial<Record<UiAction,string>>)[action];if(key)return sendKey(key,window);}
  else navigateUi(action);
 });
 if(navigator.maxTouchPoints>0&&globalThis.matchMedia?.('(pointer: coarse)').matches)deviceInput.claim('touch');
 window.addEventListener('keydown',keyboard,true);window.addEventListener('pointerdown',pointer,true);
 window.addEventListener('blur',blur);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
 const tick=(now:number)=>{
  if(disposed)return;
  if(focused&&!document.hidden){
   let pads:readonly (Gamepad|null)[]=[];try{pads=navigator.getGamepads?.()??[];}catch{/* unsupported embedding */}
   const standard=pads.filter((p):p is Gamepad=>!!p&&p.connected&&p.mapping==='standard');
   const active=standard.find(p=>p.buttons.some(b=>b.pressed)||p.axes.some(a=>Math.abs(a)>.25))??standard[0]??null;
   const before=deviceInput.getState();deviceInput.poll(active,now);
   if(before.connected&&!active&&before.playing&&before.device==='gamepad')sendKey('Escape',window);
  }
  frame=requestAnimationFrame(tick);
 };
 if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(tick);
 return()=>{disposed=true;if(frame)cancelAnimationFrame(frame);stop();blur();window.removeEventListener('keydown',keyboard,true);window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
}
