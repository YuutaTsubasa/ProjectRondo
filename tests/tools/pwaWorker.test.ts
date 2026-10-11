import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';

function worker() {
 const events:Record<string,(event:any)=>void>={};
 const addAll=vi.fn().mockResolvedValue(undefined);
 const match=vi.fn().mockResolvedValue(new Response('offline'));
 const fetch=vi.fn().mockResolvedValue(new Response('online'));
 const skipWaiting=vi.fn();
 const claim=vi.fn();
 runInNewContext(readFileSync('tools/pwa/service-worker.js','utf8'),{
  self:{addEventListener:(name:string,fn:any)=>events[name]=fn,skipWaiting,clients:{claim},location:{origin:'https://rondo.test'}},
  caches:{open:async()=>({addAll}),match,keys:async()=>[],delete:vi.fn()},fetch,URL,Response,
 });
 return {events,addAll,match,fetch,skipWaiting,claim};
}
describe('online-first PWA worker',()=>{
 it('installs only the offline shell, without activating over a running game',async()=>{
  const w=worker();let pending!:Promise<void>;
  w.events.install({waitUntil:(p:Promise<void>)=>pending=p});await pending;
  expect(w.addAll.mock.calls[0][0]).toContain('/offline.html');
  expect(w.addAll.mock.calls[0][0].every((p:string)=>!p.match(/glb|vrm|mp3|assets/))).toBe(true);
  expect(w.skipWaiting).not.toHaveBeenCalled();
 });
 it('uses the current network page and falls back only when unreachable',async()=>{
  const w=worker();let response!:Promise<Response>;
  const e={request:{url:'https://rondo.test/',method:'GET',mode:'navigate'},respondWith:(p:Promise<Response>)=>response=p};
  w.events.fetch(e);expect(await (await response).text()).toBe('online');
  w.fetch.mockRejectedValueOnce(new Error('offline'));
  w.events.fetch(e);expect(await (await response).text()).toBe('offline');
 });
 it('does not intercept model/music/range requests',()=>{
  const w=worker();const respondWith=vi.fn();
  for(const url of ['/town/gate.glb','/audio/music.mp3','/assets/main.js'])
   w.events.fetch({request:{url:'https://rondo.test'+url,method:'GET',mode:'cors'},respondWith});
  expect(respondWith).not.toHaveBeenCalled();
 });
 it('activates an update only on the explicit command',()=>{
  const w=worker();w.events.message({data:{type:'OTHER'}});expect(w.skipWaiting).not.toHaveBeenCalled();
  w.events.message({data:{type:'ACTIVATE_UPDATE'}});expect(w.skipWaiting).toHaveBeenCalledOnce();
 });
});
