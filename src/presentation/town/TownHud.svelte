<script lang="ts">
 import {inputStatus} from '../input/deviceInput';
 import InputHint from '../input/InputHint.svelte';
 import PauseScreen from '../menu/PauseScreen.svelte';
 import LocationMarquee from '../hud/LocationMarquee.svelte';
 import HudWaves from '../hud/HudWaves.svelte';
  let { status, locationLabel, onPause, onResume, onReset, onExit }: {
    status: 'playing' | 'paused'; locationLabel: string;
    onPause: () => void; onResume: () => void; onReset: () => void; onExit: () => void;
  } = $props();
  function pauseKey(event: KeyboardEvent) {
    if (event.key !== ' ') return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) onPause();
  }
</script>

<div class="town-hud" class:pause-covered={status==='paused'} inert={status !== 'playing'}>
 <HudWaves paused={status!=='playing'}/>
 <LocationMarquee location="白色王城" paused={status!=='playing'}/>
  <header>
    <div class="location"><small>WHITE PALACE TOWN</small><strong>白色王城</strong><p>{locationLabel}</p></div>
    <button class="pause" aria-label="暫停漫遊" onclick={onPause} onkeydown={pauseKey}>Ⅱ <span>暫停</span></button>
  </header>
  <footer><span><kbd><InputHint label="W A S D" gameplay/></kbd> 移動 <kbd><InputHint label="SHIFT" gameplay/></kbd> 步行</span><span><kbd><InputHint label="SPACE" gameplay/></kbd> 跳躍／二段跳</span><span>{$inputStatus.device==='keyboard'?'點擊畫面轉動視角':$inputStatus.device==='gamepad'?'右搖桿轉動視角':'右側滑動轉動視角'} · <kbd><InputHint label="ESC" gameplay/></kbd> 暫停</span></footer>
</div>
{#if status === 'paused'}
 <PauseScreen {onResume} resumeLabel="繼續漫遊" chapterLabel="EXPLORATION" chapterNumber="" chapterTitle="白色王城" location={locationLabel} objective="探索臨海王城" tip="沿著拱廊走向海岸，看看港口與王城之間的風景。"
  actions={[{label:'返回入口',english:'BACK TO ENTRANCE',run:onReset},{label:'返回主選單',english:'MAIN MENU',run:onExit}]}/>
{/if}

<style>
  .pause-covered{visibility:hidden}
  .town-hud { position:fixed; inset:0; pointer-events:none; padding:28px 32px; box-sizing:border-box; color:var(--c-ink); font-family:var(--font-body); }
  header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
  .location { padding:16px 24px; background:#f5f9ffeb; border-left:4px solid var(--c-blue); box-shadow:0 8px 25px #10204414; backdrop-filter:blur(10px); }
  small { display:block; font-size:10px; letter-spacing:2px; }.location small { margin-bottom:7px; color:var(--c-blue); }.location strong { font-size:22px; letter-spacing:3px; }.location p { margin:9px 0 0; font-size:12px; }
  button { font:inherit; cursor:pointer; }.pause { pointer-events:auto; border:1px solid #ffffff80; padding:12px 16px; color:var(--c-ink); background:#f4f7ffe8; border-radius:2px; }.pause span { font-size:12px; margin-left:8px; }
  footer { position:absolute; bottom:24px; left:32px; right:32px; display:flex; justify-content:center; flex-wrap:wrap; gap:12px 28px; color:white; font-size:12px; text-shadow:0 1px 5px #00192e; }kbd { font-family:var(--font-headline); border:1px solid #ffffff60; border-radius:3px; padding:3px 6px; margin:0 3px; background:#10204460; }
  button:focus-visible{outline:2px solid var(--c-ink);outline-offset:3px}
  @media(max-width:650px){.town-hud{padding:16px}.location{padding:12px}.location strong{font-size:18px}.location p{font-size:10px}small{font-size:8px}.pause span{display:none}footer{left:16px;right:16px;bottom:12px;font-size:10px;gap:10px}}
</style>
