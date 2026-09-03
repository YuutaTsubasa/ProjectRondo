import { describe, it, expect } from 'vitest';
import { HEAD_MESHES, knightReceivesShadow } from '../../src/presentation/babylon/shadowPolicy';

describe('knightReceivesShadow', () => {
  it('excludes every head mesh', () => {
    for (const name of HEAD_MESHES) expect(knightReceivesShadow(name)).toBe(false);
  });

  it('includes body meshes', () => {
    expect(knightReceivesShadow('tripo_part_1')).toBe(true);
    expect(knightReceivesShadow('tripo_part_17')).toBe(true);
  });

  it('matches whole names, not prefixes', () => {
    // 'Mesh_3' must not be swallowed by the 'Mesh_33' entry.
    expect(knightReceivesShadow('Mesh_3')).toBe(true);
  });
});
