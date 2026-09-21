<script lang="ts">
  import type { FrontDoorAction, FrontDoorPhase } from '../../app/frontDoor';
  import { audioPreferences } from '../audio/audioPreferences';
  import { resolvePortrait } from '../dialogue/portraitLibrary';

  let { phase, onAction }: { phase: Exclude<FrontDoorPhase, 'game'>; onAction: (action: FrontDoorAction) => void } = $props();
  const channels = [
    { key: 'master', label: '整體音量', detail: 'MASTER' },
    { key: 'music', label: '背景音樂', detail: 'MUSIC' },
    { key: 'sfx', label: '音效', detail: 'SOUND EFFECTS' },
    { key: 'ambience', label: '環境音', detail: 'AMBIENCE' },
  ] as const;
  let panel: HTMLElement;
  let previous: FrontDoorPhase | undefined;
  $effect(() => {
    const returningFromSettings = previous === 'settings' && phase === 'menu';
    previous = phase;
    const target = returningFromSettings ? '[data-settings]' : '[data-initial]';
    const timer = setTimeout(() => panel?.querySelector<HTMLElement>(target)?.focus(), 0);
    return () => clearTimeout(timer);
  });

  function keydown(event: KeyboardEvent) {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (phase === 'title' && !['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      event.preventDefault();
      onAction('activate');
    } else if (event.key === 'Escape' && ['menu', 'settings', 'error'].includes(phase)) {
      event.preventDefault(); onAction('back');
    } else if (phase === 'menu' && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('nav button')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus();
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<main class="front-door" class:is-title={phase === 'title'} bind:this={panel}>
  <div class="orbital" aria-hidden="true"><div></div><span>✦</span></div>
  <header>
    <span class="wordmark">PROJECT RONDO<span class="brand-dot" aria-hidden="true">◆</span></span>
    <span class="screen-label">{phase === 'title' ? 'TITLE SCREEN' : phase === 'settings' ? 'PREFERENCES' : 'MAIN MENU'}</span>
  </header>

  <div class="composition">
    {#key phase}
    <section class="content" aria-label={phase === 'title' ? '標題畫面' : phase === 'settings' ? '遊戲設定' : '主選單'}>
      {#if phase === 'title'}
        <div class="eyebrow"><span aria-hidden="true">◆ ◆ ◆</span> PROJECT</div>
        <h1 class="game-title">RONDO<span class="title-dot" aria-hidden="true">.</span></h1>
        <div class="title-rule" aria-hidden="true"></div>
        <p class="tagline">STAY CURIOUS.</p>
        <button class="begin" data-initial onclick={() => onAction('activate')} aria-label="進入主選單">
          <span class="begin-diamond" aria-hidden="true">◆</span>
          <span>按任意鍵開始<small>PRESS ANY KEY</small></span>
          <span aria-hidden="true">→</span>
        </button>
      {:else if phase === 'menu'}
        <div class="eyebrow">YOUR NEXT CHAPTER</div>
        <h1 class="outline-title">MAIN<br />MENU</h1>
        <nav aria-label="主選單選項">
          <button class="menu-button" data-initial onpointerenter={(event) => event.currentTarget.focus({ preventScroll: true })} onclick={() => onAction('start')} aria-label="開始遊戲">
            <span class="number" aria-hidden="true">01</span><span>START<small>開始遊戲</small></span><span class="arrow" aria-hidden="true">↗</span>
          </button>
          <button class="menu-button" onpointerenter={(event) => event.currentTarget.focus({ preventScroll: true })} data-settings onclick={() => onAction('settings')} aria-label="設定">
            <span class="number" aria-hidden="true">02</span><span>SETTINGS<small>設定</small></span><span class="arrow" aria-hidden="true">↗</span>
          </button>
        </nav>
        <button class="back" onclick={() => onAction('back')}>← 返回標題</button>
      {:else if phase === 'settings'}
        <div class="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1 class="settings-title">SETTINGS</h1>
        <p class="section-note">聲音設定會自動儲存。</p>
        <div class="settings-panel">
          {#each channels as channel, index}
            <label class="volume-row">
              <span class="volume-label">{channel.label}<small>{channel.detail}</small></span>
              <output>{Math.round($audioPreferences[channel.key] * 100)}%</output>
              <input data-initial={index === 0 ? '' : undefined} type="range" min="0" max="100" step="1"
                aria-label={channel.label} value={Math.round($audioPreferences[channel.key] * 100)}
                oninput={(event) => audioPreferences.setLevel(channel.key, Number(event.currentTarget.value) / 100)} />
            </label>
          {/each}
          <label class="mute"><input type="checkbox" checked={$audioPreferences.muted} onchange={(event) => audioPreferences.setMuted(event.currentTarget.checked)} />靜音</label>
          <button class="reset" onclick={() => audioPreferences.reset()}>恢復預設</button>
        </div>
        <button class="back" onclick={() => onAction('back')}>← 返回主選單</button>
      {:else if phase === 'loading'}
        <div class="eyebrow">PROJECT RONDO</div>
        <h1 class="outline-title loading-title">LOADING</h1>
        <div class="loading-rail" aria-hidden="true"><span></span></div>
        <p role="status" data-initial tabindex="-1">正在準備遊戲…</p>
      {:else}
        <div class="eyebrow">PROJECT RONDO</div>
        <h1 class="settings-title">稍等一下</h1>
        <p role="alert">遊戲載入失敗，請確認連線後再試一次。</p>
        <button class="menu-button primary" data-initial onclick={() => onAction('retry')}>重新載入 <span aria-hidden="true">↗</span></button>
        <button class="back" onclick={() => onAction('back')}>← 返回主選單</button>
      {/if}
    </section>
    {/key}

    <figure class="hero" aria-label="角色主視覺">
      <span class="hero-index" aria-hidden="true">R / 01</span>
      <div class="hero-frame" aria-hidden="true"></div>
      <div class="hero-word" aria-hidden="true">RONDO</div>
      <img src={resolvePortrait('neutral')} alt="銀色鎧甲角色" draggable="false" />
      <figcaption><span>PROJECT RONDO</span><span aria-hidden="true">✦</span></figcaption>
    </figure>
    <aside aria-hidden="true"><span>STAY CURIOUS</span><span class="star">✦</span></aside>
  </div>
  <footer><span>{phase === 'title' ? '點擊畫面上的開始按鈕，或按任意鍵' : phase === 'menu' ? '↑ ↓ 選擇　 ENTER 確認　 ESC 返回' : phase === 'loading' ? '正在載入，請稍候' : 'ESC 返回'}</span><span>PROJECT RONDO</span></footer>
  <div class="ribbon" aria-hidden="true">
    <div class="ribbon-track">
      {#each [0, 1] as copy (copy)}
        <div class="ribbon-group">
          {#each [0, 1, 2] as item (item)}
            <span>PROJECT RONDO <b>✦</b> STAY CURIOUS <b>✦</b></span>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</main>

<style>
  .front-door { position:fixed; inset:0; z-index:10; box-sizing:border-box; overflow:auto; overflow-x:hidden; color:var(--c-ink); background:linear-gradient(118deg,var(--c-pale) 5%,color-mix(in srgb,var(--c-blue-soft),var(--c-pale) 70%) 70%,var(--c-blue-soft)); font-family:var(--font-body); display:flex; flex-direction:column; padding:28px 4.5vw 56px; }
  .front-door::after { content:''; position:fixed; inset:0; pointer-events:none; background:repeating-linear-gradient(0deg,transparent 0 4px,color-mix(in srgb,var(--c-blue),transparent 97%) 4px 5px); }
  header, footer { display:flex; align-items:center; justify-content:space-between; gap:20px; position:relative; z-index:1; font:700 12px var(--font-headline); letter-spacing:2px; }
  header { padding-bottom:18px; border-bottom:1px solid color-mix(in srgb,var(--c-ink),transparent 70%); }
  .wordmark { display:flex; align-items:center; gap:20px; }
  .brand-dot { color:var(--c-blue); font-size:9px; }
  .screen-label { font-size:10px; letter-spacing:3px; }
  .composition { flex:1; display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr) 32px; gap:4vw; align-items:center; position:relative; z-index:1; width:100%; max-width:1440px; margin:0 auto; padding:32px 0; box-sizing:border-box; }
    .content { min-width:0; animation:page-enter .38s cubic-bezier(.2,.75,.25,1) both; }
  .content > :global(*) { animation:item-enter .44s cubic-bezier(.2,.75,.25,1) both; }
  .content > :global(:nth-child(2)) { animation-delay:35ms; }
  .content > :global(:nth-child(3)) { animation-delay:70ms; }
  .content > :global(:nth-child(n+4)) { animation-delay:105ms; }
  .eyebrow { font:700 12px var(--font-headline); letter-spacing:4px; margin-bottom:18px; }
  .eyebrow span { color:var(--c-blue); margin-right:12px; letter-spacing:5px; }
  h1,p,figure { margin:0; }
  h1 { font-family:var(--font-display); font-weight:400; }
  .game-title { font-size:clamp(60px,10.5vw,160px); letter-spacing:-.065em; line-height:1; margin-left:-.04em; }
  .title-dot { color:var(--c-blue); }
  .title-rule { width:74px; height:5px; background:var(--c-blue); margin-top:24px; }
  .tagline { font:700 15px var(--font-headline); letter-spacing:6px; margin:22px 0 64px; }
  button { color:inherit; font-family:inherit; cursor:pointer; border:0; }
  button:focus-visible, input:focus-visible { outline:var(--focus-ring); outline-offset:var(--focus-ring-offset); box-shadow:var(--focus-halo); }
  .begin { display:flex; align-items:center; gap:24px; background:var(--surface-glass); border:1px solid var(--c-ink); padding:18px 24px; font-size:16px; font-weight:700; letter-spacing:3px; min-width:310px; text-align:left; transition:background .2s,transform .2s; }
  .begin:hover { background:var(--c-pale); transform:translateX(4px); }
  .begin small { display:block; font:700 10px var(--font-headline); margin-top:6px; letter-spacing:3px; }
  .begin-diamond { color:var(--c-blue); animation:breathe 2.8s ease-in-out infinite; }
  .outline-title { color:transparent; -webkit-text-stroke:1.5px var(--c-ink); font-size:clamp(60px,7.6vw,110px); line-height:.9; letter-spacing:-.04em; margin-bottom:34px; }
  nav { max-width:440px; }
  .menu-button { width:100%; min-height:72px; padding:12px 20px; display:flex; gap:22px; align-items:center; text-align:left; background:transparent; font:700 25px var(--font-headline); letter-spacing:1px; border-bottom:1px solid color-mix(in srgb,var(--c-ink),transparent 75%); transition:background .18s,padding .18s,transform .18s; }
  .menu-button small { font:400 12px var(--font-body); margin-left:16px; letter-spacing:2px; }
  .menu-button.primary { background:rgb(var(--c-white-rgb)); color:var(--c-blue-deep); border-color:var(--c-blue); }
  .menu-button:focus { background:rgb(var(--c-white-rgb)); color:var(--c-blue-deep); border-color:var(--c-blue); padding-left:26px; }
  .number { font-size:11px; letter-spacing:1px; opacity:.8; }
  .arrow { margin-left:auto; font-size:25px; transition:transform .22s ease; }
  .menu-button:focus .arrow { transform:translate(3px,-3px); color:var(--c-blue); }
  .menu-button:active, .begin:active { transform:translateY(1px) scale(.985); }
  .back { padding:12px 0; margin-top:26px; background:transparent; font-size:12px; letter-spacing:1px; text-decoration:underline; text-underline-offset:5px; }
  .hero { height:min(67vh,720px); min-height:350px; position:relative; align-self:center; transition:transform .65s cubic-bezier(.2,.75,.25,1); }
  .is-title .hero { transform:translateX(10px); }
  .hero-frame { position:absolute; inset:7% 0 3%; border:1px solid var(--c-ink); background:linear-gradient(150deg,var(--surface-glass),transparent); clip-path:polygon(0 0,85% 0,100% 10%,100% 100%,15% 100%,0 90%); }
  .hero-word { position:absolute; writing-mode:vertical-rl; right:0; top:10%; font:400 clamp(58px,7vw,104px) var(--font-display); color:transparent; -webkit-text-stroke:1px color-mix(in srgb,var(--c-ink),transparent 70%); letter-spacing:-6px; }
  .hero img { position:absolute; inset:0; height:100%; width:100%; object-fit:contain; object-position:center bottom; filter:drop-shadow(0 15px 15px color-mix(in srgb,var(--c-ink),transparent 85%)); }
  .hero-index { position:absolute; top:1%; left:0; font:700 11px var(--font-headline); letter-spacing:4px; }
  figcaption { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--c-ink); color:rgb(var(--c-white-rgb)); font:700 10px var(--font-headline); letter-spacing:3px; }
  aside { height:60%; display:flex; flex-direction:column; justify-content:space-between; align-items:center; }
  aside>span:first-child { writing-mode:vertical-rl; font:400 25px var(--font-display); letter-spacing:1px; }
  .star { font-size:40px; }
  footer { font-size:10px; letter-spacing:1px; }
  .ribbon { position:fixed; bottom:0; left:0; right:0; height:30px; background:var(--c-blue); color:rgb(var(--c-white-rgb)); display:flex; align-items:center; overflow:hidden; z-index:2; white-space:nowrap; font:700 12px var(--font-headline); letter-spacing:3px; }
  .ribbon-track { display:flex; width:max-content; flex-shrink:0; animation:marquee 32s linear infinite; }
  .ribbon-group { display:flex; flex-shrink:0; align-items:center; justify-content:space-around; gap:38px; min-width:100vw; padding:0 19px; box-sizing:border-box; }
  .ribbon-group span { display:flex; align-items:center; gap:30px; }
  .ribbon-group b { font-weight:400; }
  .ribbon:hover .ribbon-track { animation-play-state:paused; }
  .orbital { position:absolute; right:8vw; top:5vh; width:70vh; height:70vh; border:1px solid color-mix(in srgb,var(--c-blue),transparent 85%); border-radius:50%; transform:rotate(-22deg); pointer-events:none; }
  .orbital div { height:100%; width:35%; margin:auto; border:1px solid color-mix(in srgb,var(--c-blue),transparent 85%); border-radius:50%; }
  .orbital span { position:absolute; left:7%; top:12%; font-size:32px; color:var(--c-blue); }
  .settings-title { font-size:clamp(32px,4.4vw,60px); letter-spacing:-.03em; margin-bottom:12px; }
  .section-note { font-size:12px; margin-bottom:24px; }
  .settings-panel { background:var(--surface-glass); padding:20px 24px; max-width:440px; border-left:3px solid var(--c-blue); }
  .volume-row { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:20px; }
  .volume-label { font-size:13px; font-weight:700; }
  .volume-label small { font:700 9px var(--font-headline); letter-spacing:1px; margin-left:10px; }
  output { font:700 12px var(--font-headline); }
  input[type=range] { width:100%; grid-column:1/-1; accent-color:var(--c-blue); margin:0; cursor:pointer; }
  .mute { font-size:13px; display:inline-flex; align-items:center; gap:8px; }
  input[type=checkbox] { accent-color:var(--c-blue); width:16px; height:16px; }
  .reset { float:right; background:transparent; text-decoration:underline; font-size:12px; padding:5px; }
  .loading-title { font-size:clamp(36px,5.5vw,82px); }
  .loading-rail { height:3px; background:var(--c-blue-soft); overflow:hidden; max-width:380px; margin-bottom:22px; }
  .loading-rail span { display:block; width:35%; height:100%; background:var(--c-blue); animation:loading 1.6s ease-in-out infinite; }
  [role=status], [role=alert] { font-size:14px; line-height:1.8; margin-bottom:22px; }
  @keyframes loading { from { transform:translateX(-100%); } to { transform:translateX(400%); } }
  @keyframes breathe { 50% { opacity:.35; } }
  @keyframes page-enter { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
  @keyframes item-enter { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  @media (max-width:760px) {
    .front-door { padding:20px 6vw 52px; }
    .composition { grid-template-columns:minmax(0,1fr) minmax(0,.65fr); gap:3vw; }
    aside { display:none; }
    .hero { height:52vh; min-height:260px; }
    .game-title { font-size:clamp(52px,12vw,90px); }
    .begin { min-width:0; width:100%; padding:14px; gap:12px; font-size:13px; letter-spacing:1px; }
    .begin small { font-size:8px; letter-spacing:1px; }
    .tagline { letter-spacing:3px; font-size:11px; margin-bottom:40px; }
    .outline-title { font-size:clamp(48px,11vw,80px); }
    .menu-button { padding:12px 10px; gap:10px; font-size:20px; }
    .menu-button small { display:block; margin:4px 0 0; font-size:11px; }
    .settings-panel { padding:16px; }
    .volume-label small { display:none; }
    .screen-label, footer>span:last-child { display:none; }
    .eyebrow { font-size:9px; letter-spacing:2px; }
  }
  @media (max-width:520px) {
    .composition { display:block; padding-top:36px; padding-bottom:30px; }
    .content { position:relative; z-index:1; max-width:100%; }
    .is-title .hero { transform:none; }
    .hero { position:absolute; inset:12% -12vw auto auto; width:70vw; height:60vh; opacity:.15; pointer-events:none; }
    .hero-frame, figcaption, .hero-index, .hero-word { display:none; }
    .game-title { font-size:20vw; }
    .tagline { margin-bottom:80px; }
    .outline-title { font-size:76px; }
    .settings-title { font-size:38px; }
    .settings-panel { background:var(--c-pale); }
    nav { max-width:100%; }
    .menu-button small { display:inline; margin-left:16px; }
    .loading-title { font-size:48px; }
    footer { font-size:9px; }
  }
  @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }
</style>