import {expect,it} from 'vitest';
import {readParlorTalks,writeParlorTalks,PARLOR_SAVE_KEY} from '../../src/app/parlorSave';
it('round-trips the talk count under its own key',()=>{
 const memory=new Map<string,string>();const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}};
 expect(readParlorTalks(storage)).toBe(0);
 expect(writeParlorTalks(storage,3)).toBe(true);expect(readParlorTalks(storage)).toBe(3);
 expect([...memory.keys()]).toEqual([PARLOR_SAVE_KEY]);
});
it('treats missing, corrupt, blocked or implausible saves as never having talked',()=>{
 const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 expect(readParlorTalks()).toBe(0);expect(readParlorTalks(blocked)).toBe(0);expect(writeParlorTalks(blocked,1)).toBe(false);expect(writeParlorTalks(undefined,1)).toBe(false);
 for(const raw of ['{bad','null','{"version":2,"talks":4}','{"version":1,"talks":-1}','{"version":1,"talks":1.5}','{"version":1,"talks":"2"}'])
  expect(readParlorTalks({getItem:()=>raw})).toBe(0);
});
