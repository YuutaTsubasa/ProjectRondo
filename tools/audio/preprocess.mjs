/**
 * Turns the raw downloaded audio into the game's shipped `public/audio/` set.
 *
 * Run it, don't hand-convert: every cut point, gain and loop below is a measurement of a specific
 * source file, and re-deriving them by ear is how the set drifts out of balance. Re-run after
 * replacing any source and the whole set stays internally consistent.
 *
 *   node tools/audio/preprocess.mjs [sourceDir]        # default: ~/Downloads
 *
 * Needs **ffmpeg** (libvorbis) — only to encode; every cut, fade, mixdown and loop below is done
 * here in plain JS so the recipe is readable rather than buried in a filter graph. On Windows a
 * winget install does not reach an already-running shell's PATH snapshot, so set FFMPEG to the full
 * path when a bare `ffmpeg` is not found.
 *
 * The two music tracks are **copied, not transcoded**: both sources are already 64 kbps MP3, so a
 * re-encode to Vorbis would add a second generation of lossy artefacts to spend roughly the same
 * number of bytes. Their loop seam (MP3 encoder padding) is left as-is — it lands once per 7-8
 * minute track, which is a different order of problem from a 1-second ambience bed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = process.argv[2] ?? join(homedir(), 'Downloads');
const OUT = join(ROOT, 'public', 'audio');

const FFMPEG =
  process.env.FFMPEG ??
  [
    'ffmpeg',
    join(
      homedir(),
      'AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'ffmpeg-9.0.1-full_build/bin/ffmpeg.exe',
    ),
  ].find((c) => {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });

// ---------------------------------------------------------------- WAV in/out

/** Decodes a 16-bit PCM RIFF/WAVE file into per-channel Float32 in [-1, 1]. */
function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error(`${path}: not a RIFF/WAVE file`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ')
      fmt = {
        tag: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    else if (id === 'data') data = buf.subarray(body, Math.min(body + size, buf.length));
    off = body + size + (size % 2); // RIFF chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt/data chunk`);
  if (fmt.tag !== 1 || fmt.bits !== 16)
    throw new Error(`${path}: expected 16-bit PCM, got tag=${fmt.tag} bits=${fmt.bits}`);
  const frames = Math.floor(data.length / 2 / fmt.channels);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < fmt.channels; c++)
      channels[c][i] = data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
  return { rate: fmt.rate, channels };
}

/** Writes 32-bit float WAV — the handoff to ffmpeg, so the DSP above is never requantized twice. */
function writeWavF32(path, { rate, channels }) {
  const n = channels[0].length;
  const ch = channels.length;
  const bytes = n * ch * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * ch * 4, 28);
  buf.writeUInt16LE(ch * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) buf.writeFloatLE(channels[c][i], 44 + (i * ch + c) * 4);
  writeFileSync(path, buf);
}

// ------------------------------------------------------------------- helpers

const dbToGain = (db) => Math.pow(10, db / 20);

const cut = ({ rate, channels }, from, to) => ({
  rate,
  channels: channels.map((c) => c.slice(Math.round(from * rate), Math.round(to * rate))),
});

/** Downmix to one channel. Mandatory for anything spatial: a stereo buffer cannot be panned. */
const toMono = ({ rate, channels }) => {
  if (channels.length === 1) return { rate, channels };
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of channels) s += c[i];
    out[i] = s / channels.length;
  }
  return { rate, channels: [out] };
};

/** Linear fades. Every cut edge gets one — an abrupt edge on a non-zero sample is an audible click. */
function fade({ rate, channels }, inSec, outSec) {
  const n = channels[0].length;
  const fi = Math.round(inSec * rate);
  const fo = Math.round(outSec * rate);
  for (const c of channels) {
    for (let i = 0; i < fi && i < n; i++) c[i] *= i / fi;
    for (let i = 0; i < fo && i < n; i++) c[n - 1 - i] *= i / fo;
  }
  return { rate, channels };
}

/**
 * Scales so the loudest sample sits at `db`. Every one-shot is normalized to the same peak and then
 * balanced by per-cue volume in the manifest, rather than each file carrying its own mix decision —
 * so re-cutting one sound cannot silently change the balance of the others.
 */
function normalize({ rate, channels }, db) {
  let peak = 0;
  for (const c of channels) for (const v of c) if (Math.abs(v) > peak) peak = Math.abs(v);
  if (peak === 0) throw new Error('normalize: silent buffer');
  const g = dbToGain(db) / peak;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g;
  return { rate, channels };
}

/**
 * Builds a seamless ambience bed of `seconds` from a much shorter source.
 *
 * Both ambience sources are far too short to loop directly — the wind is 2 s with its own fade in
 * and out, the stream is 1 s — and a 1-2 s loop of broadband noise is heard as a pulse at the loop
 * rate, not as ambience. So the bed is built rather than trimmed: `layers` copies of the source are
 * summed, each read cyclically at a different rate from a different offset. Detuning decorrelates
 * them, so the sum stops sounding like one clip playing over itself and the source's own loudness
 * contour averages out.
 *
 * **The rates are quantized so the loop point needs no crossfade at all.** Each layer advances
 * `m * src` samples over the whole output, an exact whole number of source lengths, so every layer
 * returns to its starting phase and `out[n] === out[0]` by construction. The first cut of this used
 * a half-second equal-power crossfade of the tail onto the head instead, and left a 1.9 dB level
 * step at the seam against interior 50 ms steps of 1.6 dB (p95) — equal-power assumes the two sides
 * are uncorrelated, and here they are the same material at an offset, so it over-corrects.
 * Lengthening that crossfade to 1.5 s made it *worse* (2.1 dB), which is what ruled the whole
 * approach out. Quantized rates make the step exactly zero and delete the parameter.
 *
 * Quantization is what forces `m` apart by ±1 rather than the ±7 % detune this started with: the
 * grain is `src / n`, so an 8 s bed from a 1 s source can only detune in steps of 12.5 %. That is
 * audible as a slight spectral tilt between layers and inaudible as pitch on broadband noise.
 *
 * Each layer still splices hard wherever it wraps past the end of the source, because the source
 * itself is a hard cut. **Measured, and it does not surface:** across both finished beds the
 * largest single-sample jump is 1.44-1.56x the 99.9th percentile of ordinary jumps, with no
 * outlier above 3x anywhere — one layer's step, at `1/sqrt(layers)` gain and under two other layers
 * still running continuously, stays inside the noise's own variation. So the source is left
 * unsmoothed rather than pre-crossfaded, which keeps this function to one idea.
 *
 * The repetition is reduced, not removed: three detuned layers of one second of stream is still one
 * second of stream. Replace the source with a longer recording to actually fix it.
 */
function bed({ rate, channels }, { seconds, layers = 3, detune = [0, -1, 1] }) {
  const n = Math.round(seconds * rate);
  const src = channels[0].length;
  const gain = 1 / Math.sqrt(layers); // incoherent sum: power adds, so amplitude goes as sqrt
  // m loops of the source across the output; m = n/src is rate 1, and ±1 from there is the finest
  // detune the seamlessness constraint allows.
  const loops = Math.max(1, Math.round(n / src));
  const out = channels.map((ch, ci) => {
    const buf = new Float32Array(n);
    for (let k = 0; k < layers; k++) {
      const r = (Math.max(1, loops + detune[k % detune.length]) * src) / n;
      // Offsets spread the layers across the source, and the channel index shifts them again so the
      // two output channels are not the same signal (a bed identical in both ears collapses to a
      // point between the speakers instead of surrounding the listener). Offsets do not affect the
      // seam: every layer returns to whatever phase it started from.
      const off = ((k / layers + ci / (channels.length * layers * 2)) * src) % src;
      for (let i = 0; i < n; i++) {
        const p = (off + i * r) % src;
        const i0 = Math.floor(p);
        const f = p - i0;
        const a = ch[i0];
        const b = ch[(i0 + 1) % src]; // wrap, so the read never falls off the end
        buf[i] += gain * (a + (b - a) * f);
      }
    }
    return buf;
  });
  return { rate, channels: out };
}

// ------------------------------------------------------------------- recipes
//
// Cut points are read off the sources' 5 ms peak envelopes, not chosen by ear.

/** Typing ticks, by transient onset, picked from the 18 in the source for their isolation. */
const TYPE_TICKS = [0.12, 0.3, 0.485, 0.7];

const RECIPES = [
  // --- music: copied verbatim, see the header note ---
  { copy: '白い通り角.mp3', to: 'music/hub_theme.mp3' },
  { copy: 'AVGBG.mp3', to: 'music/avg_theme.mp3' },

  // --- character ---
  {
    // The only armour sample there is, and it has to serve walking, take-off and landing. Playback
    // rate and volume jitter at play time is what keeps it from reading as a machine gun; nothing
    // here can substitute for that.
    src: 'armor-step.wav',
    to: 'sfx/armor_step.ogg',
    build: (a) => normalize(fade(a, 0, 0.01), -3),
  },
  // The grass source is *not* discrete footsteps: it is 2 s of continuous rustle containing two
  // "sweeps" (transients at 0.570 s and 1.205 s). They are cut out as the surface layer that plays
  // *under* the armour step, which is why they are soft and long rather than percussive.
  {
    src: 'Third-person_game_gr_#1-1788552338814.wav',
    to: 'sfx/footstep_grass_01.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 0.5, 0.85)), 0.01, 0.08), -3),
  },
  {
    src: 'Third-person_game_gr_#1-1788552338814.wav',
    to: 'sfx/footstep_grass_02.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 1.15, 1.5)), 0.01, 0.08), -3),
  },

  // --- UI / AVG ---
  ...TYPE_TICKS.map((t, i) => ({
    src: 'AVG_visual_novel_typ_#4-1788552426866.wav',
    to: `sfx/ui_type_0${i + 1}.ogg`,
    // 10 ms before the transient for the attack, 50 ms after for the body: the ticks sit 75-135 ms
    // apart, so a longer window would capture the following one.
    build: (a) => normalize(fade(toMono(cut(a, t - 0.01, t + 0.05)), 0.002, 0.015), -3),
  })),
  {
    // Source rings on for the full 2 s; a menu-move cue that outlasts the move reads as a drone.
    src: 'AVG_visual_novel_opt_#2-1788552556980.wav',
    to: 'sfx/ui_move.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 0, 0.3)), 0.002, 0.06), -3),
  },
  {
    // Source holds two separate hits (0.00 s and 0.64 s). The first is the stronger; taking both
    // would make one press sound like two.
    src: 'AVG_visual_novel_opt_#4-1788552473204.wav',
    to: 'sfx/ui_confirm.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 0, 0.45)), 0.002, 0.08), -3),
  },

  // --- ambience ---
  {
    // 0.42-1.42 s is the source's steady middle; outside it the clip fades itself in and out, and
    // looping that contour is exactly the pulse the bed exists to avoid. Stays stereo: this is the
    // non-positional bed, and width is most of what makes it read as "outdoors".
    src: 'Open_grassland_wind__#2-1788553077631.wav',
    to: 'ambience/wind_field.ogg',
    build: (a) => normalize(bed(cut(a, 0.42, 1.42), { seconds: 8 }), -9),
  },
  {
    // Mono because this one is positioned at the water. The source peaks at 0.0 dBFS (clipped), so
    // the bed is normalized well down rather than left near full scale.
    src: 'Natural_stream_water_#3-1788553102614.wav',
    to: 'ambience/water_pond.ogg',
    build: (a) => normalize(bed(toMono(a), { seconds: 6 }), -9),
  },
];

// ----------------------------------------------------------------------- run

if (!FFMPEG) {
  console.error('ffmpeg not found. Install it, or set FFMPEG to its full path.');
  process.exit(1);
}
for (const d of ['music', 'sfx', 'ambience']) mkdirSync(join(OUT, d), { recursive: true });

const tmp = join(OUT, '.tmp.wav');
const missing = [];
for (const r of RECIPES) {
  const from = join(SRC, r.copy ?? r.src);
  const to = join(OUT, r.to);
  if (!existsSync(from)) {
    missing.push(r.copy ?? r.src);
    continue;
  }
  let detail = '(copied)';
  if (r.copy) {
    copyFileSync(from, to);
  } else {
    const built = r.build(readWav(from));
    writeWavF32(tmp, built);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', to]);
    detail = `${(built.channels[0].length / built.rate).toFixed(3)}s ${built.channels.length}ch ${built.rate}Hz`;
  }
  console.log(`${r.to.padEnd(30)}${(statSync(to).size / 1024).toFixed(1).padStart(9)} KB  ${detail}`);
}
if (existsSync(tmp)) unlinkSync(tmp);
if (missing.length) {
  console.error(`\nMissing sources in ${SRC}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
