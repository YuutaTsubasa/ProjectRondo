import {readFileSync, readdirSync} from 'node:fs';
import assert from 'node:assert/strict';

// A successful bundle is not enough: every lazy session must preload its CSS.
// Conditional import expressions previously retained only the final branch's CSS.
const dir = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(dir);
const entry = files.find(name => /^index-.*\.js$/.test(name));
assert(entry, 'Missing application entry');
const code = readFileSync(new URL(entry, dir), 'utf8');
for (const component of ['RegionSession', 'LocationMarquee', 'StageHud', 'TownSession', 'PalaceSession', 'CourseSession']) {
  const css = files.find(name => name.startsWith(component + '-') && name.endsWith('.css'));
  assert(css, `Missing ${component} stylesheet`);
  assert(code.includes(css), `${component} CSS is not preloaded by the game entry: ${css}`);
}
console.log('Production session CSS preload verified.');

// Installation metadata and launcher images must survive the production build.
const output = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', output), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.orientation, 'landscape');
assert(manifest.icons.some(icon => icon.sizes === '192x192'));
assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
for (const icon of manifest.icons) {
 const png = readFileSync(new URL(icon.src.slice(1), output));
 assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', 'Icon must be a real PNG');
 assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
}
const worker = readFileSync(new URL('sw.js', output), 'utf8');
assert(!worker.includes('__BUILD_ID__'), 'Service worker build digest was not injected');
assert.match(worker, /rondo-offline-[a-f0-9]{16}/);
assert(readFileSync(new URL('offline.html', output), 'utf8').includes('重新連線'));
assert(readFileSync(new URL('index.html', output), 'utf8').includes('/manifest.webmanifest'));
console.log('PWA manifest, icons and offline shell verified.');
