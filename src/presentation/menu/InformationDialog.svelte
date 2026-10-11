<script lang="ts">
 import {navigateUi} from '../input/uiNavigation';
 import {createExitMotion} from '../motion/exitMotion.svelte';
 import {regionModal} from '../region/regionModal';
 type InformationAction={label:string;english:string;run:()=>void;primary?:boolean};
 let {title,body,actions,onClose,ariaLabel='提示訊息'}:{title:string;body:string;actions:readonly InformationAction[];onClose?:()=>void;ariaLabel?:string}=$props();
 const titleId=$props.id(),exit=createExitMotion(280);
 const visibleActions=$derived(actions.slice(0,3));
 const primaryIndex=$derived(visibleActions.findIndex(action=>action.primary));
 function key(event:KeyboardEvent){
  event.stopPropagation();
  if(exit.leaving){event.preventDefault();return;}
  if(event.key==='Escape'){event.preventDefault();if(onClose)exit.run(onClose);return;}
  const direction=({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'} as const)[event.key as 'ArrowUp'];
  if(direction){event.preventDefault();navigateUi(direction);return;}
  if(event.key==='Enter'){event.preventDefault();navigateUi('confirm');}
 }
</script>

<div class="information-dialog" class:leaving={exit.leaving} role="dialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={titleId} aria-describedby={titleId+'-body'} aria-busy={exit.leaving} tabindex="-1" use:regionModal onkeydown={key} onkeyup={event=>event.stopPropagation()}>
 <div class="veil" aria-hidden="true"></div>
 <section class="card">
  <div class="scenery" aria-hidden="true"></div>
  <div class="diagonal" aria-hidden="true"></div>
  <svg class="emblem" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 0 27 17 35 9 31 21 48 24 31 27 39 39 27 31 24 48 21 31 9 39 17 27 0 24 17 21 13 9 21 17Z"/><path class="emblem-core" d="m24 15 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/></svg>
  <p class="eyebrow">INFORMATION</p>
  <h1 id={titleId}>{title}</h1>
  <p class="body" data-input-scroll id={titleId+'-body'}>{body}</p>
  <div class="divider" aria-hidden="true"><span></span><i></i><span></span></div>
  <div class="actions" class:three={visibleActions.length===3}>
   {#each visibleActions as action,i}
    <button class="action" data-ui-sound={action.english==='CANCEL'||action.english==='BACK'?'back':'confirm'} class:primary={i===(primaryIndex<0?visibleActions.length-1:primaryIndex)} aria-label={action.label} disabled={exit.leaving} onclick={()=>exit.run(action.run)}><span class="caption"><strong>{action.label}</strong><small>{action.english}</small></span><i aria-hidden="true"></i></button>
   {/each}
  </div>
  {#if onClose}<button class="close" data-ui-sound="back" aria-label="關閉提示訊息" disabled={exit.leaving} onclick={()=>{if(onClose)exit.run(onClose);}}><span aria-hidden="true"></span></button>{/if}
  <footer aria-hidden="true"><span class="brand"><i>✦</i>PROJECT<br/>RONDO</span><span class="tagline">A BRIGHTER<br/>TOMORROW.</span></footer>
 </section>
</div>

<style>
 .card{max-height:100%;display:flex;flex-direction:column;box-sizing:border-box}.card>*{flex-shrink:0}.card .body{min-height:0;flex-shrink:1;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
 .information-dialog{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:24px 16px;box-sizing:border-box;overflow:clip;isolation:isolate;outline:none;color:#122552;font-family:var(--font-body);animation:veil-in .28s ease-out both}
 .veil{position:fixed;inset:0;z-index:-1;background:linear-gradient(110deg,#08142d55,#1427462b 52%,#09162e55)}
 .card{position:relative;isolation:isolate;box-sizing:border-box;width:min(800px,max(48cqw,640px),100%);padding:30px 62px 56px;text-align:center;border:1px solid #eff6ffcf;background:linear-gradient(115deg,#eaf2ffdb,#f8fafff5 47%,#e9f2ffdc);box-shadow:0 0 0 1px #99baff57,inset 0 0 24px #ffffff8c,0 22px 70px #07163133;animation:card-in .32s cubic-bezier(.2,.7,.3,1) both}
 .card:before,.card:after{content:'';position:absolute;pointer-events:none;width:28px;height:28px;border-color:#b6cffa;border-style:solid}.card:before{left:-2px;top:-2px;border-width:1px 0 0 1px}.card:after{right:-2px;bottom:-2px;border-width:0 1px 1px 0}
 .scenery{position:absolute;inset:0;z-index:-2;background:linear-gradient(105deg,#dceaff33,#f2f6fff5 25%,#f2f6fff7 65%,#e6efffa3),url('/title/white-palace-city-v1.png') center 44%/cover;opacity:.62;clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}
 .diagonal{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:linear-gradient(124deg,transparent 14%,#c7dcff70 14.2%,#ecf4ffbb 14.6%,transparent 15%,transparent 84%,#c6ddff40 84%,#c6ddff40 89%,transparent 89%)}
 .diagonal:before{content:'';position:absolute;top:0;bottom:0;left:-14%;width:22%;transform:skew(-33deg);border-right:3px solid #638df0;box-shadow:7px 0 0 #d8e7ff99;background:#739be122}
 .emblem{display:block;width:42px;height:42px;margin:0 auto 14px;fill:#122552}.emblem-core{fill:#ecf3ff}
 .eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.36em;color:#6d80ad;padding-left:.36em}
 h1{font:600 clamp(25px,2cqw,34px)/1.45 'Rondo Chapter Serif','Noto Serif TC',serif;letter-spacing:.14em;margin:0;text-wrap:balance}
 .body{font-size:clamp(13px,1.03cqw,16px);font-weight:500;line-height:1.9;letter-spacing:.13em;white-space:pre-line;text-wrap:pretty;color:#566b99;margin:17px auto 0;max-width:38em;overflow-wrap:anywhere}
 .divider{display:flex;align-items:center;justify-content:center;gap:8px;width:60%;margin:24px auto 27px}.divider span{height:1px;flex:1;background:linear-gradient(90deg,transparent,#829aca)}.divider span:last-child{transform:rotate(180deg)}.divider i{width:7px;height:7px;box-sizing:border-box;border:2px solid #6e85b5;transform:rotate(45deg)}
 .actions{display:flex;justify-content:center;gap:28px;padding:0 12px}.action{position:relative;flex:1;max-width:238px;min-width:0;min-height:64px;padding:10px 16px;transform:skew(-12deg);border:1px solid #f9fcff;background:linear-gradient(135deg,#dde6f6c9,#ffffffd9);box-shadow:1px 1px 0 #93afd278,inset 0 0 14px #ffffff80;color:#102754;cursor:pointer;font-family:var(--font-body);transition:filter .15s,box-shadow .15s}
 .caption{display:block;transform:skew(12deg)}.action strong{display:block;font:600 19px/1.4 'Rondo Chapter Serif','Noto Serif TC',serif;letter-spacing:.23em;padding-left:.23em;overflow-wrap:anywhere}.action small{display:block;margin-top:3px;font:600 8px/1.5 var(--font-body);letter-spacing:.29em;color:#7c91bb;overflow-wrap:anywhere}
 .action.primary{background:linear-gradient(115deg,#3860ff,#326bff 66%,#63b7ff);border-color:#a8dcff;color:white;box-shadow:0 0 12px #4c90ff8c,inset 0 0 0 2px #a1c9ff4d}.primary small{color:#e5edff}.action i{position:absolute;width:9px;height:1px;right:-4px;top:50%;background:#afc6ea}.primary i{background:white;box-shadow:0 0 5px white}.action:hover{filter:brightness(1.08)}.action:focus-visible{outline:2px solid #143991;outline-offset:5px;box-shadow:var(--focus-halo)}.primary:focus-visible{outline-color:#315de1}.action:disabled{cursor:default}.three{gap:20px}.three .action{padding-inline:10px}.three .action strong{font-size:17px;letter-spacing:.13em}
 .close{position:absolute;right:9px;top:8px;width:44px;height:44px;padding:0;border:0;background:transparent;cursor:pointer;color:#365689}.close span:before,.close span:after{content:'';position:absolute;left:9px;top:21px;width:26px;height:1px;background:currentColor;transform:rotate(45deg)}.close span:after{transform:rotate(-45deg)}.close:hover{color:#285ef0}.close:focus-visible{outline:2px solid #315de1;outline-offset:-4px}
 footer{position:absolute;bottom:15px;inset-inline:19px;display:flex;justify-content:space-between;align-items:flex-end;text-align:left;pointer-events:none;font-size:8px;font-weight:600;line-height:1.8;letter-spacing:.35em;color:#8296bd}.brand{position:relative}.brand i{position:absolute;bottom:100%;left:0;font-size:16px;line-height:1.2;font-style:normal;color:#a9bddb}.tagline{text-align:left;font-size:7px;letter-spacing:.22em;color:#526d9d}
 .leaving{pointer-events:none;animation:veil-out .28s ease-in both}.leaving .card{animation:card-out .28s ease-in both}
 @keyframes veil-in{from{opacity:0}to{opacity:1}}@keyframes veil-out{to{opacity:0}}@keyframes card-in{from{opacity:0;transform:translateY(15px) scale(.985)}to{opacity:1;transform:none}}@keyframes card-out{to{opacity:0;transform:translateY(-10px) scale(.985)}}
 @container game-ui (max-width:620px){.card{padding:28px 28px 64px}.emblem{width:34px;height:34px}.eyebrow{font-size:10px}h1{font-size:27px}.body{font-size:14px;letter-spacing:.06em}.divider{width:80%;margin-block:20px}.actions{flex-direction:column;gap:14px;align-items:stretch;padding-inline:10px}.action{max-width:none;min-height:58px}.three .action strong{font-size:19px}.diagonal:before{left:-26%;width:28%}.tagline{font-size:6px}}
 @container game-ui (max-height:500px) and (min-width:621px){.information-dialog{padding-block:12px}.card{padding-block:16px 46px}.emblem{width:26px;height:26px;margin-bottom:7px}.eyebrow{margin-bottom:6px}.body{margin-top:10px}.divider{margin-block:13px}.action{min-height:52px}}
 @media(prefers-reduced-motion:reduce){.information-dialog,.card,.leaving,.leaving .card{animation:none}.action{transition:none}}
</style>
