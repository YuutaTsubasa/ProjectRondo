// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../../src/app/App.svelte';
import GameFixture from './GameSessionFixture.svelte';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../src/app/loadGameSession', () => ({ loadGameSession: load }));
let app: ReturnType<typeof mount> | undefined;
const settle = async () => { flushSync(); await new Promise(r => setTimeout(r, 0)); flushSync(); };
const button = (name: string) => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)!;
const key = (value: string, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key: value, repeat, bubbles: true, cancelable: true }));
async function render() { app = mount(App, { target: document.body }); await settle(); }
afterEach(async () => { if (app) await unmount(app); app = undefined; document.body.innerHTML = ''; load.mockReset(); });

describe('title and main menu', () => {
  it('keeps the game unloaded until Start and ignores a held title key', async () => {
    load.mockResolvedValue({ default: GameFixture });
    await render();
    expect(load).not.toHaveBeenCalled();
    key('Enter', true); await settle();
    expect(button('進入主選單')).toBeTruthy();
    key('Enter'); await settle();
    expect(document.activeElement).toBe(button('開始遊戲'));
    expect(load).not.toHaveBeenCalled();
    button('開始遊戲').click(); await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role=status]')?.textContent).toContain('正在準備遊戲');
    button('fixture ready').click(); await settle();
    expect(document.querySelector('.front-door')).toBeNull();
    expect(document.activeElement).toBe(button('fixture ready'));
    expect(document.body.textContent).toContain('game fixture');
  });
  it('restores menu focus after settings and supports Escape back to Title', async () => {
    await render();
    button('進入主選單').click(); await settle();
    key('ArrowDown'); await settle();
    expect(document.activeElement).toBe(button('設定'));
    button('設定').click(); await settle();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('整體音量');
    key('Escape'); await settle();
    expect(document.activeElement).toBe(button('設定'));
    key('Escape'); await settle();
    expect(document.activeElement).toBe(button('進入主選單'));
    expect(load).not.toHaveBeenCalled();
  });
  it('recovers from an import failure and from a scene startup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: GameFixture });
    await render(); button('進入主選單').click(); await settle(); button('開始遊戲').click(); await settle();
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