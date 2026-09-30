import { expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

it('joins both sides of the lip patch with continuous colors and a local fade', async () => {
  const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/player-v20.glb');
  const primitives = document.getRoot().listNodes().find(n => n.getName() === 'Face')!.getMesh()!.listPrimitives();
  const skin = primitives.find(p => p.getMaterial()!.getName() === 'Repaired lower face skin')!;
  const lip = primitives.find(p => p.getMaterial()!.getName() === 'Rebuilt lip skin')!;
  const colors = lip.getAttribute('COLOR_0'), skinColors = skin.getAttribute('COLOR_0');
  expect(colors, 'lip patch needs continuous surface colors').not.toBeNull();
  expect(skinColors, 'the skin side must fade into the same seam color').not.toBeNull();
  const position = skin.getAttribute('POSITION')!;
  const byPosition = new Map<string, number>();
  const key = (p: number[]) => p.map(v => v.toFixed(6)).join(',');
  for (let i = 0; i < position.getCount(); i++) if (!byPosition.has(key(position.getElement(i, [])))) byPosition.set(key(position.getElement(i, [])), i);
  const lipPosition = lip.getAttribute('POSITION')!;
  let shared = 0, outside = 0;
  for (let i = 0; i < lipPosition.getCount(); i++) {
    const match = byPosition.get(key(lipPosition.getElement(i, [])));
    if (match === undefined) continue;
    const actual = colors!.getElement(i, []), expected = skinColors!.getElement(match, []);
    expect(actual[3]).toBe(1);
    expect(expected[3]).toBe(1);
    actual.forEach((v, c) => expect(v).toBeCloseTo(expected[c]!, 6));
    shared++;
  }
  for (let i = 0; i < position.getCount(); i++) {
    const p = position.getElement(i, []);
    if (Math.abs(p[0]!) > .04 || p[1]! > 1.56 || p[1]! < 1.49) {
      expect(skinColors!.getElement(i, [])[3]).toBe(0);
      outside++;
    }
  }
  expect(shared).toBeGreaterThan(100);
  expect(outside).toBeGreaterThan(1000);
  for (const primitive of [skin, lip]) {
    expect(primitive.getMaterial()!.getBaseColorTexture()).not.toBeNull();
    expect(primitive.getMaterial()!.getExtras()).toMatchObject({ playerMaterial: { surfaceColorBlend: true } });
    expect(Array.from(primitive.getAttribute('COLOR_0')!.getArray()!).every(n => Number.isFinite(n) && n >= 0 && n <= 1)).toBe(true);
  }
  expect(primitives.filter(p => p.getAttribute('COLOR_0'))).toEqual([skin, lip]);
});
