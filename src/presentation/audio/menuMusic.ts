import { busGain, DEFAULT_LEVELS } from '../../domain/audio/audioMixer';
import { audioPreferences, type AudioPreferences } from './audioPreferences';

export const MENU_MUSIC_URL = '/audio/music/title_theme.ogg';
export interface MenuMusic {
  unlock(): Promise<void>;
  setActive(active: boolean): void;
  setTitleScreen(title: boolean): void;
  dispose(): void;
}
interface Options {
  /** Optional decoded stage loop; defaults preserve menu playback. */
  url?: string;
  volume?: number;
  /** Stage pause resumes its position; menu navigation retains its restart behavior. */
  preservePosition?: boolean;
  preferences?: AudioPreferences;
  createContext?: () => AudioContext;
  fetchAudio?: () => Promise<ArrayBuffer>;
}

/** One decoded buffer avoids encoder padding / media-element seek gaps at every wrap. */
export function createMenuMusic(options: Options = {}): MenuMusic {
  let context: AudioContext | undefined;
  let mix: GainNode | undefined;
  let titleGain: GainNode | undefined;
  let titleScreen = false;
  let buffer: AudioBuffer | undefined;
  let playing: { source: AudioBufferSourceNode; envelope: GainNode } | undefined;
  let loading: Promise<void> | undefined;
  let offset = 0;
  let startedAt = 0;
  let levels = DEFAULT_LEVELS;
  let active = true;
  let unlocked = false;
  let disposed = false;
  const unsubscribe = (options.preferences ?? audioPreferences).subscribe(value => {
    levels = value;
    if (mix && context) mix.gain.setTargetAtTime(busGain(levels, 'music'), context.currentTime, .02);
  });

  function start() {
    if (disposed || !active || !unlocked || !buffer || !context || !titleGain || playing) return;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(envelope);
    envelope.connect(titleGain);
    envelope.gain.setValueAtTime(0, context.currentTime);
    envelope.gain.linearRampToValueAtTime(1, context.currentTime + .6);
    source.onended = () => { source.disconnect(); envelope.disconnect(); };
    startedAt = context.currentTime;
    if (options.preservePosition) source.start(0, offset);
    else source.start();
    playing = { source, envelope };
  }
  function stop() {
    if (!playing || !context) return;
    const { source, envelope } = playing;
    if (options.preservePosition && buffer)
      offset = (offset + context.currentTime - startedAt) % buffer.duration;
    // A fresh envelope per source allows a rapid return without stale fade/stop timers.
    envelope.gain.cancelAndHoldAtTime(context.currentTime);
    envelope.gain.linearRampToValueAtTime(0, context.currentTime + .35);
    source.stop(context.currentTime + .35);
    playing = undefined;
  }
  async function unlock() {
    if (disposed || !active) return;
    try {
      if (!context) {
        if (!options.createContext && typeof AudioContext === 'undefined') return;
        context = options.createContext ? options.createContext() : new AudioContext();
        mix = context.createGain();
        mix.gain.value = busGain(levels, 'music');
        mix.connect(context.destination);
        titleGain = context.createGain();
        titleGain.gain.value = (titleScreen ? .25 : 1) * (options.volume ?? 1);
        titleGain.connect(mix);
      }
      // Called directly in the input handler, before the first await, for autoplay policy.
      await context.resume();
      if (disposed) return;
      unlocked = true;
      if (!buffer && !loading) {
        const decoder = context;
        loading = (async () => {
          const data = options.fetchAudio ? await options.fetchAudio() : await fetch(options.url ?? MENU_MUSIC_URL).then(response => {
            if (!response.ok) throw new Error(`Menu music: HTTP ${response.status}`);
            return response.arrayBuffer();
          });
          if (disposed) return;
          const decoded = await decoder.decodeAudioData(data);
          if (!disposed) buffer = decoded;
        })().finally(() => { loading = undefined; });
      }
      await loading;
      start();
    } catch { /* A later menu action retries; unavailable audio never blocks navigation. */ }
  }
  return {
    unlock,
    setTitleScreen(value) {
      if (disposed || titleScreen === value) return;
      titleScreen = value;
      if (!titleGain || !context) return;
      // Independent from user volume and playback fades; keep the same loop position.
      titleGain.gain.cancelAndHoldAtTime(context.currentTime);
      titleGain.gain.linearRampToValueAtTime((value ? .25 : 1) * (options.volume ?? 1), context.currentTime + .8);
    },
    setActive(value) { active = value; if (active) start(); else stop(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      playing = undefined;
      buffer = undefined;
      if (context) void context.close().catch(() => {});
    },
  };
}
