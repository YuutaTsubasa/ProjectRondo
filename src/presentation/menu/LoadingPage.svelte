<script lang="ts">
 import FrontDoorArtwork from './FrontDoorArtwork.svelte';
 import LoadingScreen from './LoadingScreen.svelte';
 let {message='正在準備遊戲…'}:{message?:string}=$props();
</script>
<section class="loading-page" aria-label="載入畫面" aria-busy="true">
 <FrontDoorArtwork active loading />
 <LoadingScreen {message}/>
</section>
<style>
 .loading-page{position:fixed;inset:0;z-index:20;overflow:hidden;background:#d5e6fb;color:#173457;font-family:var(--font-body);pointer-events:auto;animation:enter .3s ease both}
 @keyframes enter{from{opacity:0}to{opacity:1}}
 @media(prefers-reduced-motion:reduce){.loading-page{animation:none}}
</style>
