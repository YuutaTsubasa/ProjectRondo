<script lang="ts">
  let { speaker }: { speaker: string } = $props();
</script>
<div class="nameplate"><span class="star" aria-hidden="true">✧</span><span>{speaker}</span></div>
<style>
  .nameplate{position:relative;z-index:2;align-self:flex-start;margin-left:4.5%;margin-bottom:-1px;padding:7px 42px 8px 30px;max-width:85%;box-sizing:border-box;color:var(--avg-text);font:400 clamp(19px,1.65vw,28px)/1.3 var(--font-body);letter-spacing:.14em;pointer-events:none;filter:drop-shadow(0 0 8px rgba(var(--c-blue-soft-rgb),.18))}
  .nameplate:before,.nameplate:after{content:'';position:absolute;inset:0;z-index:-1;clip-path:polygon(22px 0,calc(100% - 25px) 0,100% 100%,0 100%,0 22px)}
  .nameplate:before{background:rgba(var(--c-blue-soft-rgb),.75)}
  .nameplate:after{inset:1px 1px 0;background:rgba(var(--avg-navy-rgb),.94)}
  .star{position:absolute;left:-14px;bottom:-11px;font:38px Georgia,serif;color:var(--avg-light);text-shadow:0 0 9px var(--avg-glow),0 0 18px var(--avg-glow)}
  @media(max-width:600px){.nameplate{font-size:18px;padding:6px 26px 6px 24px}}
</style>
