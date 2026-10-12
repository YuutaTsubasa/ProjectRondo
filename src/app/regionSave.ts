import {CITY_JOURNEY_KEY} from '../domain/region/cityJourney';
import {createRegionProgress,validateRegionProgress,type RegionProgress} from '../domain/region/regionProgress';
import {REGION_SPAWN,isRegionPositionSafe,regionHeight} from '../domain/region/regionLayout';
import type {RegionPoint} from '../domain/region/regionObjectives';
export const REGION_SAVE_KEY='rondo.first-region.v1';
export interface RegionSave {readonly progress:RegionProgress;readonly position:RegionPoint}
interface ReadStorage {getItem(key:string):string|null}
interface WriteStorage {setItem(key:string,value:string):void}
/** One read for both the menu (is there a loadable slot?) and the world (where to resume). */
export function inspectRegionSave(storage?:ReadStorage):RegionSave&{readonly available:boolean}{
 const fallback=()=>({available:false,progress:createRegionProgress(),position:{...REGION_SPAWN}});
 try{
  const text=storage?.getItem(REGION_SAVE_KEY);if(!text)return fallback();
  const raw=JSON.parse(text);if(!raw||raw.version!==1)return fallback();
  const valid=validateRegionProgress(raw.progress);
  const p=raw.position;
  const position=p&&isRegionPositionSafe(p)&&Math.abs(p.y-regionHeight(p.x,p.z)-1.2)<.8?{x:p.x,y:regionHeight(p.x,p.z)+1.3,z:p.z}:{...REGION_SPAWN};
  return {available:valid!==null,progress:valid??createRegionProgress(),position};
 }catch{return fallback();}
}
export function readRegionSave(storage?:ReadStorage):RegionSave{
 const {progress,position}=inspectRegionSave(storage);return {progress,position};
}
export function writeRegionSave(storage:WriteStorage|undefined,save:RegionSave):boolean{
 try{if(!storage)return false;storage.setItem(REGION_SAVE_KEY,JSON.stringify({version:1,...save}));return true;}catch{return false;}
}
export function regionStorage():Storage|undefined{try{return window.localStorage;}catch{return;}}

/** Detect a usable auto-save without presenting corrupt data as a loadable chapter. */
export function hasRegionSave(storage?:ReadStorage):boolean{return inspectRegionSave(storage).available;}
/** Preserve the current slot before a new run; don't replace it until the new world saves. */
export function backupRegionSave(storage?:(ReadStorage&WriteStorage)):boolean{
 try{for(const key of [REGION_SAVE_KEY,CITY_JOURNEY_KEY]){const raw=storage?.getItem(key);if(raw)storage!.setItem(key+'.backup',raw);}return true;}catch{return false;}
}
