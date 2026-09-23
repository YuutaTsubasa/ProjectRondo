import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Babylon detail maps pack diffuse variation into R, normal XY into A/G, roughness into B.
// A regular opaque photograph has A=1 and therefore encodes a sideways normal; even bumpLevel=0
// then normalizes a zero vector. Keep A/G at 128 so the decoded detail normal remains upright.
const source = fileURLToPath(new URL('../../public/textures/grass.jpg', import.meta.url));
const target = fileURLToPath(new URL('../../public/textures/meadow-detail.png', import.meta.url));
const { data, info } = await sharp(source).resize(1024, 1024).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = new Uint8Array(info.width * info.height * 4);
let mean = 0;
for (let i = 0; i < data.length; i += info.channels) mean += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
mean /= info.width * info.height;
for (let i = 0, p = 0; i < data.length; i += info.channels, p += 4) {
  const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  pixels[p] = Math.max(65, Math.min(191, Math.round(128 + (luminance - mean) * 1.2)));
  pixels[p + 1] = 128; pixels[p + 2] = 128; pixels[p + 3] = 128;
}
await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(target);
console.log(`Packed terrain detail: ${target}`);
