import {derived,writable} from 'svelte/store';
const owners=writable(0);
/** Temporary overlay attenuation; never persisted in the user's audio settings. */
export const musicDuckGain=derived(owners,count=>count>0?.35:1);
export function acquireMusicDuck():()=>void{
 owners.update(count=>count+1);let released=false;
 return()=>{if(released)return;released=true;owners.update(count=>count-1);};
}
/** A menu keeps its duck through its outro and any nested settings page. */
export function duckMusic(_node:HTMLElement){return {destroy:acquireMusicDuck()};}
