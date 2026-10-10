<script lang="ts">
 import {onMount} from 'svelte';
 let time=$state('—:—:—'),date=$state('');
 onMount(()=>{
  const format=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let timer:ReturnType<typeof setTimeout>;
  const update=()=>{clearTimeout(timer);const now=new Date();time=format.format(now);date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('.');timer=setTimeout(update,1000-Date.now()%1000);};
  update();document.addEventListener('visibilitychange',update);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);};
 });
</script>
<div class="identity"><img src="/title/project-rondo-logo-v2.png" alt="PROJECT RONDO"/><span class="divider"></span><div class="clock" title="本機日期與時間"><div class="date">{date}</div><time aria-label={`本機時間 ${date} ${time}`}>{time}</time></div></div>
<style>
 .identity{position:absolute;left:max(22px,2vw,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:19px;transform:scale(var(--hud-scale,1));transform-origin:left bottom;color:#f3f7ff;text-shadow:0 1px 2px #10243c80;pointer-events:none}
 img{display:block;width:116px;height:auto;max-height:48px;object-fit:contain;filter:brightness(0) invert(1)}.divider{height:30px;width:1px;background:#e0ecff66}.clock{display:flex;flex-direction:column;gap:2px}.date{font:400 10px var(--font-body);letter-spacing:1.6px;color:#d1def0;font-variant-numeric:tabular-nums}time{font:400 17px var(--font-body);font-variant-numeric:tabular-nums;letter-spacing:1px}
 @media(max-width:700px){.identity{left:max(16px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));gap:12px}img{width:90px}time{font-size:14px}}
</style>
