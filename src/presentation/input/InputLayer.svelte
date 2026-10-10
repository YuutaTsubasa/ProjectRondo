<script lang="ts">
 import {onMount} from 'svelte';
 import {inputStatus} from './deviceInput';
 import {startInputRuntime} from './runtime';
 import TouchControls from './TouchControls.svelte';
 onMount(()=>{const stop=startInputRuntime();return()=>{stop();delete document.body.dataset.inputDevice;};});
 $effect(()=>{document.body.dataset.inputDevice=$inputStatus.device;});
</script>
{#if $inputStatus.device==='touch'&&$inputStatus.playing}<TouchControls camera={$inputStatus.camera} interact={$inputStatus.interact}/>{/if}
<style>
 :global(body[data-input-device=touch] kbd:has(.input-hint)){display:none}
 :global(body[data-input-device=touch] .pause-screen footer){display:none}
 :global(body[data-input-device=gamepad] button:focus),:global(body[data-input-device=gamepad] select:focus),:global(body[data-input-device=gamepad] input:focus),:global(body[data-input-device=gamepad] [role=button]:focus){outline:2px solid #b9ddff;outline-offset:4px;filter:drop-shadow(0 0 4px #579bff)}
 :global(body[data-input-device=touch] .stage-hud>.actions),:global(body[data-input-device=touch] .stage-hud .navigation>.pause){visibility:hidden}
</style>
