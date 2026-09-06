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
    // Two opposite mistakes, one case each, because no single prefix rule makes all three fail.
    // Under `meshName.startsWith(headName)`: 'Mesh_1' swallows Mesh_10, Mesh_11 and Mesh_122, and
    // every other Mesh_1x. Under the reverse, `headName.startsWith(meshName)`: 'Mesh_23' swallows
    // Mesh_2, which is itself a body mesh. Either way real armour drops out of the shadow set.
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
  // unfetched LFS object failed this whole file, including the `knightReceivesShadow` suite at the
  // top, whose three cases are pure and touch no GLB. This file's header sells those as node-testable,
  // and that has to stay true. (The suite directly above does read the GLB — that is its whole job.)
  /** Babylon names each runtime mesh after the glTF **node**, so that is what to count here. */
  let names: string[];
  let loaded: ReturnType<typeof load>;
  const glb = () => loaded;
  beforeAll(() => {
    expect(readFileSync(GLB).toString('ascii', 0, 4), 'not a GLB — unfetched LFS pointer?').toBe('glTF');
    const g = (loaded = load(GLB));
    names = g.j.nodes
      .filter((n: { mesh?: number }) => n.mesh !== undefined)
      .map((n: { name: string }) => n.name);
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

  // The one check here that is about the model rather than about the list agreeing with itself.
  // `applyFaceMaterial`'s exactly-once guard, and the case above it, both pass for a stale entry that
  // still resolves — the `Mesh_0` case `shadowPolicy.ts` describes, where a name survived a swap onto
  // a body mesh. Geometry does not: the head is what sits above the body, so the two meshes reaching
  // highest in the rest pose are the head whatever they are called. Skinning all 42 costs ~120ms.
  it('names the two meshes that actually sit above the body', () => {
    const rest = glb().evaluate(null);
    const byTop = glb()
      .meshes.map((m: { name: string }) => ({
        name: m.name,
        top: Math.max(...glb().skin(rest, m).map((v: number[]) => v[1])),
      }))
      .sort((a: { top: number }, b: { top: number }) => b.top - a.top);

    expect([...byTop.slice(0, HEAD_MESHES.length).map((m: { name: string }) => m.name)].sort()).toEqual(
      [...HEAD_MESHES].sort(),
    );
    // And by a margin, so the ordering is not a coin-flip between the jaw and the highest pauldron.
    expect(byTop[HEAD_MESHES.length - 1].top - byTop[HEAD_MESHES.length].top).toBeGreaterThan(0.02);
  });
});
