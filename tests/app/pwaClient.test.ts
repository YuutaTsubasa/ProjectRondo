// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {get} from 'svelte/store';
import {createPwaClient,pwaStatus} from '../../src/app/pwa';
function setup(firstInstall=false){
 const waiting={postMessage:vi.fn()};
 const registration=Object.assign(new EventTarget(),{waiting,active:firstInstall?null:{},installing:null,update:vi.fn()});
 const worker=Object.assign(new EventTarget(),{controller:firstInstall?null:{},register:vi.fn().mockResolvedValue(registration)});
 const host=new EventTarget();const reload=vi.fn();
 const client=createPwaClient(host as Window,worker as unknown as ServiceWorkerContainer,reload);
 return {client,worker,host,reload,waiting};
}
describe('PWA update consent',()=>{
 it('does not flash an update while the first install passes through waiting',async()=>{
  const s=setup(true);await s.client.ready;
  // setup() leaves a waiting worker; with no prior controller it is the first install, not an update.
  expect(get(pwaStatus).updateAvailable).toBe(false);
  s.client.update();expect(s.waiting.postMessage).not.toHaveBeenCalled();s.client.dispose();
 });
 it('offers a waiting update on a hard-refreshed page that has no controller',async()=>{
  const waiting={postMessage:vi.fn()};
  const registration=Object.assign(new EventTarget(),{waiting,active:{},installing:null,update:vi.fn()});
  const worker=Object.assign(new EventTarget(),{controller:null,register:vi.fn().mockResolvedValue(registration)});
  const client=createPwaClient(new EventTarget() as Window,worker as unknown as ServiceWorkerContainer,vi.fn());
  await client.ready;expect(get(pwaStatus).updateAvailable).toBe(true);
  client.update();expect(waiting.postMessage).toHaveBeenCalledWith({type:'ACTIVATE_UPDATE'});client.dispose();
 });
 it('does not offer a reload when first installation takes control',async()=>{
  const s=setup(true);await s.client.ready;s.worker.dispatchEvent(new Event('controllerchange'));
  expect(s.reload).not.toHaveBeenCalled();expect(get(pwaStatus).updateAvailable).toBe(false);s.client.dispose();
 });
 it('never reloads when another tab activates an update',async()=>{
  const s=setup();await s.client.ready;
  expect(get(pwaStatus).updateAvailable).toBe(true);
  s.worker.dispatchEvent(new Event('controllerchange'));
  expect(s.reload).not.toHaveBeenCalled();expect(get(pwaStatus).updateAvailable).toBe(true);
  s.client.update();expect(s.reload).toHaveBeenCalledOnce();s.client.dispose();
 });
 it('reloads only after the player requests the waiting update',async()=>{
  const s=setup();await s.client.ready;s.client.update();
  expect(s.waiting.postMessage).toHaveBeenCalledWith({type:'ACTIVATE_UPDATE'});
  expect(s.reload).not.toHaveBeenCalled();
  s.worker.dispatchEvent(new Event('controllerchange'));expect(s.reload).toHaveBeenCalledOnce();s.client.dispose();
 });
 it('does not show installation unless the browser supplies a prompt',async()=>{
  const s=setup();await s.client.ready;const prompt=vi.fn().mockResolvedValue(undefined);
  const event=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt,userChoice:Promise.resolve({outcome:'dismissed'})});
  s.host.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
  expect(get(pwaStatus).installable).toBe(true);await s.client.install();
  expect(prompt).toHaveBeenCalledOnce();expect(get(pwaStatus).installable).toBe(false);s.client.dispose();
 });
});
