import {writable} from 'svelte/store';
export interface DisplaySettings {renderScale:number;brightness:number;contrast:number;bloom:boolean;shadows:boolean;samples:1|2|4;}
export const DEFAULT_DISPLAY:Readonly<DisplaySettings>={renderScale:1,brightness:100,contrast:100,bloom:true,shadows:true,samples:4};
export function displayDefaults(userAgent:string):Readonly<DisplaySettings>{
 return /Android/i.test(userAgent)?{...DEFAULT_DISPLAY,renderScale:.75,samples:2,bloom:false}:DEFAULT_DISPLAY;
}
export const DISPLAY_STORAGE_KEY='project-rondo.display-preferences.v1';
type StorageAdapter=Pick<Storage,'getItem'|'setItem'>;
function valid(key:keyof DisplaySettings,value:unknown){
 if(key==='bloom'||key==='shadows')return typeof value==='boolean';
 if(typeof value!=='number'||!Number.isFinite(value))return false;
 if(key==='samples')return [1,2,4].includes(value);
 if(key==='renderScale')return [.5,.75,1].includes(value);
 return value>=50&&value<=150;
}
export function createDisplayPreferences(storage?:StorageAdapter,userAgent=''){
 const defaults=displayDefaults(userAgent);
 let current:DisplaySettings={...defaults};
 try{const saved=JSON.parse(storage?.getItem(DISPLAY_STORAGE_KEY)??'null');
  if(saved&&typeof saved==='object')for(const key of Object.keys(current) as (keyof DisplaySettings)[]){
   if(valid(key,saved[key]))Object.assign(current,{[key]:saved[key]});
  }
 }catch{/* Defaults remain available when storage is denied or corrupt. */}
 const {subscribe,set:publish}=writable<Readonly<DisplaySettings>>(Object.freeze(current));
 function save(next:DisplaySettings){current=Object.freeze(next);publish(current);try{storage?.setItem(DISPLAY_STORAGE_KEY,JSON.stringify(current));}catch{/* Session settings still work. */}}
 return {subscribe,set<K extends keyof DisplaySettings>(key:K,value:DisplaySettings[K]){
  if((key==='brightness'||key==='contrast')&&typeof value==='number'&&Number.isFinite(value))value=Math.max(50,Math.min(150,value)) as DisplaySettings[K];
  if(valid(key,value))save({...current,[key]:value});
 },reset(){save({...defaults});}};
}
function browserStorage(){try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
export const displayPreferences=createDisplayPreferences(browserStorage(),typeof navigator==='undefined'?'':navigator.userAgent);
