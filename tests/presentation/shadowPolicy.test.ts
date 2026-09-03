import { describe, it, expect } from 'vitest';
import { HEAD_MESHES, knightReceivesShadow } from '../../src/presentation/babylon/shadowPolicy';

describe('knightReceivesShadow', () => {
  it('excludes every head mesh', () => {
    for (const name of HEAD_MESHES) expect(knightReceivesShadow(name)).toBe(false);
  });

  it('includes body meshes', () => {
    expect(knightReceivesShadow('Mesh_0')).toBe(true);
    expect(knightReceivesShadow('Mesh_122')).toBe(true);
  });

  it('matches whole names, not prefixes', () => {
    // 'Mesh_4' must not be swallowed by the 'Mesh_43'/'Mesh_46' entries, nor 'Mesh_2' by 'Mesh_20'.
    expect(knightReceivesShadow('Mesh_4')).toBe(true);
    expect(knightReceivesShadow('Mesh_2')).toBe(true);
  });
});
