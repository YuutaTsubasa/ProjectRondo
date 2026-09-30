import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

describe('terrain detail map', () => {
  it('encodes neutral detail normals so zero bump strength cannot normalize a zero vector', async () => {
    const file = fileURLToPath(new URL('../../public/textures/meadow-detail.png', import.meta.url));
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const luminances = new Set<number>();
    let minimumNormalZ = 1;
    for (let i = 0; i < data.length; i += info.channels) {
      const x = data[i + 3] / 255 * 2 - 1;
      const y = data[i + 1] / 255 * 2 - 1;
      minimumNormalZ = Math.min(minimumNormalZ, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
      luminances.add(data[i]);
    }
    expect(minimumNormalZ).toBeGreaterThan(0.99);
    expect(luminances.size).toBeGreaterThan(20);
  });
});
