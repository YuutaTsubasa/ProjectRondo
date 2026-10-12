<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>
<div class="controls">
  <button class:active={auto} aria-pressed={auto} onclick={onToggleAuto} title="自動播放">
    <span>AUTO</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l5 9-5 9H5L0 12Z" fill="currentColor" stroke="none"/><path d="m9 7 7 5-7 5Z" class="play"/></svg>
  </button>
  <button onclick={onToggleLog} title="回顧對話">
    <span>LOG</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v13H10l-5 4v-4H3Z"/><path d="M6 10h2m3 0h2m3 0h2"/></svg>
  </button>
  <button onclick={onSkip} title="快轉至下一個選項">
    <span>SKIP</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 5 8 7-8 7Zm10 0 8 7-8 7Zm10 0v14"/></svg>
  </button>
</div>
<style>
  .controls{position:absolute;z-index:5;top:max(15px,env(safe-area-inset-top));right:max(2.8cqw,env(safe-area-inset-right));display:flex;gap:clamp(12px,2.1cqw,36px);pointer-events:auto}
  button{position:relative;display:flex;align-items:center;justify-content:center;gap:11px;min-height:44px;padding:5px 7px;background:transparent;border:0;color:var(--avg-text);font:400 12px/1 var(--font-body);letter-spacing:.23em;cursor:pointer;text-shadow:0 1px 7px rgba(var(--avg-navy-rgb),1);transition:color .18s,filter .18s}
  svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;filter:drop-shadow(0 1px 5px rgba(var(--avg-navy-rgb),.8))}.play{fill:rgb(var(--avg-navy-rgb));stroke:none}
  button:hover,button.active{color:var(--avg-light);filter:drop-shadow(0 0 7px var(--avg-glow))}
  button.active:after{content:'';position:absolute;left:7px;right:7px;bottom:2px;height:1px;background:var(--avg-light);box-shadow:0 0 7px var(--avg-glow)}
  button:focus-visible{outline:2px solid var(--avg-light);outline-offset:3px;background:rgba(var(--avg-navy-rgb),.8)}
</style>
