export const PARLOR_SAVE_KEY='rondo.parlor.v1';
interface ReadStorage {getItem(key:string):string|null}
interface WriteStorage {setItem(key:string,value:string):void}
/** How many times 一目元 has been talked to. Separate from chapter progress, which it never changes. */
export function readParlorTalks(storage?:ReadStorage):number{
 try{
  const raw=JSON.parse(storage?.getItem(PARLOR_SAVE_KEY)??'null');
  return raw?.version===1&&Number.isSafeInteger(raw.talks)&&raw.talks>=0?raw.talks:0;
 }catch{return 0;}
}
export function writeParlorTalks(storage:WriteStorage|undefined,talks:number):boolean{
 try{if(!storage)return false;storage.setItem(PARLOR_SAVE_KEY,JSON.stringify({version:1,talks}));return true;}catch{return false;}
}
