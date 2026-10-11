<script lang="ts">
 import {onMount} from 'svelte';
 import {pwaClient,pwaStatus} from '../../app/pwa';
 onMount(()=>{void pwaClient?.checkUpdate();});
</script>
<div class="pwa-controls">
 {#if $pwaStatus.installable}<button disabled={$pwaStatus.busy} onclick={()=>pwaClient?.install()}>↓ 安裝遊戲</button>{/if}
 {#if $pwaStatus.updateAvailable}<button disabled={$pwaStatus.busy} onclick={()=>pwaClient?.update()}>{$pwaStatus.busy?'更新中…':'新版本 · 更新並重新載入'}</button>{/if}
 {#if $pwaStatus.error}<p role="status">{$pwaStatus.error}</p>{/if}
</div>
<style>
 .pwa-controls{position:absolute;z-index:5;right:3%;top:4%;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:70%;font:500 12px var(--font-body)}
 button{font:inherit;letter-spacing:.1em;color:#173457;border:1px solid #a7c7f2;background:#f1f6ffed;padding:12px 18px;cursor:pointer;min-height:44px;box-shadow:0 3px 16px #14294518}
 button:hover{background:#fff}button:focus-visible{outline:2px solid #2863ed;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}p{background:#f1f6ff;padding:12px;max-width:24em;line-height:1.6;margin:0}
</style>
