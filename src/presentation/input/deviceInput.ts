import {writable} from 'svelte/store';
export type Device='keyboard'|'gamepad'|'touch';
export type GameAction='jump'|'attack';
export type UiAction='confirm'|'back'|'up'|'down'|'left'|'right'|'next'|'previous'|'pause'|'interact'|'map'|'zoomIn'|'zoomOut'|'center'|'markers'|'panUp'|'panDown'|'panLeft'|'panRight';
export interface PadSample {id:string;index:number;mapping:string;buttons:readonly {pressed:boolean;value:number}[];axes:readonly number[];}
export interface DeviceStatus {device:Device;family:'xbox'|'playstation';playing:boolean;camera:boolean;interact:boolean;connected:boolean;}
const zero=()=>({x:0,y:0});
export function deadzone(x:number,y:number,threshold=.2){
 const length=Math.hypot(x,y);if(!Number.isFinite(length)||length<=threshold)return zero();
 const magnitude=Math.min(1,(length-threshold)/(1-threshold));return{x:x/length*magnitude,y:y/length*magnitude};
}
/** Device state is independent of DOM and rendering. Physical edges are sampled even in menus. */
export function createDeviceHub(){
 let state:DeviceStatus={device:'keyboard',family:'xbox',playing:false,camera:false,interact:false,connected:false};
 const status=writable(state),actions=new Set<(a:GameAction)=>void>(),ui=new Set<(a:UiAction)=>unknown>();
 const owners=new Map<symbol,{enabled:boolean;camera:boolean;interact:boolean}>();
 let move=zero(),lookAxis=zero(),touch=zero(),touchDelta=zero(),walk=false;
 let previous:boolean[]=[],padId:string|undefined,armed=false,repeat='',nextRepeat=0;
 function patch(value:Partial<DeviceStatus>){const next={...state,...value};if(Object.keys(next).some(k=>next[k as keyof DeviceStatus]!==state[k as keyof DeviceStatus])){state=next;status.set(state);}}
 function claim(device:Device){patch({device});}
 function clear(){move=zero();lookAxis=zero();touch=zero();touchDelta=zero();walk=false;armed=false;repeat='';}
 function context(){const active=[...owners.values()].filter(o=>o.enabled);const playing=active.length>0,camera=active.some(o=>o.camera);if(playing!==state.playing||camera!==state.camera)clear();patch({playing,camera,interact:active.some(o=>o.interact)});}
 function emitUi(a:UiAction){let consumed=false;for(const fn of ui)if(fn(a)===true)consumed=true;return consumed;}
 function action(a:GameAction){if(state.playing)for(const fn of actions)fn(a);}
 function poll(pad:PadSample|null,now:number){
  if(!pad||pad.mapping!=='standard'){
   if(padId!==undefined){clear();previous=[];padId=undefined;patch({connected:false});}
   return;
  }
  const id=pad.index+':'+pad.id;
  const held=pad.buttons.map(b=>b.pressed||b.value>.55);
  const left=deadzone(pad.axes[0]??0,pad.axes[1]??0),right=deadzone(pad.axes[2]??0,pad.axes[3]??0);
  if(id!==padId){clear();previous=held;padId=id;patch({connected:true,family:/playstation|dualshock|dualsense|054c/i.test(pad.id)?'playstation':'xbox'});}
  const active=held.some(Boolean)||left.x!==0||left.y!==0||right.x!==0||right.y!==0;
  if(active)claim('gamepad');
  if(!armed){if(active){previous=held;return;}armed=true;}
  const edges=held.map((v,i)=>v&&!previous[i]);previous=held;
  move=state.playing?{x:left.x,y:-left.y}:zero();lookAxis=state.playing&&state.camera?right:zero();walk=state.playing&&!!held[4];
  if(state.playing){
   if(edges[9]){emitUi('pause');return;}
   if(edges[3]||edges[8]){emitUi('map');return;}
   if(edges[0])action('jump');
   if(edges[2]&&!(state.interact&&emitUi('interact')))action('attack');
   return;
  }
  if(edges[0]){emitUi('confirm');return;}if(edges[1]||edges[9]){emitUi('back');return;}
  if(edges[4])emitUi('previous');if(edges[5])emitUi('next');
  if(edges[6])emitUi('zoomOut');if(edges[7])emitUi('zoomIn');
  if(edges[3])emitUi('center');if(edges[2])emitUi('interact');
  const direction:UiAction|''=held[12]?'up':held[13]?'down':held[14]?'left':held[15]?'right':Math.abs(left.y)>.5?(left.y<0?'up':'down'):Math.abs(left.x)>.5?(left.x<0?'left':'right'):Math.abs(right.y)>.5?(right.y<0?'panUp':'panDown'):Math.abs(right.x)>.5?(right.x<0?'panLeft':'panRight'):'';
  if(!direction){repeat='';return;}
  if(direction!==repeat){repeat=direction;nextRepeat=now+360;emitUi(direction);}else if(now>=nextRepeat){nextRepeat=now+110;emitUi(direction);}
 }
 return {
  status:{subscribe:status.subscribe},getState:()=>state,claim,poll,clear,
  registerGameplay(camera=false,interact=false){const id=Symbol();owners.set(id,{enabled:false,camera,interact});return{setEnabled(enabled:boolean){const owner=owners.get(id);if(owner){owner.enabled=enabled;context();}},dispose(){owners.delete(id);context();}};},
  onAction(fn:(a:GameAction)=>void){actions.add(fn);return()=>{actions.delete(fn);};},
  onUi(fn:(a:UiAction)=>unknown){ui.add(fn);return()=>{ui.delete(fn);};},
  axis(){return state.playing?(state.device==='touch'?touch:state.device==='gamepad'?move:zero()):zero();},
  walkHeld:()=>state.playing&&walk,
  look(dt:number){if(!state.playing||!state.camera)return zero();const d=state.device==='touch'?{x:touchDelta.x*.004,y:touchDelta.y*.004}:state.device==='gamepad'?{x:lookAxis.x*Math.min(dt,.05)*2.2,y:lookAxis.y*Math.min(dt,.05)*1.6}:zero();touchDelta=zero();return d;},
  touchAxis(x:number,y:number){if(x!==0||y!==0)claim('touch');if(state.playing){const m=Math.max(1,Math.hypot(x,y));touch={x:x/m,y:y/m};}},
  releaseTouch(){touch=zero();touchDelta=zero();walk=false;},
  touchLook(x:number,y:number){claim('touch');if(state.playing&&state.camera){touchDelta.x+=x;touchDelta.y+=y;}},
  touchWalk(value:boolean){if(value)claim('touch');walk=state.playing&&value;},
  touchAction(a:GameAction|UiAction){claim('touch');if(a==='jump'||a==='attack')action(a);else emitUi(a);},
 };
}
export const deviceInput=createDeviceHub();
export const inputStatus=deviceInput.status;
