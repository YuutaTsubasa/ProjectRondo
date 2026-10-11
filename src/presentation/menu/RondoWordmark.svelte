<script lang="ts">
  let {compact=false}:{compact?:boolean}=$props();
</script>
<div class="wordmark">
  <h1><img src="/title/project-rondo-logo-v2.png" alt="PROJECT RONDO" draggable="false" fetchpriority="high" /></h1>
  {#if !compact}<div class="signature"><span aria-hidden="true">✦</span><p>まだ見ぬ空、その先へ。<small>BEYOND THE FAMILIAR SKY.</small></p></div>{/if}
</div>
<style>
  .wordmark{width:100%;color:#07182f;user-select:none;position:relative}
  h1{margin:0;line-height:0}h1 img{display:block;width:112%;max-width:none;height:auto;margin-left:-6%;user-select:none}
  .signature{display:flex;align-items:flex-start;justify-content:space-between;margin-top:14px;padding-left:2px}
  .signature>span{font:25px Georgia,serif;line-height:1}
  p{position:relative;margin:0;padding:0 1.2em;white-space:nowrap;text-align:center;font:clamp(11px,1cqw,17px)/1.7 Georgia,serif;letter-spacing:.22em}
  p:before,p:after{content:'—';position:absolute;top:0;color:#7c8ea7}p:before{left:0}p:after{right:0}
  small{display:block;font:500 clamp(7px,.66cqw,11px) var(--font-body);letter-spacing:.27em;margin-top:4px}
  @container game-ui (max-width:650px){p{font-size:11px}.signature{margin-top:10px}}
</style>
