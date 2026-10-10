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
