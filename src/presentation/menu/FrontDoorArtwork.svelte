<script lang="ts">
  import { onMount } from 'svelte';
  import MenuPortrait from './MenuPortrait.svelte';
  import HudWaves from '../hud/HudWaves.svelte';
  let { active = true, loading = false, settings = false, inner = false }: { active?: boolean; loading?: boolean; settings?:boolean; inner?:boolean } = $props();
  let artwork: HTMLDivElement;
  let paused = $state(false);

  onMount(() => {
    if (typeof window.matchMedia !== 'function') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      artwork.style.setProperty('--look-x', `${x}px`);
      artwork.style.setProperty('--look-y', `${y}px`);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      x = y = 0;
      apply();
    };
    const preferences = () => {
      paused = document.hidden || reduced.matches;
      reset();
    };
    const move = (event: PointerEvent) => {
      if (!active || paused || !finePointer.matches || event.pointerType === 'touch') return;
      x = (Math.min(1, Math.max(0, event.clientX / window.innerWidth)) - .5) * 16;
      y = (Math.min(1, Math.max(0, event.clientY / window.innerHeight)) - .5) * 10;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    preferences();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', reset);
    document.documentElement.addEventListener('pointerleave', reset);
    document.addEventListener('visibilitychange', preferences);
    reduced.addEventListener('change', preferences);
    finePointer.addEventListener('change', preferences);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', reset);
      document.documentElement.removeEventListener('pointerleave', reset);
      document.removeEventListener('visibilitychange', preferences);
      reduced.removeEventListener('change', preferences);
      finePointer.removeEventListener('change', preferences);
    };
  });
</script>
<div class="artwork" class:active class:loading class:settings class:inner class:paused={paused || !active} class:ambient-paused={paused} aria-hidden="true" bind:this={artwork}>
  <div class="landscape"><img src="/title/white-palace-city-v1.png" alt="" draggable="false" fetchpriority="high" /></div>
  <div class="atmosphere"></div><div class="sun-haze"></div>
  <div class="mist distant"><img src="/title/sea-mist-v1.png" alt="" draggable="false" /></div>
  <div class="foreground"><MenuPortrait {active} pose={loading?'loading':'menu'} /></div>
  <div class="mist near"><img src="/title/sea-mist-v1.png" alt="" draggable="false" /></div>
  <div class="left-paper">
    <HudWaves edges={false} subtle {paused}/>
  </div>
  <div class="ornaments">
  <div class="paper-sliver"></div>
  <div class="right-paper"></div><div class="blue-cut"></div>
  <p class="top-note">TOWARD<br />A BRIGHTER<br />TOMORROW.<span></span></p>
  <p class="intro-note">まだ見ぬ世界へ。<br /><span>――</span> あなたと。</p>
  <div class="crest"><svg viewBox="0 0 48 48"><path d="M24 2v44M2 24h44M8 8l32 32M8 40 40 8M24 5l4 14 15 5-15 4-4 15-4-15-15-4 15-5Z"/></svg><span>WIND<br />TIDES<br />AND YOU.</span></div>
  <p class="world-note">風の向こうに、<br />まだ知らない世界がある。<small>A WORLD WE HAVE YET TO KNOW.</small></p>
  <p class="vertical-note">その一歩が、<br />まだ見ぬ明日へ。</p>
  <span class="crosshair">＋</span>
  </div>
</div>
<style>
  /* Decorative layers must never scroll when Android moves focus to a canvas behind the title. */
  .artwork{position:absolute;inset:0;overflow:clip;pointer-events:none;background:#91b8e6}
  .landscape{position:absolute;inset:-28px;transform:translate(calc(var(--look-x,0px) * -.35),calc(var(--look-y,0px) * -.35));transition:transform .8s ease-out}
  .landscape img{width:100%;height:100%;object-fit:cover;object-position:54% 50%;animation:scenic-idle 14s ease-in-out infinite alternate;transform-origin:57% 48%}
  .atmosphere{position:absolute;inset:0;background:linear-gradient(180deg,#284c7710,transparent 55%,#081c391c);pointer-events:none}
  .foreground{position:absolute;left:52%;top:7%;width:48%;height:112%;transform:translate(calc(var(--look-x,0px) * -1),calc(var(--look-y,0px) * -1));transition:transform .8s ease-out}
  .mist{position:absolute;left:-6%;right:-6%;bottom:-8%;height:80%;pointer-events:none}
  .mist img{width:100%;height:100%;object-fit:fill;animation:mist-drift 18s ease-in-out infinite alternate}
  .mist.distant{opacity:.26}.mist.near{bottom:-25%;left:-18%;right:-15%;height:65%;opacity:.16}.mist.near img{animation-duration:14s;animation-direction:alternate-reverse}
  .sun-haze{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 24% 8%,#fffcdd36,transparent 55%);mix-blend-mode:screen;animation:sun-idle 7s ease-in-out infinite alternate}
  .paused .mist img,.paused .landscape img,.paused .sun-haze{animation-play-state:paused}
  .left-paper{position:absolute;inset:0;background:#fff;transition:clip-path .65s cubic-bezier(.65,0,.2,1);clip-path:polygon(0 0,26% 0,23.5% 20%,28.8% 0,38% 0,15% 100%,0 100%)}
  /* Diffuse atmospheric motion; no hard-edged sweep over the title lettering. */
  .left-paper:before,.left-paper:after{content:'';position:absolute;inset:-18%;pointer-events:none;will-change:transform}
  .left-paper:before{background:radial-gradient(ellipse at 20% 78%,#9fbbdc30,transparent 46%),radial-gradient(ellipse at 82% 18%,#c2d8ea45,transparent 44%);animation:paper-atmosphere 13s ease-in-out infinite alternate}
  .left-paper:after{background:radial-gradient(ellipse at 30% 38%,#fff 3%,#ffffffa6 20%,transparent 55%),radial-gradient(ellipse at 75% 80%,#d2e2f22e,transparent 45%);animation:paper-veil 17s ease-in-out infinite alternate}
  .ambient-paused .left-paper:before,.ambient-paused .left-paper:after{animation-play-state:paused}
  @keyframes paper-atmosphere{from{transform:translate(-3%,3%) scale(1);opacity:.7}to{transform:translate(4%,-3%) scale(1.06);opacity:1}}
  @keyframes paper-veil{from{transform:translate(3%,-2%)}to{transform:translate(-4%,3%)}}
  .ornaments{position:absolute;inset:0;opacity:1;transition:opacity .25s .2s}
  .artwork:not(.active) .ornaments{opacity:0;transition:opacity .2s}
  .paper-sliver{position:absolute;inset:0;background:#f5f8fff0;clip-path:polygon(28.8% 0,37.1% 0,23.2% 40%,24.5% 18%)}
  .right-paper{position:absolute;inset:0;background:linear-gradient(135deg,#edf4ffd6,#fbfcff 80%);clip-path:polygon(100% 31%,100% 82%,83.2% 65%)}
  .blue-cut{position:absolute;inset:0;background:linear-gradient(135deg,#173abb,#75b5ff);clip-path:polygon(100% 26%,100% 27.5%,84% 61.7%,84.5% 59.5%)}
  .top-note,.intro-note,.world-note,.vertical-note{position:absolute;margin:0;color:#2b466c}
  .top-note{top:3.3%;left:2.4%;font:500 clamp(7px,.56cqw,10px)/1.6 var(--font-body);letter-spacing:.24em}
  .top-note>span{position:absolute;left:calc(100% + 14px);top:60%;height:1px;width:11cqw;background:#2b466c70}
  .intro-note{top:12.5%;left:3.4%;font:clamp(10px,.83cqw,14px)/2 Georgia,serif;letter-spacing:.25em}.intro-note>span{margin-right:12px;color:#7084a0}
  .crest{position:absolute;top:3%;right:2%;color:#f5f8ff;text-align:center}.crest svg{display:block;margin:0 auto 10px;width:40px;height:40px;fill:none;stroke:currentColor;stroke-width:1.4}.crest span{font:8px/1.8 var(--font-body);letter-spacing:3px}
  .world-note{top:23%;left:50%;font:clamp(9px,.74cqw,13px)/1.9 Georgia,serif;letter-spacing:.15em}.world-note small{display:block;font:6px var(--font-body);letter-spacing:1.5px;margin-top:9px}
  .vertical-note{right:2.4%;top:48%;writing-mode:vertical-rl;font:12px/2.3 Georgia,serif;letter-spacing:.32em}
  .crosshair{position:absolute;left:2%;bottom:13%;color:#77a7ff;font:22px var(--font-body)}
  @keyframes mist-drift{from{transform:translateX(-4%) translateY(0)}to{transform:translateX(4%) translateY(-10px)}}
  @keyframes scenic-idle{from{transform:scale(1.025) translate(.3%,-.2%)}to{transform:scale(1.055) translate(-.9%,.5%)}}
  @keyframes sun-idle{from{opacity:.45}to{opacity:1}}
  @container game-ui (max-width:900px){.world-note{display:none}.left-paper{clip-path:polygon(0 0,20% 0,30% 0,40% 0,55% 0,25% 100%,0 100%)}.foreground{left:45%;width:65%;top:13%;height:105%}.paper-sliver{opacity:.5}}
  @container game-ui (max-width:650px){.landscape img{object-position:62% 50%}.foreground{left:40%;width:95%;top:25%;height:85%}.mist.near{display:none}.left-paper{clip-path:polygon(0 0,30% 0,50% 0,70% 0,90% 0,37% 100%,0 100%)}.intro-note,.vertical-note,.world-note,.paper-sliver{display:none}.crest{right:5%;top:4%}.crest svg{width:30px;height:30px}.crest span{display:none}.top-note{left:6%;top:4%}.right-paper{opacity:.7}.crosshair{left:5%}}
  .loading .foreground{left:-4%;top:7%;width:68%;height:104%;z-index:1;clip-path:polygon(28% 0,100% 0,100% 100%,0 100%);transform:none}
  .loading .landscape{inset:-8% -8% 10% 27%;transform:rotate(-7deg) scale(1.08)}
  .loading .atmosphere{background:#f6f9ff;clip-path:polygon(42% 0,64% 0,47% 64%,24% 74%)}
  .loading .ornaments{opacity:0}.loading .left-paper{clip-path:polygon(0 0,28% 0,30% 0,33% 0,39% 0,9% 100%,0 100%);background:#f7faff}
  .loading .mist.near{z-index:2;opacity:.1}
  @container game-ui (max-width:650px){.loading .foreground{left:-30%;top:8%;width:123%;height:88%}.loading .landscape{inset:0 -50% 8% 0}.loading .left-paper{clip-path:polygon(0 0,20% 0,22% 0,25% 0,32% 0,0 100%,0 100%)}}
  .artwork:not(.active) .left-paper{clip-path:polygon(0 0,60% 0,70% 0,80% 0,100% 0,100% 100%,0 100%)}
  @media(prefers-reduced-motion:reduce){.left-paper,.ornaments{transition:none}.mist img,.landscape img,.sun-haze,.left-paper:before,.left-paper:after{animation:none;will-change:auto}.landscape,.foreground{transform:none;transition:none}}
.settings .left-paper,.settings .paper-sliver,.settings .ornaments{opacity:0}.settings .foreground{left:46%;width:55%}
 .inner .left-paper{clip-path:polygon(0 0,47% 0,45% 20%,52% 0,66% 0,45% 100%,0 100%);background:linear-gradient(90deg,#f8fbff,#f5f9fff2 55%,#eaf4ffe0)}
 .inner .foreground{left:62%;width:43%;top:10%;height:108%}.inner .intro-note,.inner .world-note,.inner .top-note{opacity:0}.inner .paper-sliver{left:45%;opacity:.35}.inner .landscape:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#f5f9fffc 9%,#f5f9ffed 35%,#f3f8ffba 49%,#eff7ff44 61%,transparent 73%)}
 @container game-ui (max-width:1050px){.inner .foreground{left:64%;width:50%}.inner .landscape:after{background:linear-gradient(90deg,#f5f9fffa 25%,#f5f9ffe6 48%,#f3f8ffad 67%,transparent 90%)}}
 @container game-ui (max-width:700px){.inner .left-paper{clip-path:none;background:#f6faffce}.inner .foreground{left:30%;width:90%;opacity:.22}.inner .ornaments{opacity:0}}
</style>
