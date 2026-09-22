<script lang="ts">
  import type { PalaceRun } from '../../domain/palace/palaceRun';
  let {run,status,onPause,onResume,onRestart,onExit}:{run:PalaceRun;status:'playing'|'paused'|'finished';onPause:()=>void;onResume:()=>void;onRestart:()=>void;onExit:()=>void}=$props();
  const clock=(seconds:number)=>Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');
  let defeated=$derived(run.guards.filter(g=>g.defeated).length);
</script>
<div class="palace-hud">
  <header><small>2D TRIAL / WHITE PALACE 1-1</small><h1>白色宮殿 <span>蒼穹迴廊</span></h1><div class="hp" aria-label={'生命 '+run.player.health+' / 3'}>{'♥'.repeat(Math.max(0,run.player.health))}<span>{'♡'.repeat(3-Math.max(0,run.player.health))}</span></div></header>
  <div class="score"><div><small>COINS</small><b>{run.collected.length}<em>/25</em></b></div><div><small>GUARDS</small><b>{defeated}<em>/8</em></b></div><div><small>TIME</small><b>{clock(run.elapsed)}</b></div><button onclick={onPause} onkeydown={e=>{if(e.key===' ')e.stopPropagation();}} aria-label="暫停關卡">Ⅱ</button></div>
  <aside><span>CHECKPOINT {String(run.checkpoint+2).padStart(2,'0')}</span><br/>{['宮殿入口','守衛迴廊','高塔之路','最後試煉'][run.checkpoint+1]}</aside>
  <footer><kbd>A D</kbd> 左右移動 <kbd>SPACE</kbd> 跳躍／二段跳 <kbd>J</kbd> 揮劍／空中鎖定盾衝 <kbd>ESC</kbd> 暫停</footer>
  {#if run.player.deadFor>0&&status==='playing'}<div class="respawn">返回檢查點…</div>{/if}
  {#if status==='paused'||status==='finished'}
    <div class="overlay"><div class="result-panel" tabindex="-1" role="dialog" aria-modal="true" aria-label={status==='paused'?'暫停選單':'過關結算'}>
      <small>WHITE PALACE / 1-1</small><h2>{status==='finished'?'STAGE CLEAR':'PAUSED'}</h2>
      <p>{status==='finished'?'穿越宮殿，向下一段旅程前進。':'旅程稍作停留。'}</p>
      {#if status==='finished'}<dl><div><dt>通關時間</dt><dd>{clock(run.elapsed)}</dd></div><div><dt>收集金幣</dt><dd>{run.collected.length} / 25</dd></div><div><dt>擊倒守衛</dt><dd>{defeated} / 8</dd></div><div><dt>重生次數</dt><dd>{run.deaths}</dd></div></dl>{/if}
      {#if status==='paused'}<button class="primary" onclick={onResume}>繼續遊戲 →</button>{/if}
      <button class:primary={status==='finished'} onclick={onRestart}>{status==='finished'?'再玩一次':'重新開始'}</button>
      <button onclick={onExit}>返回主選單</button>
    </div></div>
  {/if}
</div>
<style>
  .palace-hud{position:fixed;inset:0;pointer-events:none;color:#20344b;font-family:inherit;}
  header{position:absolute;left:28px;top:26px;padding:18px 24px;border-left:4px solid #447ea9;background:#f9fcf2ed;box-shadow:0 7px 30px #29486412;}
  small{font-size:10px;letter-spacing:.2em;font-weight:600;}
  h1{font-size:23px;margin:8px 0;}h1 span{font-size:12px;margin-left:10px;font-weight:500;}
  .hp{color:#5681a8;font-size:22px;letter-spacing:5px;line-height:1}.hp span{color:#8593a2}
  .score{position:absolute;right:28px;top:28px;display:flex;align-items:center;gap:25px;padding:12px 18px;background:#f9fcf2ed;}
  .score div{display:grid;gap:6px;text-align:right}.score b{font-size:25px;font-variant-numeric:tabular-nums;font-weight:500;}
  em{font-style:normal;font-size:12px;margin-left:5px;color:#74879a;}
  button{pointer-events:auto;border:1px solid #97aabb;background:#fff;color:#243b52;font:inherit;cursor:pointer;padding:12px 18px;}
  button:hover,button:focus-visible{background:#e3eff8;outline:2px solid #6097bf;outline-offset:3px;}
  aside{position:absolute;left:32px;top:172px;font-size:13px;line-height:1.8;text-shadow:0 1px 3px white;}aside span{font-size:10px;letter-spacing:.15em;}
  footer{position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:12px;color:#213f58;text-shadow:0 1px 4px #fff;}
  kbd{font-family:inherit;display:inline-block;background:#f9fcf2d9;padding:4px 6px;margin:0 5px 0 15px;}
  .overlay{position:absolute;inset:0;background:#cad8e1a6;display:grid;place-items:center;backdrop-filter:blur(9px);pointer-events:auto;}
  .result-panel{width:min(440px,88vw);padding:36px;background:#f8faf6f5;box-shadow:0 16px 80px #24415b22;animation:appear .3s ease-out;}
  h2{font-size:42px;font-weight:500;letter-spacing:.03em;margin:12px 0;}p{font-size:14px;color:#5e7287;margin-bottom:26px;}
  .result-panel button{display:block;width:100%;margin-top:10px;text-align:left;padding:14px 18px;}.result-panel button.primary{background:#294c69;color:white;border-color:#294c69;}
  dl{margin:20px 0 28px}dl div{display:flex;justify-content:space-between;border-bottom:1px solid #d9e1e7;padding:10px 0;font-size:14px;}dd{margin:0;font-variant-numeric:tabular-nums;}
  .respawn{position:absolute;inset:0;display:grid;place-items:center;background:#edf3f6a6;font-size:18px;letter-spacing:.2em;}
  @keyframes appear{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media(max-width:700px){header{left:12px;top:12px;padding:12px;}h1{font-size:17px;}h1 span{display:none}.score{right:12px;top:12px;gap:10px;padding:10px;}.score b{font-size:18px;}aside{left:16px;top:130px;}footer{font-size:10px;line-height:2;padding:0 12px;}kbd{margin-left:6px;}.result-panel{padding:24px;}}
  @media(prefers-reduced-motion:reduce){.result-panel{animation:none;}}
</style>
