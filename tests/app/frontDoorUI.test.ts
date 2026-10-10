// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../../src/app/App.svelte';
import {REGION_SAVE_KEY, readRegionSave} from '../../src/app/regionSave';
import GameFixture from './GameSessionFixture.svelte';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../src/app/loadGameSession', () => ({ loadGameSession: load }));
const music = vi.hoisted(() => ({ unlock: vi.fn().mockResolvedValue(undefined), setActive: vi.fn(), setTitleScreen: vi.fn(), dispose: vi.fn() }));
vi.mock('../../src/presentation/audio/menuMusic', () => ({ createMenuMusic: () => music }));
let app: ReturnType<typeof mount> | undefined;
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
const button = (name: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)!;
const key = (value: string, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key: value, repeat, bubbles: true, cancelable: true }));
async function confirmNew(){button('繼續至遊戲設定').click();await settle();button('前往開始確認').click();await settle();button('確認開始新旅程').click();await settle();}
async function render() { app = mount(App, { target: document.body }); await settle(); }
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; load.mockReset(); localStorage.clear(); vi.restoreAllMocks(); });

describe('title and main menu', () => {
  it('keeps the game unloaded until Start and ignores a held title key', async () => {
    load.mockResolvedValue({ default: GameFixture });
    await render();
    expect(load).not.toHaveBeenCalled();
    expect(music.setActive).toHaveBeenLastCalledWith(true);
    expect(music.setTitleScreen).toHaveBeenLastCalledWith(true);
    key('Enter', true); await settle();
    expect(button('進入主選單')).toBeTruthy();
    key('Enter'); await settle();
    expect(music.unlock).toHaveBeenCalled();
    expect(music.setTitleScreen).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(button('開始遊戲'));
    expect(load).not.toHaveBeenCalled();
    button('開始遊戲').click(); await settle();
    expect(load).not.toHaveBeenCalled();expect(document.body.textContent).toContain('旅程介紹');
    await confirmNew();
    expect(load).toHaveBeenCalledTimes(1);
    expect(music.setActive).toHaveBeenLastCalledWith(false);
    expect(document.querySelector('[role=status]')?.textContent).toContain('正在準備遊戲');
    expect(document.querySelector('[role=progressbar]')?.getAttribute('aria-label')).toBe('遊戲載入中');
    expect(document.querySelector('[role=progressbar]')?.hasAttribute('aria-valuenow')).toBe(false);
    button('fixture ready').click(); await settle();
    expect(document.querySelector('.front-door')).toBeNull();
    expect(document.activeElement).toBe(button('fixture ready'));
    expect(document.body.textContent).toContain('game fixture');
    expect(music.setActive).toHaveBeenLastCalledWith(false);
  });
  it('restores menu focus after settings and supports Escape back to Title', async () => {
    await render();
    button('進入主選單').click(); await settle();
    key('ArrowDown'); await settle();
    expect(document.activeElement).toBe(button('讀取遊戲'));
    key('ArrowDown'); await settle();
    expect(document.activeElement).toBe(button('額外內容'));
    key('ArrowDown'); await settle();
    expect(document.activeElement).toBe(button('設定'));
    button('設定').click(); await settle();
    expect(document.activeElement?.textContent).toContain('顯示');
    key('Escape'); await settle();
    expect(document.activeElement).toBe(button('設定'));
    key('Escape'); await settle();
    expect(document.activeElement).toBe(button('進入主選單'));
    expect(music.setTitleScreen).toHaveBeenLastCalledWith(true);
    expect(load).not.toHaveBeenCalled();
  });
  it('recovers from an import failure and from a scene startup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: GameFixture });
    await render(); button('進入主選單').click(); await settle(); button('開始遊戲').click(); await settle();await confirmNew();
    expect(document.querySelector('[role=alert]')?.textContent).toContain('遊戲載入失敗');
    button('重新載入 ↗').click(); await settle();
    expect(load).toHaveBeenCalledTimes(2);
    button('fixture fail').click(); await settle();
    expect(document.body.textContent).not.toContain('game fixture');
    expect(document.querySelector('[role=alert]')).not.toBeNull();
    button('← 返回主選單').click(); await settle();
    expect(document.activeElement).toBe(button('開始遊戲'));
    vi.restoreAllMocks();
  });
});
it.each([['course', '試玩第一關'], ['palace', '試玩 2D 關卡'], ['town', '白色王城']])('routes %s, retains it on retry, and disposes it on return to menu', async (entry, label) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: GameFixture });
  await render(); button('進入主選單').click(); await settle();
  button('額外內容').click(); await settle();
  button(label).click(); await settle();expect(load).not.toHaveBeenCalled();
  button('進入選擇內容').click();await settle();
  expect(load).toHaveBeenLastCalledWith(entry);
  button('重新載入 ↗').click(); await settle();
  expect(load).toHaveBeenLastCalledWith(entry);
  button('fixture ready').click(); await settle();
  button('fixture exit').click(); await settle();
  expect(document.body.textContent).not.toContain('game fixture');
  expect(document.activeElement).toBe(button('開始遊戲'));
  button('開始遊戲').click(); await settle();await confirmNew();
  expect(load).toHaveBeenLastCalledWith('region');
  vi.restoreAllMocks();
});

it('shows the requested five main entries and returns from EXTRA to its entry',async()=>{
 await render();button('進入主選單').click();await settle();
 expect([...document.querySelectorAll('nav .menu-button>span:last-child')].map(e=>e.textContent)).toEqual(['NEW GAME','LOAD GAME','EXTRA','SETTINGS','EXIT']);
 button('額外內容').click();await settle();expect(button('試玩第一關')).toBeTruthy();
 key('Escape');await settle();expect(document.activeElement).toBe(button('額外內容'));
});
it('keeps load unavailable without a save and does not import a scene',async()=>{
 await render();button('進入主選單').click();await settle();button('讀取遊戲').click();await settle();
 expect(button('繼續旅程').disabled).toBe(true);button('繼續旅程').click();await settle();expect(load).not.toHaveBeenCalled();
 key('Escape');await settle();expect(document.activeElement).toBe(button('讀取遊戲'));
});
it('requires confirmation for new game, backs up progress and preserves it until a scene can save',async()=>{
 const saved=JSON.stringify({version:1,progress:{version:1,chapter:'signal',discoveries:[],completedExpeditions:[]},position:{x:0,y:1.3,z:-35}});
 localStorage.setItem(REGION_SAVE_KEY,saved);load.mockResolvedValue({default:GameFixture});
 await render();button('進入主選單').click();await settle();button('開始遊戲').click();await settle();
 expect(load).not.toHaveBeenCalled();key('Escape');await settle();expect(localStorage.getItem(REGION_SAVE_KEY)).toBe(saved);
 button('開始遊戲').click();await settle();await confirmNew();
 expect(load).toHaveBeenCalledWith('region');expect(localStorage.getItem(REGION_SAVE_KEY+'.backup')).toBe(saved);expect(readRegionSave(localStorage).progress.chapter).toBe('signal');
});
it('continues saved progress through LOAD GAME',async()=>{
 const saved=JSON.stringify({version:1,progress:{version:1,chapter:'signal',discoveries:[],completedExpeditions:[]},position:{x:0,y:1.3,z:-35}});
 localStorage.setItem(REGION_SAVE_KEY,saved);load.mockResolvedValue({default:GameFixture});
 await render();button('進入主選單').click();await settle();button('讀取遊戲').click();await settle();
 expect(button('繼續旅程').disabled).toBe(false);button('繼續旅程').click();await settle();
 expect(load).toHaveBeenCalledWith('region');expect(localStorage.getItem(REGION_SAVE_KEY)).toBe(saved);
});
it('offers an explicit browser exit and a visible close fallback',async()=>{
 const close=vi.spyOn(window,'close').mockImplementation(()=>{});
 await render();button('進入主選單').click();await settle();button('離開遊戲').click();await settle();
 expect(close).not.toHaveBeenCalled();button('關閉遊戲').click();await settle();expect(close).toHaveBeenCalledOnce();
 expect(document.body.textContent).toContain('請手動關閉');key('Escape');await settle();expect(document.activeElement).toBe(button('離開遊戲'));
});

it('keeps the new-game review usable when backing up storage fails',async()=>{
 const saved=JSON.stringify({version:1,progress:{version:1,chapter:'signal',discoveries:[],completedExpeditions:[]},position:{x:0,y:1.3,z:-35}});
 localStorage.setItem(REGION_SAVE_KEY,saved);await render();button('進入主選單').click();await settle();button('開始遊戲').click();await settle();
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});await confirmNew();
 expect(load).not.toHaveBeenCalled();expect(document.querySelector('[role=alert]')?.textContent).toContain('無法保留');expect(document.querySelector('.inner-page')?.hasAttribute('inert')).toBe(false);
 write.mockRestore();load.mockResolvedValue({default:GameFixture});button('確認開始新旅程').click();await settle();expect(load).toHaveBeenCalledWith('region');
});
