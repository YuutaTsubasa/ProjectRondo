// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {scoreStage,PALACE_RANK_TIMES} from '../../src/domain/course/stageScore';
import StageResults from '../../src/presentation/course/StageResults.svelte';
let app:ReturnType<typeof mount>;
beforeEach(()=>vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
afterEach(async()=>{await unmount(app);document.body.innerHTML='';vi.unstubAllGlobals();vi.useRealTimers();});
const props={number:'1-1',title:'白色宮殿',subtitle:'蒼穹迴廊',description:'抵達末端閘門。',stats:[{label:'通關時間',english:'CLEAR TIME',value:'01:23',icon:'time'},{label:'收集金幣',english:'COINS',value:'12 / 25',icon:'coin'}],checks:[{label:'抵達末端閘門',complete:true},{label:'收集全部金幣',complete:false}],onRestart:vi.fn(),onExit:vi.fn(),exitLabel:'返回白潮原野'};
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
it('shows actual stats and focuses the region return, traps Tab and guards repeated choices',async()=>{
 const leave=vi.fn(),retry=vi.fn();app=mount(StageResults,{target:document.body,props:{...props,onExit:leave,onRestart:retry}});await settle();
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];expect(document.activeElement).toBe(buttons[0]);expect(buttons[0].textContent).toContain('返回白潮原野');
 expect(document.querySelector('dl')?.textContent).toContain('12 / 25');expect(document.querySelector('[data-complete="false"]')?.textContent).toContain('收集全部金幣');
 expect(document.body.textContent).not.toContain('NEW RECORD');expect(document.body.textContent).not.toContain('獲得獎勵');
 buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));expect(document.activeElement).toBe(buttons[1]);buttons[0].click();buttons[1].click();expect(leave).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
});
it('keeps result mounted during outro and runs retry once after the transition',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();const retry=vi.fn();app=mount(StageResults,{target:document.body,props:{...props,onRestart:retry,exitLabel:'返回主選單'}});flushSync();vi.advanceTimersByTime(0);
 const first=document.querySelector<HTMLButtonElement>('button')!;expect(first.textContent).toContain('重新挑戰');first.click();first.click();expect(retry).not.toHaveBeenCalled();vi.advanceTimersByTime(320);expect(retry).toHaveBeenCalledOnce();
});

it('renders the calculated rank and score instead of a decorative fixed S',async()=>{
 const score=scoreStage({elapsed:120,times:PALACE_RANK_TIMES,coins:0,coinTarget:25,enemies:0,enemyTarget:8,checkpoints:1,checkpointTarget:3,damage:1,falls:2});
 app=mount(StageResults,{target:document.body,props:{...props,score}});await settle();
 expect(document.querySelector('[aria-label="評級 D"]')).not.toBeNull();expect(document.querySelector('.score-value')?.textContent).toContain(String(score.total));
});
