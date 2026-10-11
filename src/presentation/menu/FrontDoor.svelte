<script lang="ts">
  import {onMount} from 'svelte';
  import {mountMenuUiAudio} from '../audio/menuUiAudio';
  import InformationDialog from './InformationDialog.svelte';
  import {exitGame} from '../../app/exitGame';
  import {inputStatus} from '../input/deviceInput';
  import {inputHint} from '../input/hints';
  import type { FrontDoorAction, FrontDoorPhase } from '../../app/frontDoor';
  import MenuSubpages from './MenuSubpages.svelte';
  import type {RegionProgress} from '../../domain/region/regionProgress';
  import SettingsScreen from '../settings/SettingsScreen.svelte';
  import FrontDoorArtwork from './FrontDoorArtwork.svelte';
  import PwaControls from './PwaControls.svelte';
  import RondoWordmark from './RondoWordmark.svelte';
  import LoadingScreen from './LoadingScreen.svelte';

  let { phase, onAction, saveAvailable = false, saveProgress, menuError = '' }: { saveProgress?:RegionProgress; saveAvailable?: boolean; menuError?: string; phase: Exclude<FrontDoorPhase, 'game'>; onAction: (action: FrontDoorAction) => void } = $props();
  const menuEntries = [
    {action:'start', label:'開始遊戲', text:'NEW GAME', detail:'展開新的旅程'},
    {action:'load-game', label:'讀取遊戲', text:'LOAD GAME', detail:'讀取自動存檔'},
    {action:'extras', label:'額外內容', text:'EXTRA', detail:'試煉與王城漫遊'},
    {action:'settings', label:'設定', text:'SETTINGS', detail:'顯示與聲音設定'},
    {action:'exit', label:'離開遊戲', text:'EXIT', detail:'離開遊戲'},
  ] as const;
  const innerPage=$derived(phase==='new-game'||phase==='load-game'||phase==='extras');
  let exitError = $state('');
  let exitAttempt = $state(0);
  $effect(()=>{if(phase!=='exit')exitError='';});
  async function quit(){
    try{await exitGame(()=>onAction('title'));}
    catch{exitError='無法關閉遊戲，請再試一次，或取消返回選單。';exitAttempt++;}
  }
  let menuIndex = $state(0);
  let panel: HTMLElement;
  onMount(()=>mountMenuUiAudio(panel));
  let previous: FrontDoorPhase | undefined;
  let revealMenu = $state(false);
  $effect(() => {
    const returnAction = phase==='menu'?({settings:'settings',extras:'extras','load-game':'load-game','new-game':'start',exit:'exit'} as Partial<Record<FrontDoorPhase,string>>)[previous!]:undefined;
    revealMenu = previous === 'title' && phase === 'menu';
    previous = phase;
    if(phase==='exit')return; // The confirmation dialog owns focus.
    const target = returnAction ? `[data-action="${returnAction}"]` : '[data-initial]:not([disabled])';
    const timer = setTimeout(() => panel?.querySelector<HTMLElement>(target)?.focus({preventScroll:true}), 0);
    return () => clearTimeout(timer);
  });

  function keydown(event: KeyboardEvent) {
    if (innerPage || phase === 'exit' || phase === 'settings' || event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (phase === 'title' && !['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      event.preventDefault();
      onAction('activate');
    } else if (event.key === 'Escape' && ['menu', 'settings', 'extras', 'load-game', 'new-game', 'exit', 'error'].includes(phase)) {
      event.preventDefault(); onAction('back');
    } else if (['menu','extras'].includes(phase) && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('nav button')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus({preventScroll:true});
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<main data-input-scope class="front-door" class:is-loading={phase === 'loading'} class:is-settings={phase === 'settings'} class:is-inner={innerPage} class:is-title={phase === 'title'} class:is-panel={phase !== 'title' && phase !== 'menu' && phase !== 'exit' && phase !== 'loading'} class:reveal-menu={revealMenu} bind:this={panel}>
  <div class="art-reveal"><FrontDoorArtwork active={phase !== 'title'} loading={phase === 'loading'} settings={phase === 'settings'} inner={innerPage} /></div>
  {#if phase === 'title' || phase === 'menu' || phase === 'exit'}
    <div class="logo-lockup"><RondoWordmark /></div>
  {/if}
  {#key phase}
    <section class="content" inert={phase==='exit'} aria-label={phase === 'title' ? '標題畫面' : phase === 'settings' ? '遊戲設定' : phase === 'loading' ? '載入畫面' : '主選單'}>
      {#if phase === 'title'}
        <button class="begin" data-initial onclick={() => onAction('activate')} aria-label="進入主選單">
          <span class="begin-diamond" aria-hidden="true">✦</span>
          <span>{$inputStatus.device==='touch'?'TOUCH TO START':$inputStatus.device==='gamepad'?'PRESS ANY BUTTON':'PRESS ANY KEY'}<small>{$inputStatus.device==='touch'?'輕觸開始':$inputStatus.device==='gamepad'?'按任意按鈕開始':'按任意鍵開始'}</small></span>
        </button>
      {:else if phase === 'menu' || phase === 'exit'}
        <nav aria-label="主選單選項" style={`--selection:${menuIndex}`}>
          <div class="selection-ribbon" aria-hidden="true"></div>
          {#each menuEntries as entry, index}
            <button class="menu-button" class:selected={menuIndex === index}
              data-action={entry.action} data-initial={index === 0 ? '' : undefined} data-settings={entry.action === 'settings' ? '' : undefined}
              onfocus={() => menuIndex = index}
              onpointerenter={(event) => event.currentTarget.focus({preventScroll:true})}
              onclick={() => onAction(entry.action)} aria-label={entry.label}>
              <span class="menu-star" aria-hidden="true">✦</span><span>{entry.text}</span>
            </button>
          {/each}
        </nav>
        <p class="menu-caption">{menuEntries[menuIndex].detail}</p>
        <button class="back" data-ui-sound="back" onclick={() => onAction('back')}>← 返回標題</button>
      {:else if phase === 'extras' || phase === 'new-game' || phase === 'load-game'}
        <MenuSubpages {phase} {onAction} {saveAvailable} {saveProgress} {menuError}/>
      {:else if phase === 'settings'}
        <SettingsScreen onClose={() => onAction('back')}/>
      {:else if phase === 'loading'}
        <LoadingScreen />
      {:else}
        <div class="eyebrow">PROJECT RONDO</div>
        <h1 class="settings-title">稍等一下</h1>
        <p role="alert">遊戲載入失敗，請確認連線後再試一次。</p>
        <button class="menu-button primary" data-initial onclick={() => onAction('retry')}>重新載入 <span aria-hidden="true">↗</span></button>
        <button class="back" data-ui-sound="back" onclick={() => onAction('back')}>← 返回主選單</button>
      {/if}
      {#if menuError&&!innerPage}<p class="panel-copy" role="alert">{menuError}</p>{/if}
    </section>
  {/key}
  {#if phase === 'menu'}<PwaControls />{/if}
  <footer>
    <div class="footer-message"><span>A SMALL STEP.</span><span>FOR A WIDER WORLD.</span><i></i></div>
    <div class="footer-right"><span>{phase === 'menu' ? $inputStatus.device==='touch'?'輕觸選項 · 使用返回按鈕返回':`${inputHint('↑ ↓',$inputStatus)} 選擇　 ${inputHint('Enter',$inputStatus)} 確認　 ${inputHint('Esc',$inputStatus)} 返回` : phase === 'title' ? 'PROJECT RONDO' : phase === 'loading' ? '正在載入，請稍候' : `${inputHint('Esc',$inputStatus)} 返回`}</span><small>PROJECT RONDO · DEVELOPMENT BUILD</small></div>
  </footer>
  {#if phase==='exit'}
    {#key exitAttempt}
      <InformationDialog ariaLabel="離開遊戲確認" title="是否離開遊戲？"
        body={exitError||'已儲存的進度會保留。確認後將關閉 APP；網頁版會返回開始畫面。'}
        onClose={()=>onAction('back')}
        actions={[{label:'取消',english:'CANCEL',run:()=>onAction('back')},{label:'確定',english:'CONFIRM',run:()=>{void quit();},primary:true}]}/>
    {/key}
  {/if}
</main>

<style>
  .is-loading .content{inset:0;width:100%;max-width:none;min-width:0;animation:none}.is-loading footer{display:none}
  .front-door{--menu-row:clamp(34px,4.15cqh,48px);--menu-indent:8.3cqw;position:fixed;inset:0;z-index:10;overflow:clip;overscroll-behavior:none;background:#d5e6fb;color:#173457;font-family:var(--font-body)}
  .logo-lockup{position:absolute;top:25%;left:3.5%;width:31.5%;z-index:3;transition:left .65s cubic-bezier(.65,0,.2,1),top .65s cubic-bezier(.65,0,.2,1),transform .65s cubic-bezier(.65,0,.2,1)}
  .art-reveal{position:absolute;inset:0}
  .reveal-menu .content{animation:menu-enter .3s .2s both}
  .is-title footer{opacity:0}
  footer{transition:opacity .25s .3s}
  .is-title .logo-lockup{left:50%;top:43%;transform:translate(-50%,-50%)}
  .content{position:absolute;z-index:3;left:0;top:55%;width:26%;min-width:285px;animation:menu-enter .5s both}
  button{font:inherit;color:inherit;cursor:pointer;border:0}
  button:focus-visible{outline:2px solid #174bc9;outline-offset:4px}
  nav{position:relative;width:100%;isolation:isolate}
  .selection-ribbon{position:absolute;left:0;top:0;width:100%;height:var(--menu-row);transform:translateY(calc(var(--selection)*var(--menu-row)));transition:transform .22s cubic-bezier(.2,.8,.2,1);background:linear-gradient(100deg,#2559e6 4%,#4285fa 73%,#90c8ffb0 94%,#d5edff40);clip-path:polygon(0 0,100% 0,calc(100% - 13px) 100%,0 100%);pointer-events:none}
  .selection-ribbon:after{content:'';position:absolute;right:10px;top:0;width:5px;height:100%;background:#edf7ffb0;transform:skewX(-20deg);box-shadow:-9px 0 #edf7ff80}
  .menu-button{position:relative;display:flex;align-items:center;gap:14px;width:100%;height:var(--menu-row);padding:0 20px 0 var(--menu-indent);white-space:nowrap;background:transparent;text-align:left;font-size:clamp(13px,1.02cqw,19px);font-weight:400;letter-spacing:.23em;color:#4d6688;transition:color .15s}
  .menu-button.selected{color:white}
  .menu-star{position:absolute;left:calc(var(--menu-indent) - 28px);font-size:14px;opacity:0;transform:scale(.5);transition:opacity .18s,transform .18s}
  .selected .menu-star{opacity:1;transform:scale(1)}
  .menu-button:focus-visible{outline:none}.menu-button:focus-visible .menu-star{text-shadow:0 0 7px #fff}
  .menu-caption{margin:16px 0 0 var(--menu-indent);font-size:10px;line-height:1.5;letter-spacing:.12em;color:#39567b;white-space:nowrap}
  .back{margin:14px 0 0 var(--menu-indent);padding:5px 0;background:none;font-size:10px;letter-spacing:.13em;color:#4a6487}
  .back:hover{text-decoration:underline;text-underline-offset:4px}
  .begin{width:100%;min-height:64px;display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 16px;text-align:center;background:transparent;color:#264568;font:400 clamp(12px,1cqw,18px) var(--font-body);letter-spacing:.28em;white-space:nowrap}
  .begin-diamond{font-size:12px;color:#4478e8;animation:breathe 2.8s ease-in-out infinite}
  .begin small{display:block;font-size:9px;letter-spacing:.22em;margin-top:13px;color:#71839b}
  .begin:focus-visible{outline:none}.begin:focus-visible small{text-decoration:underline;text-underline-offset:4px}
  footer{position:absolute;left:2.4%;right:2.4%;bottom:3.3%;z-index:1;display:flex;justify-content:space-between;align-items:end;pointer-events:none;color:#f0f5ff;text-shadow:0 1px 6px #13273e;font:8px/1.8 var(--font-body);letter-spacing:.18em}
  .footer-message{position:relative;display:flex;flex-direction:column;color:#28466d;text-shadow:none}.footer-message i{position:absolute;left:calc(100% + 14px);bottom:5px;width:8cqw;height:1px;background:#28466d70}.footer-right{text-align:right}.footer-right span{display:block}.footer-right small{font:7px var(--font-body);letter-spacing:1px}
  .is-panel:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#f4f8ff 0%,#f4f8fff0 33%,#f4f8ff00 70%);pointer-events:none}
  .is-panel .content{top:20%;left:6%;width:360px;max-width:85cqw}
  .is-panel .back{margin-left:0;margin-top:18px}
  .panel-copy{font-size:13px;line-height:1.9;margin:20px 0;color:#39567b}
  .is-panel .back{display:block}
  .eyebrow{font:10px var(--font-body);letter-spacing:3px;margin-bottom:14px}
  .settings-title{font:400 clamp(30px,4cqw,60px)/1.1 Georgia,serif;letter-spacing:-.03em;margin:0 0 15px}
  [role=alert]{font-size:13px;line-height:1.8;margin-bottom:22px}
  .primary{color:white;background:#2863ed;padding-left:20px;font-size:14px;letter-spacing:1px}
  @keyframes breathe{50%{opacity:.35}}
  @keyframes menu-enter{from{opacity:0;translate:-14px 0}to{opacity:1;translate:0 0}}
  .is-title .content{position:absolute;left:50%;top:65%;width:340px;max-width:90%;min-width:0;transform:translateX(-50%);padding:0;animation:none}
  .is-title .logo-lockup{left:50%;top:43%;transform:translate(-50%,-50%)}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  .front-door.is-loading .content{inset:0;width:100%;max-width:none;min-width:0}
  .front-door.is-settings .content{position:static;inset:auto;width:auto;max-width:none;min-width:0;padding:0;animation:none}.is-settings:after,.is-settings footer{display:none}
  .front-door.is-inner .content{position:static;inset:auto;width:auto;max-width:none;min-width:0;padding:0;animation:none}.is-inner:after{display:none}.is-inner footer{z-index:4}.front-door:has(:global(.settings-screen)) footer{display:none}
</style>
