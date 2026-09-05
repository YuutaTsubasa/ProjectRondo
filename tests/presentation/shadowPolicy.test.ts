import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from '../../tools/knight-feet/glb.mjs';
import { HEAD_MESHES, knightReceivesShadow } from '../../src/presentation/babylon/shadowPolicy';

describe('knightReceivesShadow', () => {
  it('excludes every head mesh', () => {
    for (const name of HEAD_MESHES) expect(knightReceivesShadow(name)).toBe(false);
  });

  it('includes body meshes', () => {
    // Names are not a contiguous 0..41 range — the shipped set contains Mesh_122/222/322 and no
    // Mesh_12/22/32/42 — which is exactly why the prefix test below matters.
    expect(knightReceivesShadow('Mesh_0')).toBe(true);
    expect(knightReceivesShadow('Mesh_122')).toBe(true);
  });

  it('matches whole names, not prefixes', () => {
    // The current head is Mesh_1 + Mesh_23, and both are prefixes of real body meshes in this GLB:
    // 'Mesh_1' of Mesh_10/Mesh_11/Mesh_122 (and every Mesh_1x), and 'Mesh_2' is itself a body mesh
    // that 'Mesh_23' would swallow. A prefix match would drop all of them out of the shadow set.
    expect(knightReceivesShadow('Mesh_10')).toBe(true);
    expect(knightReceivesShadow('Mesh_122')).toBe(true);
    expect(knightReceivesShadow('Mesh_2')).toBe(true);
  });
});

/**
 * `HEAD_MESHES` is the one list in this file whose correctness lives in a binary, and its own doc
 * says the failure is silent in both directions on a character swap. This resolves it against the
 * shipped GLB so at least the "name no longer exists, or exists twice" half cannot pass unnoticed —
 * which is also what keeps the mesh counts quoted in that doc and in `knight.ts` from going stale.
 */
const GLB = fileURLToPath(new URL('../../public/models/knight_web.glb', import.meta.url));

// Its own suite, deliberately. A `beforeAll` that loads the GLB pre-empts every test in its own
// describe — including this one, which is then reported as skipped rather than failed, and the
// cause still goes unnamed. Sitting outside that block is what lets it fail on its own terms.
describe('the shipped knight GLB', () => {
  it('is a real GLB on disk, not an unfetched LFS pointer', () => {
    expect(readFileSync(GLB).toString('ascii', 0, 4)).toBe('glTF');
  });
});

describe('HEAD_MESHES against the shipped knight GLB', () => {

  // In beforeAll rather than the describe body: loading at collection time meant a missing or
  // unfetched LFS object failed this whole file, including the three suites above, which are pure
  // and touch no GLB. This file's header sells those as node-testable, and that has to stay true.
  /** Babylon names each runtime mesh after the glTF **node**, so that is what to count here. */
  let names: string[];
  beforeAll(() => {
    expect(readFileSync(GLB).toString('ascii', 0, 4), 'not a GLB — unfetched LFS pointer?').toBe('glTF');
    const g = load(GLB);
    names = g.j.nodes
      .filter((n: { mesh?: number }) => n.mesh !== undefined)
      .map((n: { name: string }) => n.name);
  });

  it('is a real GLB on disk, not an unfetched LFS pointer', () => {
    expect(readFileSync(GLB).toString('ascii', 0, 4)).toBe('glTF');
  });

  it('ships 42 mesh-bearing nodes', () => {
    expect(names).toHaveLength(42);
  });

  it('resolves each head mesh exactly once', () => {
    expect(HEAD_MESHES.map((name) => [name, names.filter((n) => n === name).length])).toEqual(
      HEAD_MESHES.map((name) => [name, 1]),
    );
  });

  it('leaves 40 body meshes receiving shadows', () => {
    expect(names.filter(knightReceivesShadow)).toHaveLength(40);
  });
});
