import {STAGE_CATALOG} from '../../src/content/stageCatalog';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {navigateUi} from '../../src/presentation/input/uiNavigation';
import MenuSubpages from '../../src/presentation/menu/MenuSubpages.svelte';
let app:ReturnType<typeof mount>;
afterEach(async()=>{await unmount(app);document.body.innerHTML='';vi.unstubAllGlobals();vi.useRealTimers();});
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.getAttribute('aria-label')===label||e.textContent?.includes(label))!;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
it('keeps settings inside the new-game flow and starts only from confirmation',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const action=vi.fn();app=mount(MenuSubpages,{target:document.body,props:{phase:'new-game',onAction:action}});await settle();
 button('繼續至遊戲設定').click();await settle();button('顯示與音效').click();await settle();expect(document.querySelector('.settings-screen')).not.toBeNull();
 document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();expect(document.querySelector('.settings-screen')).toBeNull();expect(action).not.toHaveBeenCalled();expect(document.activeElement).toBe(button('顯示與音效'));
 button('前往開始確認').click();await settle();expect(action).not.toHaveBeenCalled();button('確認開始新旅程').click();await settle();expect(action).toHaveBeenCalledWith('confirm-new');
});
it('shows saved progress and keeps the unavailable slot disabled',async()=>{
 app=mount(MenuSubpages,{target:document.body,props:{phase:'load-game',onAction:vi.fn(),saveAvailable:true,saveProgress:{version:1,chapter:'aqueduct',discoveries:['ridge'],completedExpeditions:['course']}}});await settle();expect(document.body.textContent).toContain('退潮之前');expect(document.querySelector('.save-details')?.textContent).toContain('1/ 3');expect(button('繼續旅程').disabled).toBe(false);
});
it('filters extras, selects without loading, and ignores repeated launch during the fade',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();const action=vi.fn();app=mount(MenuSubpages,{target:document.body,props:{phase:'extras',onAction:action}});flushSync();button('王城漫遊').click();flushSync();expect(document.querySelectorAll('.extra-options button')).toHaveLength(1);expect(action).not.toHaveBeenCalled();button('進入選擇內容').click();button('進入選擇內容').click();flushSync();expect(action).not.toHaveBeenCalled();vi.advanceTimersByTime(240);expect(action).toHaveBeenCalledExactlyOnceWith('town');
});

it('defaults every NEW GAME step to Continue or Start for controller confirmation',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const action=vi.fn();
 app=mount(MenuSubpages,{target:document.body,props:{phase:'new-game',onAction:action}});await settle();
 expect(document.activeElement).toBe(button('繼續至遊戲設定'));
 navigateUi('confirm');await settle();expect(document.activeElement).toBe(button('前往開始確認'));
 navigateUi('confirm');await settle();expect(document.activeElement).toBe(button('確認開始新旅程'));
 expect(action).not.toHaveBeenCalled();
 navigateUi('back');await settle();expect(document.activeElement).toBe(button('前往開始確認'));
 navigateUi('confirm');await settle();navigateUi('confirm');await settle();
 expect(action).toHaveBeenCalledExactlyOnceWith('confirm-new');
});

it.each(STAGE_CATALOG)('launches the actual selected $id definition from EXTRA',async(stage)=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const action=vi.fn(),choose=vi.fn();
 app=mount(MenuSubpages,{target:document.body,props:{phase:'extras',onAction:action,onStageSelect:choose}});await settle();
 const rows=[...document.querySelectorAll<HTMLButtonElement>('.extra-options button')];
 rows.find(row=>row.textContent?.includes(stage.title))!.click();await settle();
 expect(choose).not.toHaveBeenCalled();button('進入選擇內容').click();await settle();
 expect(choose).toHaveBeenCalledExactlyOnceWith(stage.id);expect(action).not.toHaveBeenCalled();
});
