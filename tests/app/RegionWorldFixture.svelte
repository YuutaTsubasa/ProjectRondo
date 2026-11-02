<script lang="ts">
 import {onMount} from 'svelte';
 import {REGION_PLACES,regionHeight,REGION_SPAWN} from '../../src/domain/region/regionLayout';
 import type {RegionPoint} from '../../src/domain/region/regionObjectives';
 import {PARLOR_RETURN,PARLOR_SPAWN,PARLOR_HOST,PARLOR_EXIT} from '../../src/domain/town/mahjongParlor';
 let {interior=null,paused,spawn=REGION_SPAWN,spawnFacing,onReady,onFailure,onPosition,onPause}:{interior?:'parlor'|null;paused:boolean;waterRestored:boolean;spawn?:RegionPoint;spawnFacing?:{x:number;z:number};onReady:()=>void;onFailure:(e:unknown)=>void;onPosition:(p:RegionPoint,label:string)=>void;onPause:()=>void}=$props();
 export function reset(){onPosition(REGION_SPAWN,'白色王城');}
 export function playCue(){}
 onMount(()=>{if(interior)onPosition(PARLOR_SPAWN,'白石台麻館');else onPosition(spawn,'白色王城');if(!document.documentElement.hasAttribute('data-defer-region-ready'))onReady();});
</script>
<div data-world-paused={paused} data-interior={interior??'none'} data-spawn={JSON.stringify(spawn)} data-spawn-facing={JSON.stringify(spawnFacing??null)}><button onclick={onReady}>fixture world ready</button><canvas data-game-entry></canvas>{#each REGION_PLACES as place}<button onclick={()=>onPosition({x:place.x,y:regionHeight(place.x,place.z)+1.3,z:place.z},place.name)}>fixture {place.id}</button>{/each}<button onclick={()=>onFailure(new Error('world failed'))}>fixture world fail</button><button onclick={()=>onPosition({x:14,y:20,z:-135},'airborne')}>fixture airborne</button><button onclick={onPause}>fixture hidden</button><button onclick={()=>onPosition(PARLOR_RETURN,'白石街')}>fixture parlor door</button><button onclick={()=>onPosition({x:PARLOR_HOST.x-1.2,y:1.2,z:PARLOR_HOST.z},'白石台麻館')}>fixture parlor host</button><button onclick={()=>onPosition({x:PARLOR_EXIT.x,y:1.2,z:PARLOR_EXIT.z},'白石台麻館')}>fixture parlor exit</button></div>
