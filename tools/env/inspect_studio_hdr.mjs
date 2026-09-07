/**
 * Re-derives everything `public/env/CREDITS.md` claims about the shipped IBL panorama, from the file.
 *
 *   node tools/env/inspect_studio_hdr.mjs [path]     # default: public/env/studio.hdr
 *
 * This is **not** a generator. `public/env/studio.hdr` was baked by a script that was never committed
 * (its own RGBE header names `scratchpad/gen_studio_hdr.cjs`, which is not in this repository), and
 * the generating function could not be recovered from the pixels — so the panorama cannot be re-baked
 * brighter, darker or at a different resolution. What can be done is stop the provenance note being
 * unverifiable prose: every figure in `CREDITS.md` is printed here, so a reader can confirm the file
 * is what the note says it is, and a *replacement* panorama can be measured against the same numbers.
 *
 * Radiance RGBE, for the decode below: each pixel is four bytes `[R, G, B, E]`, and the linear value
 * of a channel is `channel * 2^(E - 136)` (the 136 is the format's 128 bias plus the 8 bits of
 * mantissa), with `E == 0` meaning exactly zero.
 */
import fs from 'node:fs';

const path = process.argv[2] ?? 'public/env/studio.hdr';
const buf = fs.readFileSync(path);

// Header: '#?RADIANCE', then variable lines, a blank line, then the resolution line. Every line is
// newline-terminated, so the pixel data starts one byte past the resolution line's newline.
const headerText = buf.toString('latin1', 0, Math.min(1024, buf.length));
const resolution = headerText.match(/^(-Y (\d+) \+X (\d+))$/m);
if (!headerText.startsWith('#?RADIANCE')) throw Error(`${path}: not a Radiance RGBE file`);
if (!resolution) throw Error(`${path}: no "-Y h +X w" resolution line found`);
const dataStart = headerText.indexOf(resolution[1]) + resolution[1].length + 1;
const height = Number(resolution[2]);
const width = Number(resolution[3]);

console.log(`file:        ${path}  (${buf.length} bytes)`);
console.log(`header:      ${JSON.stringify(headerText.slice(0, dataStart))}`);
console.log(`resolution:  ${width} x ${height} equirectangular`);

const flatBytes = width * height * 4;
const stored = buf.length - dataStart;
// Radiance may RLE its scanlines. This file does not: the payload is exactly one uncompressed
// four-byte pixel per texel, which is what makes the flat indexing below valid.
if (stored !== flatBytes) {
  console.log(
    `payload:     ${stored} bytes, not the ${flatBytes} of a flat RGBE image — RLE-compressed;` +
      ' this tool only reads flat scanlines.',
  );
  process.exit(1);
}
console.log(`payload:     ${stored} bytes, exactly ${width}*${height}*4 — flat scanlines, no RLE`);

const at = (x, y) => dataStart + (y * width + x) * 4;
const value = (x, y) => (buf[at(x, y) + 3] === 0 ? 0 : buf[at(x, y)] * 2 ** (buf[at(x, y) + 3] - 136));

let greyscale = true;
let min = Infinity;
let max = -Infinity;
let brightest = { x: 0, y: 0, value: -Infinity };
// Solid angle per texel on a lat-long map goes as sin(theta), so the plain pixel mean over-weights
// the poles. This weighting is the one that says how much light the panorama actually puts out.
let weighted = 0;
let weight = 0;
for (let y = 0; y < height; y++) {
  const sinTheta = Math.sin(((y + 0.5) / height) * Math.PI);
  for (let x = 0; x < width; x++) {
    const o = at(x, y);
    if (buf[o] !== buf[o + 1] || buf[o] !== buf[o + 2]) greyscale = false;
    const v = value(x, y);
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > brightest.value) brightest = { x, y, value: v };
    weighted += v * sinTheta;
    weight += sinTheta;
  }
}

const greyNote = greyscale
  ? 'yes — R = G = B in every pixel, so it tints nothing'
  : 'NO — this panorama carries colour';
console.log(`greyscale:   ${greyNote}`);
console.log(`radiance:    ${min.toFixed(4)} to ${max.toFixed(4)}`);
console.log(`mean:        ${(weighted / weight).toFixed(4)} (solid-angle weighted)`);
console.log(`brightest:   ${brightest.value.toFixed(3)} at pixel (${brightest.x}, ${brightest.y})`);

// Vertical profile: the row minimum is the panorama's underlying gradient, away from the soft lights.
const rowMin = Array.from({ length: height }, (_, y) => {
  let m = Infinity;
  for (let x = 0; x < width; x++) m = Math.min(m, value(x, y));
  return m;
});
console.log(
  `gradient:    zenith ${rowMin[0].toFixed(4)} -> horizon ${rowMin[height >> 1].toFixed(4)}` +
    ` -> nadir ${rowMin[height - 1].toFixed(4)} (row minima)`,
);

/**
 * The soft lights: peaks standing at more than `LIGHT_THRESHOLD` times the gradient at their own
 * elevation, found by repeated peak-picking with suppression.
 *
 * Both constants are descriptive, not derived — the lobes here are broad and overlapping, and these
 * are the values that resolve them into the three the panorama plainly has rather than into the
 * plateaus and shoulders a plain neighbour test finds (the RGBE mantissa quantises each crown flat,
 * so a bare local-maximum test reports dozens of "maxima" per lobe, and a smaller radius splits the
 * skirts off as lights of their own). Retune them for a different panorama.
 */
const LIGHT_THRESHOLD = 3;
const SUPPRESSION_RADIUS = 80;
const claimed = new Uint8Array(width * height);
const lights = [];
for (;;) {
  let peak = { x: -1, y: -1, value: -Infinity };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (claimed[y * width + x]) continue;
      const v = value(x, y);
      if (v < rowMin[y] * LIGHT_THRESHOLD) continue;
      if (v > peak.value) peak = { x, y, value: v };
    }
  }
  if (peak.x < 0) break;
  lights.push(peak);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.min(Math.abs(x - peak.x), width - Math.abs(x - peak.x));
      if (Math.hypot(dx, y - peak.y) <= SUPPRESSION_RADIUS) claimed[y * width + x] = 1;
    }
  }
}
console.log(`soft lights: ${lights.length}, each more than ${LIGHT_THRESHOLD}x the gradient at its elevation:`);
for (const l of lights) {
  const azimuth = ((l.x + 0.5) / width) * 360;
  const elevation = 90 - ((l.y + 0.5) / height) * 180;
  console.log(
    `             ${l.value.toFixed(3)} at (${l.x}, ${l.y})` +
      ` — azimuth ${azimuth.toFixed(0)}deg, elevation ${elevation.toFixed(0)}deg`,
  );
}
