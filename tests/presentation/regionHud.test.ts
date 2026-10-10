// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RegionHud from '../../src/presentation/region/RegionHud.svelte';
import { createRegionProgress } from '../../src/domain/region/regionProgress';
import { createInput } from '../../src/presentation/babylon/input';

it('preserves native Space activation on every HUD control without queuing a player jump', async () => {
  const onMap = vi.fn(), onPause = vi.fn(), onInteract = vi.fn(), input = createInput();
  const app = mount(RegionHud, { target: document.body, props: {
    progress: createRegionProgress(), position: { x: 0, y: 1.3, z: -35 },
    locationLabel: '王城', navigationId: 'signal', prompt: '接聽回聲管', notice: '', saveWarning: false,
    onMap, onPause, onInteract,
  } });
  try {
    flushSync();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      button.focus();
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(input.consumeJump()).toBe(false);
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      // jsdom has no native keyboard activation; native default remains unprevented above.
      button.click();
    }
    expect(onMap).toHaveBeenCalledOnce();expect(onPause).toHaveBeenCalledOnce();expect(onInteract).toHaveBeenCalledOnce();
  } finally { input.dispose(); await unmount(app); document.body.innerHTML = ''; }
});


it('shows the tracked destination and actual distance while decorative names stay hidden from accessibility',async()=>{
 const app=mount(RegionHud,{target:document.body,props:{
  progress:{...createRegionProgress(),chapter:'signal'},position:{x:0,y:1.3,z:-35},heading:180,playerHeading:90,
  locationLabel:'王城入口 · CITY GATE',navigationId:'signal',prompt:'',notice:'',saveWarning:false,
  onMap:()=>{},onPause:()=>{},onInteract:()=>{},
 }});
 try{
  flushSync();
  expect(document.querySelector('[aria-label="目前任務"]')?.textContent).toContain('調查回聲管的訊號');
  expect(document.querySelector('[aria-label="目前任務"]')?.textContent).toContain('82');
  expect(document.querySelector('[aria-label="鏡頭方位 180 度"]')).not.toBeNull();
  expect(document.querySelector('.player-heading')?.getAttribute('transform')).toBe('rotate(90)');
  expect(document.querySelector('.camera-heading')?.getAttribute('transform')).toBe('rotate(180)');
  const edge=document.querySelector('.location-marquee');
  expect(edge?.getAttribute('aria-hidden')).toBe('true');
  expect(edge?.textContent).toContain('白色王城白色王城白色王城');
  expect(edge?.textContent).not.toContain('CITY GATE');
 }finally{await unmount(app);document.body.innerHTML='';}
});

it('uses the actual region name outside town and omits navigation distance without a target',async()=>{
 const app=mount(RegionHud,{target:document.body,props:{
  progress:{...createRegionProgress(),chapter:'complete'},position:{x:65,y:1.3,z:-180},
  locationLabel:'潮音海岸 · TIDAL COAST',navigationId:null,prompt:'',notice:'',saveWarning:false,
  onMap:()=>{},onPause:()=>{},onInteract:()=>{},
 }});
 try{flushSync();expect(document.querySelector('.location-marquee')?.textContent).toContain('潮音海岸潮音海岸');
 expect(document.querySelector('.distance')).toBeNull();expect(document.body.textContent).toContain('自由探索');
 }finally{await unmount(app);document.body.innerHTML='';}
});

it.each([
 ['接聽回聲管 · 風原訊標','調查','風原訊標'],
 ['查看入口 · 白宮引水道','查看入口','白宮引水道'],
 ['記錄風景 · 潮音海灣','記錄風景','潮音海灣'],
])('presents an actionable label and target for %s without changing activation',async(prompt,action,target)=>{
 const interact=vi.fn(),notice='發現 潮音海灣 · 1/3 處風景';
 const app=mount(RegionHud,{target:document.body,props:{progress:createRegionProgress(),position:{x:0,y:1.3,z:0},locationLabel:'白色王城',navigationId:'signal',prompt,notice,saveWarning:false,onMap:()=>{},onPause:()=>{},onInteract:interact}});
 try{flushSync();const button=document.querySelector<HTMLButtonElement>('.interact')!;
  expect(button.querySelector('.interact-action')?.textContent).toBe(action);
  expect(button.querySelector('.interact-target')?.textContent).toBe(target);
  expect(button.getAttribute('aria-label')).toBe(prompt);
  expect(button.querySelector('kbd')?.textContent).toBe('E');button.click();expect(interact).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(notice);
 }finally{await unmount(app);document.body.innerHTML='';}
});
