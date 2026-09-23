<script lang="ts">
  import { untrack } from 'svelte';
  import type { PalaceRun } from '../../domain/palace/palaceRun';
  let {run,status,onPause,onResume,onRestart,onExit}:{run:PalaceRun;status:'playing'|'paused'|'finished';onPause:()=>void;onResume:()=>void;onRestart:()=>void;onExit:()=>void}=$props();
  const clock=(seconds:number)=>Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');
  let noticeAt = $state<number | null>(null);
  let previousCheckpoint = -1;
  $effect(() => {
    const checkpoint = run.checkpoint;
    if (checkpoint > previousCheckpoint) noticeAt = untrack(() => run.elapsed);
    if (checkpoint < previousCheckpoint) noticeAt = null;
    previousCheckpoint = checkpoint;
  });
  let defeated=$derived(run.guards.filter(g=>g.defeated).length);
</script>
<div class="palace-hud">
  <div class="play-hud" inert={status !== 'playing'}>
  <header><small>2D TRIAL / WHITE PALACE 1-1</small><h1>白色宮殿 <span>蒼穹迴廊</span></h1><div class="hp" aria-label={'生命 '+run.player.health+' / 3'}>{'♥'.repeat(Math.max(0,run.player.health))}<span>{'♡'.repeat(3-Math.max(0,run.player.health))}</span></div></header>
  <div class="score"><div><small>COINS</small><b>{run.collected.length}<em>/25</em></b></div><div><small>GUARDS</small><b>{defeated}<em>/8</em></b></div><div><small>TIME</small><b>{clock(run.elapsed)}</b></div><button onclick={onPause} onkeydown={e=>{if(e.key===' ')e.stopPropagation();}} aria-label="暫停關卡">Ⅱ</button></div>
  <aside><span>CHECKPOINT {String(run.checkpoint+2).padStart(2,'0')}</span><br/>{['宮殿入口','守衛迴廊','高塔之路','最後試煉'][run.checkpoint+1]}</aside>
  <footer><kbd>A D</kbd> 左右移動 <kbd>SPACE</kbd> 跳躍／二段跳 <kbd>J</kbd> 揮劍／空中鎖定盾衝 <kbd>ESC</kbd> 暫停</footer>
  {#if run.player.deadFor>0&&status==='playing'}<div class="respawn">返回檢查點…</div>{/if}
  {#if noticeAt !== null && run.elapsed - noticeAt < 2.6 && status === 'playing'}
    {#key run.checkpoint}<div class="checkpoint-notice" role="status"><span aria-hidden="true">◆</span><div><small>CHECKPOINT ACTIVATED</small><strong>紀錄點已啟動</strong></div></div>{/key}
  {/if}
  </div>
  {#if status==='paused'||status==='finished'}
    <div class="overlay"><div class="result-panel" tabindex="-1" role="dialog" aria-modal="true" aria-label={status==='paused'?'暫停選單':'過關結算'}>
      <small>WHITE PALACE / 1-1</small><h2>{status==='finished'?'STAGE CLEAR':'PAUSED'}</h2>
      <p>{status==='finished'?'穿越宮殿，向下一段旅程前進。':'旅程稍作停留。'}</p>
      {#if status==='finished'}<dl><div><dt>通關時間</dt><dd>{clock(run.elapsed)}</dd></div><div><dt>收集金幣</dt><dd>{run.collected.length} / 25</dd></div><div><dt>擊倒守衛</dt><dd>{defeated} / 8</dd></div><div><dt>重生次數</dt><dd>{run.deaths}</dd></div></dl>{/if}
      {#if status==='paused'}<button class="primary" onclick={onResume}>繼續遊戲 →</button>{/if}
      <button class:primary={status==='finished'} onclick={onRestart}>{status==='finished'?'再玩一次':'重新開始'}</button>
      <button onclick={onExit}>返回主選單 <span aria-hidden="true">↗</span></button>
      <div class="result-rule" aria-hidden="true">◆　PROJECT RONDO　◆</div>
    </div></div>
  {/if}
</div>
<style>
  .palace-hud{position:fixed;inset:0;pointer-events:none;color:var(--c-ink);font-family:var(--font-body);}
  header{position:absolute;left:28px;top:26px;padding:16px 24px 18px;border-left:4px solid var(--c-blue);background:var(--surface-glass);backdrop-filter:var(--surface-blur);clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);}
  small{font:700 10px var(--font-headline);letter-spacing:2px;}
  h1{font-size:22px;margin:8px 0;letter-spacing:2px;}h1 span{font-size:12px;margin-left:10px;font-weight:500;letter-spacing:1px;}
  .hp{color:var(--c-blue-deep);font-size:20px;letter-spacing:5px;line-height:1}.hp span{color:var(--c-ink);opacity:.4;}
  .score{position:absolute;right:28px;top:26px;display:flex;align-items:center;gap:24px;padding:14px 18px;background:var(--surface-glass);backdrop-filter:var(--surface-blur);border-top:2px solid var(--c-blue);}
  .score div{display:grid;gap:3px;text-align:right}.score b{font:700 27px var(--font-headline);font-variant-numeric:tabular-nums;}
  em{font-style:normal;font-size:12px;margin-left:5px;opacity:.65;}
  button{pointer-events:auto;border:1px solid color-mix(in srgb,var(--c-ink),transparent 78%);background:transparent;color:var(--c-ink);font:inherit;cursor:pointer;padding:12px 18px;transition:background .18s,border-color .18s;}
  button:hover,button:focus{background:rgb(var(--c-white-rgb));color:var(--c-blue-deep);border-bottom-color:var(--c-blue);}
  button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-ring-offset);box-shadow:var(--focus-halo);}
  aside{position:absolute;left:28px;top:168px;font-size:13px;line-height:1.8;background:var(--surface-glass);backdrop-filter:var(--surface-blur);padding:9px 16px;border-left:2px solid var(--c-blue);}
  aside span{font:700 10px var(--font-headline);letter-spacing:2px;}
  footer{position:absolute;bottom:0;left:0;right:0;text-align:center;padding:12px 16px;background:var(--surface-glass);backdrop-filter:var(--surface-blur);border-top:1px solid color-mix(in srgb,var(--c-blue),transparent 75%);font-size:11px;}
  kbd{font:700 11px var(--font-headline);display:inline-block;border:1px solid color-mix(in srgb,var(--c-ink),transparent 75%);padding:3px 6px;margin:0 5px 0 15px;}
  .overlay{position:absolute;inset:0;background:color-mix(in srgb,var(--c-pale),transparent 30%);display:grid;place-items:center;backdrop-filter:var(--surface-blur);pointer-events:auto;padding:20px;box-sizing:border-box;overflow:auto;}
  .result-panel{width:min(480px,100%);box-sizing:border-box;padding:38px;background:linear-gradient(135deg,var(--c-pale),var(--surface-glass));border-top:4px solid var(--c-blue);box-shadow:0 16px 80px color-mix(in srgb,var(--c-ink),transparent 86%);animation:appear .3s ease-out;}
  h2{font:400 42px var(--font-display);color:transparent;-webkit-text-stroke:1.2px var(--c-ink);letter-spacing:-1px;margin:16px 0;}p{font-size:14px;margin-bottom:26px;opacity:.75;}
  .result-panel button{display:flex;justify-content:space-between;width:100%;margin-top:10px;text-align:left;padding:14px 18px;border-bottom-width:2px;}.result-panel button.primary{background:rgb(var(--c-white-rgb));color:var(--c-blue-deep);border-bottom-color:var(--c-blue);}
  .result-rule{font:700 10px var(--font-headline);letter-spacing:3px;color:var(--c-blue-deep);margin-top:28px;text-align:center;}
  dl{margin:20px 0 28px}dl div{display:flex;justify-content:space-between;border-bottom:1px solid color-mix(in srgb,var(--c-ink),transparent 84%);padding:10px 0;font-size:14px;}dd{margin:0;font:700 16px var(--font-headline);font-variant-numeric:tabular-nums;}
  .respawn{position:absolute;inset:0;display:grid;place-items:center;background:var(--surface-glass);font-size:18px;letter-spacing:.2em;}
  .checkpoint-notice{position:absolute;top:142px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;padding:16px 28px;border-block:1px solid var(--c-blue);background:var(--surface-glass);backdrop-filter:var(--surface-blur);animation:notice .35s ease-out;}
  .checkpoint-notice>span{font-size:22px;color:var(--c-blue);}.checkpoint-notice small{display:block;font-size:9px;margin-bottom:4px;}.checkpoint-notice strong{font-size:17px;letter-spacing:3px;}
  @keyframes appear{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes notice{from{opacity:0;translate:0 -10px}to{opacity:1;translate:0 0}}
  @media(max-width:700px){header{left:12px;top:12px;padding:12px;}h1{font-size:17px;}h1 span{display:none}.score{right:12px;top:12px;gap:10px;padding:10px;}.score b{font-size:18px;}small{font-size:8px;letter-spacing:1px;}aside{left:12px;top:132px;}footer{font-size:10px;line-height:2;padding:6px 10px;}kbd{margin-left:6px;font-size:10px;}.result-panel{padding:24px;}.checkpoint-notice{top:215px;padding:12px 18px;white-space:nowrap;}}
  @media(max-width:440px){.score{top:111px;gap:14px;}.score div:first-child,.score div:nth-child(2){text-align:left;}aside{top:190px;}.checkpoint-notice{top:275px;}}
  @media(prefers-reduced-motion:reduce){.result-panel,.checkpoint-notice{animation:none;}button{transition:none;}}
</style>
