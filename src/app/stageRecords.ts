import {STAGE_IDS,isStageId,type StageId} from '../domain/stage/stageIds';
export const STAGE_RECORDS_KEY='rondo.stage-records.v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
type Records=Partial<Record<StageId,number>>;
function local():StoragePort|undefined{try{return globalThis.localStorage;}catch{return undefined;}}
function read(storage:StoragePort|undefined):Records{
 try{const data=JSON.parse(storage?.getItem(STAGE_RECORDS_KEY)??'null');if(data?.version!==1)return {};const records:Records={};
 for(const stage of STAGE_IDS){const n=data.best?.[stage];if(typeof n==='number'&&Number.isFinite(n)&&n>0)records[stage]=n;}return records;
 }catch{return {};}
}
export function readStageBest(stage:string,storage=local()):number|null{return isStageId(stage)?read(storage)[stage]??null:null;}
/** Only called at a finished run, never at a checkpoint or on abandonment. */
export function recordStageClear(stage:string,seconds:number,storage=local()):void{
 if(!isStageId(stage)||!Number.isFinite(seconds)||seconds<=0)return;
 const best=read(storage);if(best[stage]!==undefined&&best[stage]! <= seconds)return;
 best[stage]=seconds;try{storage?.setItem(STAGE_RECORDS_KEY,JSON.stringify({version:1,best}));}catch{/* Play remains available when persistent storage is unavailable. */}
}
export function stageTime(seconds:number|null):string{
 if(seconds===null)return '—';const centis=Math.round(seconds*100),minutes=Math.floor(centis/6000),remainder=centis%6000;
 return `${String(minutes).padStart(2,'0')}:${String(Math.floor(remainder/100)).padStart(2,'0')}.${String(remainder%100).padStart(2,'0')}`;
}
