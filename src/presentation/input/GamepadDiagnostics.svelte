<script lang="ts">
 import {onMount} from 'svelte';
 import {inspectGamepads,type GamepadDiagnostic} from './gamepadDiagnostics';
 let diagnostics=$state<GamepadDiagnostic>({available:false,message:'正在偵測手把…',pads:[]});
 onMount(()=>{
  const inspect=()=>diagnostics=inspectGamepads(window.isSecureContext,navigator.getGamepads?.bind(navigator),navigator.userAgent);
  inspect();const timer=setInterval(inspect,150);return()=>clearInterval(timer);
 });
</script>
<section aria-label="手把連線狀態">
 <h3>手把連線狀態</h3><p>{diagnostics.message}</p>
 {#each diagnostics.pads as pad}<div class="pad"><strong>{pad.id}</strong><small>配置：{pad.mapping} · {pad.buttons} 鍵／{pad.axes} 軸</small><small>按下：{pad.pressed}　搖桿：{pad.sticks}</small></div>{/each}
</section>
<style>
 section{border-top:1px solid #8fb4e140;padding:14px 0;margin-top:10px;font:13px/1.7 var(--font-body);color:#d7e8ff}h3{font-size:15px;margin:0 0 6px}p{margin:0}.pad{margin-top:12px}strong,small{display:block;overflow-wrap:anywhere}small{font-size:11px;font-variant-numeric:tabular-nums;color:#b4c9e6}
</style>
