<script lang="ts">
 import {onDestroy} from 'svelte';
 import {deviceInput,type GameAction,type UiAction} from './deviceInput';
 let {camera,interact=true}:{camera:boolean;interact?:boolean}=$props();
 let stickId:number|undefined,lookId:number|undefined,walkId:number|undefined;
 let sx=$state(0),sy=$state(0),lastX=0,lastY=0;
 function stickMove(e:PointerEvent){if(e.pointerId!==stickId)return;const r=e.currentTarget instanceof Element?e.currentTarget.getBoundingClientRect():null;if(!r)return;const x=(e.clientX-r.left-r.width/2)/48,y=(e.clientY-r.top-r.height/2)/48,m=Math.max(1,Math.hypot(x,y));sx=x/m*38;sy=y/m*38;deviceInput.touchAxis(x/m,-y/m);}
 function stickDown(e:PointerEvent){if(stickId!==undefined)return;e.preventDefault();stickId=e.pointerId;(e.currentTarget as Element).setPointerCapture(e.pointerId);stickMove(e);}
 function stickUp(e:PointerEvent){if(e.pointerId!==stickId)return;stickId=undefined;sx=0;sy=0;deviceInput.touchAxis(0,0);}
 function lookDown(e:PointerEvent){if(lookId!==undefined)return;e.preventDefault();lookId=e.pointerId;lastX=e.clientX;lastY=e.clientY;(e.currentTarget as Element).setPointerCapture(e.pointerId);}
 function lookMove(e:PointerEvent){if(e.pointerId!==lookId)return;deviceInput.touchLook(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;}
 function lookUp(e:PointerEvent){if(e.pointerId===lookId)lookId=undefined;}
 function press(e:PointerEvent,action:GameAction|UiAction){e.preventDefault();deviceInput.touchAction(action);}
 function walkDown(e:PointerEvent){e.preventDefault();walkId=e.pointerId;(e.currentTarget as Element).setPointerCapture(e.pointerId);deviceInput.touchWalk(true);}
 function walkUp(e:PointerEvent){if(walkId===e.pointerId){walkId=undefined;deviceInput.touchWalk(false);}}
 function reset(){stickId=undefined;lookId=undefined;walkId=undefined;sx=0;sy=0;deviceInput.releaseTouch();}
 onDestroy(reset);
</script>
<svelte:window onblur={reset}/>
<svelte:document onvisibilitychange={()=>{if(document.hidden)reset();}}/>
<div class="touch-controls" aria-label="觸控遊戲操作">
 {#if camera}<div class="look" role="region" aria-label="滑動調整視角" onpointerdown={lookDown} onpointermove={lookMove} onpointerup={lookUp} onpointercancel={lookUp} onlostpointercapture={lookUp}><span>滑動視角</span></div>{/if}
 <div class="stick" role="region" aria-label="移動搖桿" onpointerdown={stickDown} onpointermove={stickMove} onpointerup={stickUp} onpointercancel={stickUp} onlostpointercapture={stickUp}><span class="stick-ring"></span><i style:transform={`translate(${sx}px,${sy}px)`}></i><small>移動</small></div>
 <button class="walk" aria-label="按住步行" onpointerdown={walkDown} onpointerup={walkUp} onpointercancel={walkUp} onlostpointercapture={walkUp}>步行</button>
 <div class="actions">
  {#if interact}<button class="interact" aria-label="互動" onpointerdown={e=>press(e,'interact')} onclick={e=>{if(e.detail===0)deviceInput.touchAction('interact');}}><span>◇</span><small>互動</small></button>{/if}
  <button class="attack" aria-label="揮劍／Homing" onpointerdown={e=>press(e,'attack')} onclick={e=>{if(e.detail===0)deviceInput.touchAction('attack');}}><span>⚔</span><small>揮劍／盾衝</small></button>
  <button class="jump" aria-label="跳躍／二段跳" onpointerdown={e=>press(e,'jump')} onclick={e=>{if(e.detail===0)deviceInput.touchAction('jump');}}><span>↟</span><small>跳躍</small></button>
 </div>
 <div class="utility"><button aria-label="觸控暫停" onclick={()=>deviceInput.touchAction('pause')}>Ⅱ 暫停</button></div>
</div>
<style>
 .touch-controls{position:fixed;inset:0;z-index:12;pointer-events:none;color:#f1f7ff;font-family:var(--font-body);user-select:none;-webkit-user-select:none}
 .look{position:absolute;right:0;top:22%;width:53%;bottom:0;pointer-events:auto;touch-action:none}.look>span{position:absolute;right:22%;top:24%;font-size:11px;letter-spacing:.2em;opacity:.45;text-shadow:0 1px 3px #071b36}
 .stick{position:absolute;left:max(28px,env(safe-area-inset-left));bottom:max(82px,calc(env(safe-area-inset-bottom) + 48px));width:128px;height:128px;border:1px solid #cee8ff65;border-radius:50%;background:radial-gradient(circle,#27497666,#11284535);pointer-events:auto;touch-action:none;box-shadow:inset 0 0 25px #98c9ff14}
 .stick-ring{position:absolute;inset:14px;border:1px solid #cce7ff25;border-radius:50%}.stick i{position:absolute;width:42px;height:42px;left:42px;top:42px;border-radius:50%;border:1px solid #d5eeff9c;background:radial-gradient(circle,#dceeff7c,#5b93cb60);box-shadow:0 0 15px #a3cfff25}.stick small{position:absolute;bottom:9px;text-align:center;width:100%;font-size:10px;opacity:.65}
 button{pointer-events:auto;touch-action:none;color:inherit;font:700 12px var(--font-body);border:1px solid #c1dfff78;background:linear-gradient(145deg,#152d4ab3,#2356878c);text-shadow:0 1px 3px #071b36;box-shadow:0 0 12px #173f7140;cursor:pointer}button:active{background:#6bb5f1ab;border-color:white}button:focus-visible{outline:2px solid white;outline-offset:3px}
 .walk{position:absolute;left:176px;bottom:94px;width:46px;height:46px;border-radius:50%}
 .actions{position:absolute;right:max(26px,env(safe-area-inset-right));bottom:max(78px,calc(env(safe-area-inset-bottom) + 48px));width:188px;height:142px;pointer-events:none}.actions button{position:absolute;border-radius:50%;display:grid;place-content:center;gap:0}.actions span{font:30px Georgia,serif;line-height:1}.actions small{font-size:10px;margin-top:5px}.attack{width:76px;height:76px;left:0;bottom:0}.jump{width:72px;height:72px;right:0;bottom:0}.interact{width:58px;height:58px;right:33px;top:0}.interact span{font-size:22px}
 .utility{position:absolute;right:max(16px,env(safe-area-inset-right));top:max(16px,env(safe-area-inset-top));display:flex;gap:8px}.utility button{padding:9px 13px;min-height:42px;border-radius:2px}
 @media(max-height:500px){.stick{bottom:42px;width:112px;height:112px}.stick i{left:34px;top:34px}.walk{bottom:48px;left:155px}.actions{bottom:36px;transform:scale(.9);transform-origin:bottom right}}
 @media(max-width:480px){.stick{left:15px;width:110px;height:110px}.stick i{left:33px;top:33px}.actions{right:12px;transform:scale(.86);transform-origin:bottom right}.walk{left:22px;bottom:210px}.look>span{right:16%}}
</style>
