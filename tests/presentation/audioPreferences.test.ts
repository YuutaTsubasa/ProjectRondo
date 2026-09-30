import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { DEFAULT_LEVELS } from '../../src/domain/audio/audioMixer';
import { createAudioPreferences } from '../../src/presentation/audio/audioPreferences';

function storage(initial: string | null = null) {
  let saved = initial;
  return {
    getItem: vi.fn((_key: string) => saved),
    setItem: vi.fn((_key: string, value: string) => { saved = value; }),
  };
}

describe('audio preferences', () => {
  it('constructs the browser singleton even when localStorage access itself throws', async () => {
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', {
      get() { throw new Error('SecurityError'); },
    }));
    try {
      vi.resetModules();
      const { audioPreferences } = await import('../../src/presentation/audio/audioPreferences');
      expect(get(audioPreferences)).toEqual(DEFAULT_LEVELS);
      audioPreferences.setLevel('master', 0.45);
      expect(get(audioPreferences).master).toBe(0.45);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('starts at default levels without storage, then publishes independent volume and mute changes', () => {
    const preferences = createAudioPreferences();
    expect(get(preferences)).toEqual(DEFAULT_LEVELS);
    preferences.setLevel('music', 0.35);
    preferences.setMuted(true);
    expect(get(preferences)).toEqual({ ...DEFAULT_LEVELS, music: 0.35, muted: true });
    preferences.setMuted(false);
    expect(get(preferences).music).toBe(0.35);
  });

  it('persists changes and restores them in a fresh store', () => {
    const saved = storage();
    const preferences = createAudioPreferences(saved);
    preferences.setLevel('master', 0.7);
    preferences.setLevel('ambience', 0.25);
    preferences.setMuted(true);
    expect(get(createAudioPreferences(saved))).toEqual({ ...DEFAULT_LEVELS, master: 0.7, ambience: 0.25, muted: true });
    expect(saved.setItem).toHaveBeenCalled();
  });

  it.each([
    'broken json', 'null', '[]', '{}',
    JSON.stringify({ ...DEFAULT_LEVELS, master: '0.5' }),
    JSON.stringify({ ...DEFAULT_LEVELS, music: -0.1 }),
    JSON.stringify({ ...DEFAULT_LEVELS, sfx: 1.1 }),
    JSON.stringify({ ...DEFAULT_LEVELS, ambience: null }),
    JSON.stringify({ ...DEFAULT_LEVELS, muted: 'false' }),
    '{"master":1e400,"music":1,"sfx":1,"ambience":1,"muted":false}',
  ])('falls back to the default mix for corrupt storage: %s', (raw) => {
    expect(get(createAudioPreferences(storage(raw)))).toEqual(DEFAULT_LEVELS);
  });

  it('keeps working when reading or writing browser storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota exceeded'); },
    };
    const preferences = createAudioPreferences(blocked);
    expect(get(preferences)).toEqual(DEFAULT_LEVELS);
    expect(() => preferences.setLevel('sfx', 0.2)).not.toThrow();
    expect(get(preferences).sfx).toBe(0.2);
    expect(() => preferences.reset()).not.toThrow();
    expect(get(preferences)).toEqual(DEFAULT_LEVELS);
  });

  it('bounds finite slider values and rejects nonfinite values before storage or subscribers see them', () => {
    const preferences = createAudioPreferences();
    preferences.setLevel('master', 2);
    preferences.setLevel('sfx', -0.5);
    preferences.setLevel('music', 0.6);
    for (const value of [NaN, Infinity, -Infinity]) preferences.setLevel('music', value);
    expect(get(preferences)).toEqual({ ...DEFAULT_LEVELS, sfx: 0, music: 0.6 });
  });

  it('reset restores and persists the complete default mix', () => {
    const saved = storage(JSON.stringify({ ...DEFAULT_LEVELS, master: 0.1, muted: true }));
    const preferences = createAudioPreferences(saved);
    preferences.reset();
    expect(get(preferences)).toEqual(DEFAULT_LEVELS);
    expect(get(createAudioPreferences(saved))).toEqual(DEFAULT_LEVELS);
  });
});
