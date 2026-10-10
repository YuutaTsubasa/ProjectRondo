// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {get} from 'svelte/store';
import SettingsScreen from '../../src/presentation/settings/SettingsScreen.svelte';
import {displayPreferences} from '../../src/presentation/settings/displayPreferences';
import {audioPreferences} from '../../src/presentation/audio/audioPreferences';
let app:ReturnType<typeof mount>;
afterEach(async()=>{await unmount(app);document.body.innerHTML='';displayPreferences.reset();audioPreferences.reset();vi.unstubAllGlobals();vi.useRealTimers();});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.textContent?.trim()===text)!;
const change=(label:string,value:string)=>{const el=document.querySelector<HTMLInputElement|HTMLSelectElement>(`[aria-label="${label}"]`)!;el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));flushSync();};
function render(){const close=vi.fn();app=mount(SettingsScreen,{target:document.body,props:{onClose:close}});flushSync();return close;}
it('applies actual display and audio changes and only resets the selected category',()=>{
 render();change('亮度','125');change('渲染比例','0.75');expect(get(displayPreferences).brightness).toBe(125);expect(get(displayPreferences).renderScale).toBe(.75);
 document.querySelectorAll<HTMLButtonElement>('.category')[1].click();flushSync();change('整體音量','35');expect(get(audioPreferences).master).toBe(.35);
 button('F 恢復預設').click();flushSync();expect(get(displayPreferences).brightness).toBe(125);expect(get(audioPreferences).master).toBe(1);
 document.querySelectorAll<HTMLButtonElement>('.category')[2].click();flushSync();expect(document.querySelector('.coming')?.textContent).toContain('尚未開放');expect(document.querySelector('input')).toBeNull();
});
it('keeps the modal alive through its outro and consumes Escape before gameplay',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();const close=render();const parent=vi.fn();window.addEventListener('keydown',parent);
 try{document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));flushSync();expect(parent).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(document.querySelector('.leaving')).not.toBeNull();vi.advanceTimersByTime(320);expect(close).toHaveBeenCalledOnce();}finally{window.removeEventListener('keydown',parent);}
});
it('reports fullscreen failure instead of displaying a false selected state',async()=>{
 Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
 const request=vi.fn().mockRejectedValue(new Error('denied'));Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:request});
 render();button('全螢幕').click();await Promise.resolve();await Promise.resolve();flushSync();expect(request).toHaveBeenCalledOnce();expect(button('全螢幕').getAttribute('aria-pressed')).toBe('false');expect(document.querySelector('[role=status]')?.textContent).toContain('無法切換');
});
