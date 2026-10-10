<script lang="ts">
 import RondoWordmark from './RondoWordmark.svelte';
 let {message='正在準備遊戲…'}:{message?:string}=$props();
</script>
<div class="loading-composition">
 <div class="loading-logo"><RondoWordmark compact /></div>
 <div class="loading-message"><p>まだ見ぬ世界へ。<br/>この先に、新しい物語が待っている。</p><small>BEYOND THE FAMILIAR SKY.<br/>A NEW JOURNEY AWAITS.</small></div>
 <div class="loading-edition">PROJECT RONDO<br/>LOADING SYSTEM<br/><span>FIRST REGION</span></div>
 <div class="loading-paper"></div>
 <div class="loading-progress">
  <h1>LOADING<span aria-hidden="true">...</span></h1>
  <div class="loading-track" role="progressbar" aria-label="遊戲載入中"><span></span></div>
  <p role="status" data-initial tabindex="-1">{message}</p>
  <small>PREPARING YOUR NEXT CHAPTER.</small>
 </div>
 <div class="loading-footer"><span>✧ &nbsp; A NEW JOURNEY<br/><small>BEYOND THE HORIZON.</small></span><span>PROJECT RONDO</span></div>
</div>
<style>
 .loading-composition{position:absolute;inset:0;z-index:3;pointer-events:none;color:#213c67;animation:loading-enter .4s both}
 .loading-logo{position:absolute;left:2.7%;top:2%;width:22%;z-index:2}
 .loading-message{position:absolute;left:44%;top:13%;font:13px/2.1 Georgia,serif;letter-spacing:.18em}.loading-message small{font:7px/1.8 var(--font-body);letter-spacing:.2em}
 .loading-edition{position:absolute;right:3%;top:3%;text-align:right;font:8px/2 var(--font-body);letter-spacing:.2em}.loading-edition span{font-size:7px}
 .loading-paper{position:absolute;inset:0;background:linear-gradient(145deg,#fff,#f0f6ff);clip-path:polygon(0 90%,100% 52%,100% 100%,0 100%)}
 .loading-progress{position:absolute;left:55%;right:17%;bottom:16%;color:#427df5}
 h1{font:400 clamp(13px,1.15vw,20px) var(--font-body);letter-spacing:.58em;margin:0 0 13px}h1 span{letter-spacing:.4em;margin-left:6px}
 .loading-track{height:7px;border:1px solid #90baff80;overflow:hidden;position:relative;background:#e5efff}
 .loading-track span{display:block;width:38%;height:100%;background:linear-gradient(90deg,#96c9ff00,#2866f2,#93c9ff);animation:load-scan 1.35s ease-in-out infinite}
 .loading-progress p{font:11px/1.7 var(--font-body);color:#4c6386;letter-spacing:.13em;margin:12px 0 5px}.loading-progress p:focus{outline:none}.loading-progress small{font:7px var(--font-body);letter-spacing:.2em}
 .loading-footer{position:absolute;bottom:0;left:0;right:0;height:9.5%;padding:0 3%;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #8cb4f066;background:#f1f6ffc9;font:11px/1.8 var(--font-body);letter-spacing:.2em}.loading-footer small{font-size:6px}
 @keyframes load-scan{from{transform:translateX(-110%)}to{transform:translateX(370%)}}
 @keyframes loading-enter{from{opacity:0}to{opacity:1}}
 @media(max-width:650px){.loading-logo{width:53%;left:5%;top:3%}.loading-message{display:none}.loading-edition{font-size:6px;right:4%}.loading-progress{left:18%;right:8%;bottom:13%}.loading-paper{clip-path:polygon(0 77%,100% 67%,100% 100%,0 100%)}.loading-footer{font-size:8px;padding:0 6%}}
 @media(prefers-reduced-motion:reduce){.loading-composition,.loading-track span{animation:none}.loading-track span{width:100%;background:#7da7ed}}
</style>
