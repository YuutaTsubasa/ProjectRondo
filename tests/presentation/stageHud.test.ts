// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import PalaceHud from '../../src/presentation/palace/PalaceHud.svelte';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
import {PALACE_LAYOUT} from '../../src/domain/palace/palaceLayout';
let app:ReturnType<typeof mount>;
afterEach(async()=>{await unmount(app);document.body.innerHTML='';});
it('shows real palace health/coins and turns the side-view player marker left',()=>{
 const run=createPalaceRun();run.player.health=2;run.player.facing=-1;run.collected=[0,2];run.elapsed=3723;
 app=mount(PalaceHud,{target:document.body,props:{run,status:'playing',onPause:vi.fn(),onResume:vi.fn(),onRestart:vi.fn(),onExit:vi.fn()}});flushSync();
 expect(document.querySelector('[role=meter]')?.getAttribute('aria-valuenow')).toBe('2');
 expect(document.querySelector(`[aria-label="金幣 2 / ${PALACE_LAYOUT.coins.length}"]`)).not.toBeNull();
 expect(document.body.textContent).toContain('01:02:03');
 expect(document.querySelector('path.player')?.getAttribute('transform')).toContain('rotate(-90)');
 expect(document.body.textContent).not.toContain('Lv.');
});
it('pauses by Space without forwarding a jump to game input',()=>{
 const pause=vi.fn(),gameKey=vi.fn();window.addEventListener('keydown',gameKey);
 try{app=mount(PalaceHud,{target:document.body,props:{run:createPalaceRun(),status:'playing',onPause:pause,onResume:vi.fn(),onRestart:vi.fn(),onExit:vi.fn()}});flushSync();
 document.querySelector('button[aria-label="暫停關卡"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 expect(pause).toHaveBeenCalledExactlyOnceWith();expect(gameKey).not.toHaveBeenCalled();}finally{window.removeEventListener('keydown',gameKey);}
});
