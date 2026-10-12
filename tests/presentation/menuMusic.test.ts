import { describe, it, expect, vi } from 'vitest';
import { createMenuMusic } from '../../src/presentation/audio/menuMusic';
import { createAudioPreferences } from '../../src/presentation/audio/audioPreferences';

function fixture(options: { url?: string; volume?: number; preservePosition?: boolean } = {}) {
  const sources: any[] = [];
  const gains: any[] = [];
  const context = {
    currentTime: 12, state: 'running', destination: {},
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 159.968 }),
    createGain: () => { const node = { gain: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(node); return node; },
    createBufferSource: () => { const node = { buffer: null, loop: false, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(node); return node; },
  };
  const preferences = createAudioPreferences();
  const fetchAudio = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  const music = createMenuMusic({ ...options, preferences, createContext: () => context as unknown as AudioContext, fetchAudio });
  return { music, sources, gains, context, preferences, fetchAudio };
}

describe('menu music', () => {
  it('waits for user activation, loops one decoded source across menu pages, then fades out', async () => {
    const f = fixture();
    f.music.setActive(true);
    expect(f.sources).toHaveLength(0);
    await f.music.unlock();
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0].loop).toBe(true);
    f.music.setActive(true); await f.music.unlock();
    expect(f.sources).toHaveLength(1);
    f.music.setActive(false);
    expect(f.sources[0].stop).toHaveBeenCalledWith(12.35);
    f.music.setActive(true);
    expect(f.sources).toHaveLength(2);
    expect(f.fetchAudio).toHaveBeenCalledTimes(1);
    f.music.dispose();
    expect(f.context.close).toHaveBeenCalledTimes(1);
  });
  it('ducks the title without restarting and restores menu volume independently of preferences', async () => {
    const f = fixture(); await f.music.unlock();
    f.music.setTitleScreen(true);
    expect(f.gains[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(.25, 12.8);
    f.preferences.setLevel('music', .4);
    expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.4, 12, .02);
    f.music.setTitleScreen(false);
    expect(f.gains[1].gain.cancelAndHoldAtTime).toHaveBeenCalledTimes(2);
    expect(f.gains[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 12.8);
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0].stop).not.toHaveBeenCalled();
    f.music.dispose();
  });
  it('applies master, music and mute separately from the fade envelope', async () => {
    const f = fixture(); await f.music.unlock();
    f.preferences.setLevel('master', .5); f.preferences.setLevel('music', .4);
    expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 12, .02);
    f.preferences.setMuted(true);
    expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 12, .02);
    f.music.dispose();
  });
  it('does not start late audio after entering the game or disposing during decoding', async () => {
    for (const dispose of [false, true]) {
      const f = fixture();
      let resolve!: (buffer: unknown) => void;
      f.context.decodeAudioData.mockImplementation(() => new Promise(r => { resolve = r; }));
      const pending = f.music.unlock();
      await vi.waitFor(() => expect(resolve).toBeDefined());
      if (dispose) f.music.dispose(); else f.music.setActive(false);
      resolve({ duration: 159.968 }); await pending;
      expect(f.sources).toHaveLength(0);
      f.music.dispose();
    }
  });
  it('retries failed loading and blocked resume on a later user action', async () => {
    const f = fixture();
    f.fetchAudio.mockRejectedValueOnce(new Error('offline'));
    await f.music.unlock(); expect(f.sources).toHaveLength(0);
    f.context.resume.mockRejectedValueOnce(new Error('blocked'));
    await f.music.unlock(); expect(f.sources).toHaveLength(0);
    await f.music.unlock(); expect(f.sources).toHaveLength(1);
    f.music.dispose();
  });
});

it('can play a stage loop at the cue volume without changing title defaults', async () => {
  const f = fixture({ url: '/audio/music/palace_arcade.ogg', volume: .5 });
  await f.music.unlock();
  expect(f.gains[1].gain.value).toBe(.5);
  f.preferences.setLevel('music', .4);
  expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.4, 12, .02);
  f.music.dispose();
});

it('fetches the requested decoded stage URL', async () => {
  const response = { ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) };
  const fetchAudio = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchAudio);
  const f = fixture();
  const music = createMenuMusic({ url: '/audio/music/palace_arcade.ogg', createContext: () => f.context as unknown as AudioContext });
  try {
    await music.unlock();
    expect(fetchAudio).toHaveBeenCalledWith('/audio/music/palace_arcade.ogg', {signal:expect.any(AbortSignal)});
    expect(f.sources[0].loop).toBe(true);
  } finally { music.dispose(); f.music.dispose(); vi.unstubAllGlobals(); }
});

it('resumes a paused stage loop from the same decoded position', async () => {
  const f = fixture({ preservePosition: true }); await f.music.unlock();
  f.context.currentTime = 32; f.music.setActive(false);
  f.context.currentTime = 52; f.music.setActive(true);
  expect(f.sources[1].start).toHaveBeenCalledWith(0, 20);
  expect(f.fetchAudio).toHaveBeenCalledOnce();
  f.music.dispose();
});

it('prepares decoded BGM while inactive without waiting for autoplay or starting playback',async()=>{
 const f=fixture();f.music.setActive(false);
 let decode!:(buffer:unknown)=>void;
 f.context.decodeAudioData.mockImplementation(()=>new Promise(r=>{decode=r;}));
 const ready=vi.fn();const loading=f.music.prepare().then(ready);
 await vi.waitFor(()=>expect(decode).toBeDefined());expect(ready).not.toHaveBeenCalled();
 expect(f.context.resume).not.toHaveBeenCalled();expect(f.sources).toHaveLength(0);
 decode({duration:100});await loading;expect(ready).toHaveBeenCalledOnce();
 f.music.setActive(true);await f.music.unlock();expect(f.sources).toHaveLength(1);
 expect(f.fetchAudio).toHaveBeenCalledOnce();f.music.dispose();
});
it('reports preparation failures so Loading can offer retry',async()=>{
 const f=fixture();f.fetchAudio.mockRejectedValueOnce(new Error('HTTP 500'));
 await expect(f.music.prepare()).rejects.toThrow('HTTP 500');
 await f.music.prepare();expect(f.fetchAudio).toHaveBeenCalledTimes(2);f.music.dispose();
});

it('ducks BGM through nested overlays without restarting the loop or overriding mute',async()=>{
 const {acquireMusicDuck}=await import('../../src/presentation/audio/musicDucking');
 const f=fixture();await f.music.unlock();const first=acquireMusicDuck();const second=acquireMusicDuck();
 try{
  expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.35,12,.1);
  first();expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.35,12,.1);
  f.preferences.setMuted(true);expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0,12,.02);
  // Releasing the last duck glides back up; the player's unmute then applies at once.
  second();expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0,12,.1);
  f.preferences.setMuted(false);expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1,12,.02);
  expect(f.sources).toHaveLength(1);expect(f.sources[0].stop).not.toHaveBeenCalled();
 }finally{first();second();f.music.dispose();}
});
