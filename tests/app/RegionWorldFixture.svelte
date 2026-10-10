<script lang="ts">
 import {onMount} from 'svelte';
 import {REGION_PLACES,regionHeight,REGION_SPAWN} from '../../src/domain/region/regionLayout';
 import type {RegionPoint} from '../../src/domain/region/regionObjectives';
 let {paused,spawn=REGION_SPAWN,onReady,onFailure,onPosition,onPause}:{paused:boolean;waterRestored:boolean;spawn?:RegionPoint;onReady:()=>void;onFailure:(e:unknown)=>void;onPosition:(p:RegionPoint,label:string)=>void;onPause:()=>void}=$props();
 export function reset(){onPosition(REGION_SPAWN,'白色王城');}
 export function playCue(){}
 onMount(()=>{onPosition(spawn,'白色王城');if(!document.documentElement.hasAttribute('data-defer-region-ready'))onReady();});
</script>
<div data-world-paused={paused} data-spawn={JSON.stringify(spawn)}><button onclick={onReady}>fixture world ready</button><canvas data-game-entry></canvas>{#each REGION_PLACES as place}<button onclick={()=>onPosition({x:place.x,y:regionHeight(place.x,place.z)+1.3,z:place.z},place.name)}>fixture {place.id}</button>{/each}<button onclick={()=>onFailure(new Error('world failed'))}>fixture world fail</button><button onclick={()=>onPosition({x:14,y:20,z:-135},'airborne')}>fixture airborne</button><button onclick={onPause}>fixture hidden</button></div>
