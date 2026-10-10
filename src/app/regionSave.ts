import {createRegionProgress,parseRegionProgress,type RegionProgress} from '../domain/region/regionProgress';
import {REGION_SPAWN,isRegionPositionSafe,regionHeight} from '../domain/region/regionLayout';
import type {RegionPoint} from '../domain/region/regionObjectives';
export const REGION_SAVE_KEY='rondo.first-region.v1';
export interface RegionSave {readonly progress:RegionProgress;readonly position:RegionPoint}
interface ReadStorage {getItem(key:string):string|null}
interface WriteStorage {setItem(key:string,value:string):void}
export function readRegionSave(storage?:ReadStorage):RegionSave{
 const fallback=()=>({progress:createRegionProgress(),position:{...REGION_SPAWN}});
 try{
  const text=storage?.getItem(REGION_SAVE_KEY);if(!text)return fallback();
  const raw=JSON.parse(text);if(!raw||raw.version!==1)return fallback();
  const progress=parseRegionProgress(JSON.stringify(raw.progress));
  const p=raw.position;
  const position=p&&isRegionPositionSafe(p)&&Math.abs(p.y-regionHeight(p.x,p.z)-1.2)<.8?{x:p.x,y:regionHeight(p.x,p.z)+1.3,z:p.z}:{...REGION_SPAWN};
  return {progress,position};
 }catch{return fallback();}
}
export function writeRegionSave(storage:WriteStorage|undefined,save:RegionSave):boolean{
 try{if(!storage)return false;storage.setItem(REGION_SAVE_KEY,JSON.stringify({version:1,...save}));return true;}catch{return false;}
}
export function regionStorage():Storage|undefined{try{return window.localStorage;}catch{return;}}

/** Detect a usable auto-save without presenting corrupt data as a loadable chapter. */
export function hasRegionSave(storage?:ReadStorage):boolean{
 try{
  const raw=JSON.parse(storage?.getItem(REGION_SAVE_KEY)??'null');
  if(raw?.version!==1||!raw.progress)return false;
  const p=raw.progress,parsed=parseRegionProgress(JSON.stringify(p));
  return JSON.stringify(parsed)===JSON.stringify({version:p.version,chapter:p.chapter,discoveries:p.discoveries,completedExpeditions:p.completedExpeditions});
 }catch{return false;}
}
/** Preserve the current slot before a new run; don't replace it until the new world saves. */
export function backupRegionSave(storage?:(ReadStorage&WriteStorage)):boolean{
 try{const raw=storage?.getItem(REGION_SAVE_KEY);if(raw)storage!.setItem(REGION_SAVE_KEY+'.backup',raw);return true;}catch{return false;}
}
