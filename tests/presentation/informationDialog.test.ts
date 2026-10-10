// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import InformationDialog from '../../src/presentation/menu/InformationDialog.svelte';
import {navigateUi} from '../../src/presentation/input/uiNavigation';
let app:ReturnType<typeof mount>|undefined;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false}));});
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
function render(count=2,onClose?:()=>void){
 const actions=Array.from({length:count},(_,i)=>({label:`選項 ${i+1}`,english:`ACTION ${i+1}`,run:vi.fn(),primary:i===count-1}));
 app=mount(InformationDialog,{target:document.body,props:{title:'旅程提示',body:'請選擇接下來的行動。',actions,onClose}});
 flushSync();vi.advanceTimersByTime(0);flushSync();return actions;
}
function key(value:string,shiftKey=false){const event=new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,cancelable:true});document.activeElement?.dispatchEvent(event);return event;}
it.each([1,2,3])('renders %i bilingual actions and names the dialog from its unique heading',count=>{
 render(count);const dialog=document.querySelector('[role="dialog"]')!;
 expect(dialog.getAttribute('aria-modal')).toBe('true');
 const titleId=dialog.getAttribute('aria-labelledby')!;expect(titleId).not.toBe('region-dialog-title');expect(document.getElementById(titleId)?.textContent).toBe('旅程提示');
 expect(document.querySelectorAll('button')).toHaveLength(count);
 for(let i=1;i<=count;i++){expect(document.body.textContent).toContain(`選項 ${i}`);expect(document.body.textContent).toContain(`ACTION ${i}`);}
 expect(document.querySelectorAll('button.primary')).toHaveLength(1);
});
it('keeps the dialog alive for 280 ms and accepts only one action across mouse and controller',()=>{
 const actions=render();const buttons=document.querySelectorAll<HTMLButtonElement>('button');buttons[1].click();flushSync();
 buttons[0].click();navigateUi('confirm');key('Enter');
 expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true');
 expect(actions[1].run).not.toHaveBeenCalled();vi.advanceTimersByTime(279);expect(actions[1].run).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(actions[1].run).toHaveBeenCalledTimes(1);expect(actions[0].run).not.toHaveBeenCalled();
});
it('does not dismiss on Escape or controller back when no close action was supplied',()=>{
 const actions=render(1),world=vi.fn();window.addEventListener('keydown',world);
 try{expect(key('Escape').defaultPrevented).toBe(true);navigateUi('back');vi.advanceTimersByTime(300);expect(actions[0].run).not.toHaveBeenCalled();expect(world).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('false');}
 finally{window.removeEventListener('keydown',world);}
});
it('shows an optional close button and dismisses once after Escape',()=>{
 const close=vi.fn();render(2,close);expect(document.querySelector('[aria-label="關閉提示訊息"]')).not.toBeNull();key('Escape');flushSync();document.querySelector<HTMLButtonElement>('[aria-label="關閉提示訊息"]')!.click();vi.advanceTimersByTime(280);expect(close).toHaveBeenCalledTimes(1);
});
it('wraps Tab, supports keyboard and controller navigation, and restores caller focus',async()=>{
 const caller=document.createElement('button');document.body.append(caller);caller.focus();render(3);
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];expect(document.activeElement).toBe(buttons[0]);
 key('Tab',true);expect(document.activeElement).toBe(buttons[2]);key('Tab');expect(document.activeElement).toBe(buttons[0]);
 key('ArrowRight');expect(document.activeElement).toBe(buttons[1]);navigateUi('next');expect(document.activeElement).toBe(buttons[2]);
 await unmount(app!);app=undefined;expect(document.activeElement).toBe(caller);
});
it('activates focused actions with Enter and skips the delay for reduced motion',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const actions=render(2);key('ArrowRight');key('Enter');expect(actions[1].run).toHaveBeenCalledTimes(1);expect(actions[0].run).not.toHaveBeenCalled();
});
it('cancels an unfinished action when the owner destroys the dialog',async()=>{
 const actions=render(1);document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click();await unmount(app!);app=undefined;vi.advanceTimersByTime(1000);expect(actions[0].run).not.toHaveBeenCalled();
});
