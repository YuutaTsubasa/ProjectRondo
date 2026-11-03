<script lang="ts">
 import {onMount} from 'svelte';
 let {onReady,onFailure,onExit,onComplete,exitLabel,stageId='course'}:{onReady:()=>void;onFailure:(e:unknown)=>void;onExit?:()=>void;onComplete?:()=>void;exitLabel?:string;stageId?:string}=$props();
 onMount(()=>onReady());
</script>
<div data-expedition={stageId}><button onclick={onComplete}>fixture clear</button><button onclick={onExit}>{exitLabel}</button><button onclick={()=>onFailure(new Error('expedition failed'))}>fixture expedition fail</button></div>
