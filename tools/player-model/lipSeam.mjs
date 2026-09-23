import sharp from 'sharp';

export const LIP_SEAM_SETTINGS = Object.freeze({ version: 1, blendDistance: 0.006, sampleRadius: 0.006, colorStorage: 'linear-vertex-blend' });
const key = p => p.map(v => v.toFixed(6)).join(',');
const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const gamma = v => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const clamp = v => Math.max(0, Math.min(1, v));
const distance = (a, b) => Math.hypot(...a.map((v, c) => v - b[c]));

async function sampler(material) {
  const texture = material.getBaseColorTexture();
  if (!texture) throw Error('Lip seam source requires a base-color texture');
  const { data, info } = await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const factor = material.getBaseColorFactor().slice(0, 3).map(gamma);
  return uv => {
    const x = Math.max(0, Math.min(info.width - 1, uv[0] * info.width - 0.5)), y = Math.max(0, Math.min(info.height - 1, uv[1] * info.height - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, info.width - 1), y1 = Math.min(y0 + 1, info.height - 1);
    return [0, 1, 2].map(c => {
      const at = (a, b) => data[(b * info.width + a) * 4 + c] / 255;
      const top = at(x0, y0) * (1 - (x - x0)) + at(x1, y0) * (x - x0);
      const bottom = at(x0, y1) * (1 - (x - x0)) + at(x1, y1) * (x - x0);
      return (top * (1 - (y - y0)) + bottom * (y - y0)) * factor[c];
    });
  };
}

/** Feather both sides of the V20 mouth material seam; textures, geometry and morphs remain intact. */
export async function blendLipSeam(document) {
  const root = document.getRoot();
  const face = root.listNodes().find(n => n.getName() === 'Face')?.getMesh();
  const skin = face?.listPrimitives().find(p => p.getMaterial()?.getName() === 'Repaired lower face skin');
  const lip = face?.listPrimitives().find(p => p.getMaterial()?.getName() === 'Rebuilt lip skin');
  if (!skin || !lip) return null;
  if ([skin, lip].some(p => p.getAttribute('COLOR_0'))) throw Error('Lip seam correction expects an unmodified source');
  const skinColor = await sampler(skin.getMaterial());
  const sp = skin.getAttribute('POSITION'), su = skin.getAttribute('TEXCOORD_0'), lp = lip.getAttribute('POSITION');
  const byPosition = new Map();
  for (let i = 0; i < sp.getCount(); i++) if (!byPosition.has(key(sp.getElement(i, [])))) byPosition.set(key(sp.getElement(i, [])), i);
  const boundary = new Map();
  for (let i = 0; i < lp.getCount(); i++) {
    const p = lp.getElement(i, []), match = byPosition.get(key(p));
    if (match !== undefined) boundary.set(key(p), { p, color: skinColor(su.getElement(match, [])) });
  }
  if (boundary.size < 3) throw Error('Lip patch has no usable shared skin boundary');
  const samples = [...boundary.values()];
  for (const sample of samples) {
    const neighbors = samples.map(s => ({ s, weight: Math.exp(-((distance(s.p, sample.p) / LIP_SEAM_SETTINGS.sampleRadius) ** 2)) }));
    const total = neighbors.reduce((sum, n) => sum + n.weight, 0);
    sample.smooth = [0, 1, 2].map(c => neighbors.reduce((sum, n) => sum + n.s.color[c] * n.weight, 0) / total);
  }
  for (const primitive of [skin, lip]) {
    const positions = primitive.getAttribute('POSITION'), colors = new Float32Array(positions.getCount() * 4);
    for (let i = 0; i < positions.getCount(); i++) {
      const p = positions.getElement(i, []), exact = boundary.get(key(p));
      const nearest = samples.map(s => ({ s, distance: distance(p, s.p) })).sort((a, b) => a.distance - b.distance).slice(0, 4);
      const t = clamp(nearest[0].distance / LIP_SEAM_SETTINGS.blendDistance), blend = exact ? 1 : 1 - t * t * (3 - 2 * t);
      const weights = nearest.map(n => 1 / Math.max(1e-12, n.distance ** 4)), total = weights.reduce((a, b) => a + b, 0);
      const target = exact?.smooth ?? [0, 1, 2].map(c => nearest.reduce((sum, n, j) => sum + n.s.smooth[c] * weights[j] / total, 0));
      colors.set([...target.map(v => linear(clamp(v))), blend], i * 4);
    }
    primitive.setAttribute('COLOR_0', document.createAccessor('mouthSurfaceBlend').setType('VEC4').setArray(colors).setBuffer(root.listBuffers()[0]));
    const material = primitive.getMaterial(), extras = material.getExtras();
    material.setExtras({ ...extras, playerMaterial: { ...extras.playerMaterial, surfaceColorBlend: true } });
  }
  return { ...LIP_SEAM_SETTINGS, materials: [skin, lip].map(p => p.getMaterial().getName()), boundaryVertices: boundary.size };
}
