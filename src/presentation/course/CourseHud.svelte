<script lang="ts">
  import type { CourseRun } from '../../domain/course/courseProgress';
  let { run, status, checkpointLabel, onPause, onResume, onRestart, onExit }: {
    run: CourseRun; status: 'playing' | 'paused' | 'finished'; checkpointLabel: string;
    onPause: () => void; onResume: () => void; onRestart: () => void; onExit: () => void;
  } = $props();
  let modal = $state<HTMLElement>();
  const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  $effect(() => {
    if (status === 'playing') return;
    const timer = setTimeout(() => modal?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(timer);
  });
  function pauseKey(event: KeyboardEvent) {
    if (event.key !== ' ') return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) onPause();
  }
  function trap(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const buttons = [...modal!.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    buttons[(index + (event.shiftKey ? buttons.length - 1 : 1) + buttons.length) % buttons.length]?.focus();
  }
</script>

<div class="course-hud" inert={status !== 'playing'}>
  <header>
    <div class="course-name"><small>TRIAL 01 / WINDWARD RUINS</small><strong>風起草原<span>遺跡之路</span></strong></div>
    <div class="timer"><small>TIME</small>{time(run.elapsed)}</div>
    <button class="pause" aria-label="暫停關卡" onclick={onPause} onkeydown={pauseKey}>Ⅱ <span>暫停</span></button>
  </header>
  <div class="progress"><span class="diamond" aria-hidden="true">◆</span><span><small>CHECKPOINT {String(run.checkpoint + 1).padStart(2, '0')}</small>{checkpointLabel}</span></div>
  <footer><span><kbd>W A S D</kbd> 移動 <kbd>SPACE</kbd> 跳躍／二段跳</span><span><kbd>J</kbd> 揮劍 · 空中鎖定時盾牌衝擊</span><span>點擊畫面轉動視角 · <kbd>ESC</kbd> 暫停</span></footer>
</div>
{#if status !== 'playing'}
  <div class="modal-backdrop">
    <div class="result" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title" tabindex="-1" bind:this={modal} onkeydown={trap}>
      <div class="eyebrow">{status === 'finished' ? 'WINDWARD RUINS / TRIAL 01' : 'TAKE A BREATH'}</div>
      <h1 id="course-dialog-title">{status === 'finished' ? 'STAGE CLEAR' : 'PAUSED'}</h1>
      <p>{status === 'finished' ? '穿越草原，抵達遺跡。' : '準備好了，就接著出發。'}</p>
      <div class="stats"><div><small>{status === 'finished' ? '通關時間' : '目前時間'}</small><strong>{time(run.elapsed)}</strong></div><div><small>失誤重試</small><strong>{String(run.falls).padStart(2, '0')}</strong></div></div>
      <nav aria-label="關卡操作">
        {#if status === 'paused'}<button onclick={onResume}>繼續遊戲 <span>↗</span></button>{/if}
        <button onclick={onRestart}>{status === 'finished' ? '再玩一次' : '重新開始'} <span>↗</span></button>
        <button onclick={onExit}>返回主選單 <span>↗</span></button>
      </nav>
      <div class="result-rule" aria-hidden="true">◆　PROJECT RONDO　◆</div>
    </div>
  </div>
{/if}

<style>
  .course-hud { position:fixed; inset:0; pointer-events:none; color:var(--c-ink); font-family:var(--font-body); padding:28px 32px; box-sizing:border-box; }
  header { display:flex; align-items:flex-start; gap:18px; }
  .course-name { padding:16px 24px; background:rgba(245,249,255,.91); border-left:4px solid var(--c-blue); box-shadow:0 8px 25px #10204414; backdrop-filter:blur(10px); }
  small { display:block; font-size:10px; letter-spacing:2px; margin-bottom:6px; }
  .course-name strong { font-size:22px; letter-spacing:3px; }.course-name strong span { font-size:12px; margin-left:15px; letter-spacing:1px; }
  .timer { margin-left:auto; text-align:right; color:white; font:32px var(--font-headline); text-shadow:0 2px 8px #102044; font-variant-numeric:tabular-nums; }
  button { font:inherit; cursor:pointer; }.pause { pointer-events:auto; border:1px solid #ffffff80; padding:12px 16px; color:var(--c-ink); background:#f4f7ffe8; border-radius:2px; }.pause span { font-size:12px; margin-left:8px; }
  .progress { position:absolute; top:142px; display:flex; align-items:center; gap:14px; color:white; text-shadow:0 2px 6px #102044; font-weight:600; font-size:15px; }.diamond { color:#97eaff; font-size:20px; }.progress small { opacity:.85; }
  footer { position:absolute; bottom:24px; left:32px; right:32px; display:flex; justify-content:center; flex-wrap:wrap; gap:12px 28px; color:white; font-size:12px; text-shadow:0 1px 5px #00192e; }kbd { font-family:var(--font-headline); border:1px solid #ffffff60; border-radius:3px; padding:3px 6px; margin:0 3px; background:#10204460; }
  .modal-backdrop { position:fixed; inset:0; display:grid; place-items:center; background:#10204470; backdrop-filter:blur(8px); padding:20px; overflow:auto; box-sizing:border-box; font-family:var(--font-body); z-index:5; }
  .result { width:min(520px,100%); box-sizing:border-box; background:linear-gradient(135deg,#f7faff,#e5edff); color:var(--c-ink); padding:42px; box-shadow:0 24px 90px #00102c40; border-top:5px solid var(--c-blue); animation:enter .3s ease-out both; }
  .eyebrow { color:var(--c-blue); font:700 11px var(--font-headline); letter-spacing:3px; }h1 { font:40px var(--font-display); line-height:1.08; margin:18px 0 12px; letter-spacing:-1px; }p { font-size:14px; opacity:.75; }
  .stats { display:grid; grid-template-columns:1fr 1fr; gap:20px; border-block:1px solid #183a702a; margin:28px 0 22px; padding:20px 0; }.stats strong { font:32px var(--font-headline); font-variant-numeric:tabular-nums; }.stats small { font-size:11px; letter-spacing:1px; }
  nav { display:grid; gap:8px; }nav button { color:var(--c-ink); border:1px solid #183a7020; border-bottom:2px solid #183a7030; padding:15px 18px; text-align:left; background:transparent; transition:background .15s,border-color .15s; display:flex; justify-content:space-between; }nav button:hover,nav button:focus { background:white; border-bottom-color:var(--c-blue); color:#0a1f6b; }button:focus-visible { outline:2px solid var(--c-ink); outline-offset:3px; }
  .result-rule { font:10px var(--font-headline); letter-spacing:3px; color:var(--c-blue); margin-top:28px; text-align:center; }
  @keyframes enter { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @media(max-width:650px) { .course-hud { padding:16px; }.course-name { padding:12px; }.course-name strong { font-size:16px; }.course-name strong span { display:none; }small { font-size:8px; }.timer { font-size:24px; }.pause span { display:none; }.progress { top:110px; }footer { left:16px; right:16px; bottom:12px; font-size:10px; gap:10px; }.result { padding:28px; }h1 { font-size:32px; } }
  @media(prefers-reduced-motion:reduce) { .result { animation:none; }nav button { transition:none; } }
</style>
