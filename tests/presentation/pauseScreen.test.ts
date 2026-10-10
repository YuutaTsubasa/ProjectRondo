// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import PauseScreen from '../../src/presentation/menu/PauseScreen.svelte';
beforeEach(()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));});
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
async function render(){
 const resume=vi.fn(),restart=vi.fn(),leave=vi.fn();
 app=mount(PauseScreen,{target:document.body,props:{onResume:resume,chapterTitle:'白潮原野',location:'白色王城',objective:'前往訊號站',tip:'沿著水道前進。',actions:[{label:'重新開始',english:'RESTART',run:restart},{label:'返回主選單',english:'MAIN MENU',run:leave}]}});
 await settle();return {resume,restart,leave,buttons:[...document.querySelectorAll('button')]};
}
function key(value:string,shiftKey=false){document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,cancelable:true}));}
it('focuses Continue and wraps arrows/Tab inside the modal',async()=>{
 const {buttons}=await render();expect(document.activeElement).toBe(buttons[0]);
 key('ArrowUp');expect(document.activeElement).toBe(buttons[3]);
 key('Tab');expect(document.activeElement).toBe(buttons[0]);
 key('Tab',true);expect(document.activeElement).toBe(buttons[3]);
 key('Home');expect(document.activeElement).toBe(buttons[0]);
 key('ArrowDown');expect(document.activeElement).toBe(buttons[1]);
});
it('consumes Escape and Tab so the session does not handle them a second time',async()=>{
 const {resume}=await render();const parent=vi.fn();window.addEventListener('keydown',parent);
 try{key('Escape');expect(resume).toHaveBeenCalledTimes(1);key('Tab');expect(parent).not.toHaveBeenCalled();}
 finally{window.removeEventListener('keydown',parent);}
});
it('connects real actions and omits play time when no timing data is supplied',async()=>{
 const {restart,leave,buttons}=await render();buttons[1].click();buttons[2].click();
 expect(restart).toHaveBeenCalledTimes(1);expect(leave).not.toHaveBeenCalled();
 expect(document.body.textContent).not.toContain('RUN TIME');expect(document.body.textContent).toContain('白色王城');
});

it('keeps the pause visible until exit finishes and accepts only one action',async()=>{
 const {resume,leave,buttons}=await render();
 vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();
 buttons[0].click();flushSync();buttons[2].click();key('Escape');
 expect(document.querySelector('.pause-screen.leaving')).not.toBeNull();
 expect(resume).not.toHaveBeenCalled();expect(leave).not.toHaveBeenCalled();
 vi.advanceTimersByTime(319);expect(resume).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(resume).toHaveBeenCalledTimes(1);expect(leave).not.toHaveBeenCalled();
});
it('cancels an outstanding navigation when the pause owner is destroyed',async()=>{
 const {leave,buttons}=await render();vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();
 buttons[2].click();await unmount(app!);app=undefined;vi.advanceTimersByTime(1000);
 expect(leave).not.toHaveBeenCalled();
});

it('opens settings while keeping gameplay paused and returns focus to Settings',async()=>{
 const {resume,buttons}=await render();buttons[3].click();await settle();expect(document.querySelector('.settings-screen')).not.toBeNull();expect(resume).not.toHaveBeenCalled();key('Escape');await settle();expect(document.querySelector('.settings-screen')).toBeNull();expect(document.activeElement).toBe(buttons[3]);expect(resume).not.toHaveBeenCalled();
});
