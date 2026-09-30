import { writable, type Readable } from 'svelte/store';
import { DEFAULT_LEVELS, type MixerLevels } from '../../domain/audio/audioMixer';

export type AudioLevelKey = Exclude<keyof MixerLevels, 'muted'>;
export interface AudioPreferences extends Readable<MixerLevels> {
  setLevel(key: AudioLevelKey, value: number): void;
  setMuted(muted: boolean): void;
  reset(): void;
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const STORAGE_KEY = 'project-rondo.audio-preferences.v1';
const LEVEL_KEYS: readonly AudioLevelKey[] = ['master', 'music', 'sfx', 'ambience'];

function readLevels(storage?: PreferenceStorage): MixerLevels {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LEVELS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_LEVELS };
    const value = parsed as Record<string, unknown>;
    if (typeof value.muted !== 'boolean' || !LEVEL_KEYS.every((key) =>
      typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1,
    )) return { ...DEFAULT_LEVELS };
    // Copy only known keys; the store never carries arbitrary properties from local storage.
    return { master: value.master as number, music: value.music as number,
      sfx: value.sfx as number, ambience: value.ambience as number, muted: value.muted };
  } catch {
    return { ...DEFAULT_LEVELS };
  }
}

/** A validated readable store. Without a storage adapter it remains an in-memory preference store. */
export function createAudioPreferences(storage?: PreferenceStorage): AudioPreferences {
  let current = Object.freeze(readLevels(storage));
  const { subscribe, set } = writable<MixerLevels>(current);
  const publish = (levels: MixerLevels) => {
    current = Object.freeze(levels);
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* Session settings still work. */ }
    set(current);
  };
  return {
    subscribe,
    setLevel(key, value) {
      if (!LEVEL_KEYS.includes(key) || !Number.isFinite(value)) return;
      publish({ ...current, [key]: Math.max(0, Math.min(1, value)) });
    },
    setMuted(muted) {
      if (typeof muted === 'boolean') publish({ ...current, muted });
    },
    reset() { publish({ ...DEFAULT_LEVELS }); },
  };
}

function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

export const audioPreferences = createAudioPreferences(browserStorage());
