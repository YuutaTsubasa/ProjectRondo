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
 * **Re-running dirties every .ogg, and that is expected.** ffmpeg gives each Ogg stream a fresh
 * bitstream serial number, so the bytes differ on every run even when the decoded audio is identical.
 * After a re-run, commit only the files whose *content* you actually changed and `git checkout --` the
 * rest; committing the others is pure LFS churn.
 *
 * The two music tracks are **copied, not transcoded**, and that costs bytes rather than saving them.
 * A re-encode would lay a second generation of lossy artefacts over an already-lossy source, and music
 * is where that is heard: these are the only two assets in the set played in full, at length, and not
 * masked by anything. The price, measured rather than assumed: the sources are VBR MP3 at 202 kbps
 * (hub_theme, 3,386,961 B / 133.85 s) and 205 kbps (avg_theme, 3,830,342 B / 149.61 s), and re-encoding
 * them at the `-q:a 4` every other asset here uses gives 2.14 MB + 2.46 MB against the 7,217,303 B
 * shipped — 7.22 MB decimal, and 2.6 MB off the wire given up. What makes that affordable is that they are the only `streaming`
 * cues in the manifest, so they are off the critical path of first render (hubAudio.ts) and nothing
 * waits on them.
 *
 * **They do not loop cleanly, and this tool cannot fix that.** Both have a composed ending, so a loop
 * jumps from a decayed tail back to a full-level opening — 11 dB on hub_theme (every 2:14) and 51 dB
 * on avg_theme, which fades to silence (every 2:30). Trimming a track to a musically continuous loop
 * region is a musical judgement, not a measurement, so it is deliberately not attempted here. See the
 * audio design spec §5.2.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = process.argv[2] ?? join(homedir(), 'Downloads');
const OUT = join(ROOT, 'public', 'audio');

// `||`, not `??`: an exported-but-empty `FFMPEG=` is how a shell reports "I have no value for this",
// and `??` would take that empty string as a path and hand it to execFileSync, which fails as a spawn
// error rather than as "ffmpeg not found". Whitespace goes the same way.
const FFMPEG =
  process.env.FFMPEG?.trim() ||
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
    if (id === 'fmt ') {
      fmt = {
        tag: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    off = body + size + (size % 2); // RIFF chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt/data chunk`);
  if (fmt.tag !== 1 || fmt.bits !== 16)
    throw new Error(`${path}: expected 16-bit PCM, got tag=${fmt.tag} bits=${fmt.bits}`);
  const frames = Math.floor(data.length / 2 / fmt.channels);
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      channels[c][i] = data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    }
  }
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
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) buf.writeFloatLE(channels[c][i], 44 + (i * ch + c) * 4);
  }
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
 *
 * **`seconds` must be long enough, relative to the source, that every detuned layer gets its own
 * whole-loop count.** Rounding `loops + detune[k]` up to a minimum of 1 was tried and rejected: when
 * `loops` is already 1 (an 8 s bed from an 8 s+ source, say), two different `detune` entries can both
 * clamp to the same rate, so two "different" layers play back identically. Summing a signal with
 * itself is a **coherent** sum — the amplitudes add directly rather than the powers — which is
 * exactly the loud, phasey artefact this function exists to avoid, and it happened with no warning of
 * any kind. This throws instead: better to fail the build than ship a silently-defeated bed.
 */
function bed({ rate, channels }, { seconds, layers = 3, detune = [0, -1, 1] }) {
  const n = Math.round(seconds * rate);
  const src = channels[0].length;
  const gain = 1 / Math.sqrt(layers); // incoherent sum: power adds, so amplitude goes as sqrt
  // m loops of the source across the output; m = n/src is rate 1, and ±1 from there is the finest
  // detune the seamlessness constraint allows.
  const loops = Math.round(n / src);
  for (let k = 0; k < layers; k++) {
    if (loops + detune[k % detune.length] < 1) {
      throw new Error(
        `bed: seconds=${seconds} gives only ${loops} loop(s) of the ${(src / rate).toFixed(3)}s ` +
          `source, so detune ${detune[k % detune.length]} (layer ${k}) would collapse onto another ` +
          `layer's rate instead of staying distinct — producing a coherent, phasey sum with no ` +
          `warning. Lengthen \`seconds\` relative to the source.`,
      );
    }
  }
  const out = channels.map((ch, ci) => {
    const buf = new Float32Array(n);
    for (let k = 0; k < layers; k++) {
      const r = ((loops + detune[k % detune.length]) * src) / n;
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
  // "sweeps". They are cut out as the surface layer that plays *under* the armour step, which is why
  // they are soft and long rather than percussive.
  //
  // **Both cuts start on the energy, not on where the rustle begins.** The two layers of one footfall
  // are triggered on the same frame, so the ear fuses them only if they *start* together; a surface
  // layer arriving even 50 ms late is heard as a second event rather than as texture. The first cut of
  // these aligned the starts of the sweeps instead, and measured onsets of 25 ms and 55 ms against the
  // armour sample's 5 ms — audibly late in play, and worse than those figures suggest for the second,
  // whose energy peak sat 245 ms in.
  //
  // The two sweeps have different shapes and cannot be cut the same way. The first has a real attack
  // (+7 dB over 20 ms, into a peak at 0.585 s), so it is cut just below that rise. The second has no
  // attack at all — it climbs for 130 ms into a broad plateau at 1.32-1.40 s — so it is cut *into* the
  // plateau and necessarily starts mid-signal.
  //
  // Their fade-ins are 3 ms rather than the 10 ms used elsewhere: long enough to stop a mid-signal cut
  // clicking, short enough not to reintroduce the delay this is correcting.
  {
    src: 'Third-person_game_gr_#1-1788552338814.wav',
    to: 'sfx/footstep_grass_01.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 0.545, 0.78)), 0.003, 0.08), -3),
  },
  {
    src: 'Third-person_game_gr_#1-1788552338814.wav',
    to: 'sfx/footstep_grass_02.ogg',
    build: (a) => normalize(fade(toMono(cut(a, 1.3, 1.52)), 0.003, 0.08), -3),
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
    // Mono because this one is to be positioned at the water — not yet, the emitter is deferred with
    // the rest of the ambience wiring (spec §5.3a), but a stereo buffer cannot be panned and re-cutting
    // it later would mean re-tuning it. The source peaks at 0.0 dBFS (clipped), so
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
try {
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
      // execFileSync throws on a non-zero ffmpeg exit. Without the try/finally around this loop, that
      // throw would skip straight past the cleanup below and leave this 32-bit float scratch WAV
      // sitting in public/audio/ — the directory Vite serves in dev and copies verbatim into dist/.
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', to]);
      detail = `${(built.channels[0].length / built.rate).toFixed(3)}s ${built.channels.length}ch ${built.rate}Hz`;
    }
    console.log(`${r.to.padEnd(30)}${(statSync(to).size / 1024).toFixed(1).padStart(9)} KiB  ${detail}`);
  }
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}
if (missing.length) {
  console.error(`\nMissing sources in ${SRC}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
