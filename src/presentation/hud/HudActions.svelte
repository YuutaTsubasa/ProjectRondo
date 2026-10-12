<script lang="ts">
 let {movement='WASD'}:{movement?:string}=$props();
</script>
<div class="actions" aria-label="鍵盤操作提示">
 <div class="action"><div class="icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 4 7-4-2-4 2Zm0 26-4-7 4 2 4-2ZM3 16l7-4-2 4 2 4Zm26 0-7 4 2-4-2-4Z"/></svg></div><kbd>{movement}</kbd><small>移動</small></div>
 <div class="action"><div class="icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m6 25 8-7 3-10 5 7 5 1M13 18l9 6M9 15l8-7M4 9l4-4 4 4M4 15l4-4 4 4"/><circle cx="19" cy="4" r="2"/></svg></div><kbd>SPACE</kbd><small>二段跳</small></div>
 <div class="action"><div class="icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m9 23 17-19-3 10-12 12M6 19l8 7M8 24l-4 5M6 5l6 2v6c0 4-6 7-6 7s-5-3-5-7V7Z"/></svg></div><kbd>J</kbd><small>揮劍／盾衝</small></div>
</div>
<style>
 .actions{position:absolute;right:max(65px,5.3cqw);bottom:calc(27px * var(--hud-scale,1));transform:scale(var(--hud-scale,1));transform-origin:right bottom;display:flex;gap:27px;color:#f5f9ff;text-shadow:0 1px 2px #0d264899;pointer-events:none}.action{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:66px}.icon{width:60px;height:60px;display:grid;place-items:center;border:1px solid #edf5ffb3;border-radius:50%;background:radial-gradient(circle,#152d4b66,#193e6422);box-shadow:inset 0 0 15px #d5e9ff15}.icon svg{width:36px;height:36px;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round}kbd{font:700 13px var(--font-body);letter-spacing:.3px;line-height:1.2;background:#eef6ff;color:#234775;padding:2px 6px;min-width:13px;text-align:center;text-shadow:none}small{font:400 12px var(--font-body);letter-spacing:.8px}
</style>
