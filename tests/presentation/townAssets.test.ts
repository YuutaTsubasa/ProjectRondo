import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../public/town/',import.meta.url);
it('ships the five user models with embedded PBR textures and verified import receipts',()=>{
 const receipt=JSON.parse(readFileSync(new URL('source-receipt.json',root),'utf8'));
 expect(receipt.assets.map((a:{kind:string})=>a.kind).sort()).toEqual(['arcade','gate','house','shop','tower']);
 for(const asset of receipt.assets){
  const bytes=readFileSync(new URL(asset.file,root));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  expect(bytes.toString('ascii',0,4)).toBe('glTF');
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  expect(gltf.animations??[]).toHaveLength(0);expect(gltf.skins??[]).toHaveLength(0);
  for(const material of gltf.materials){expect(material.normalTexture).toBeDefined();expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();expect(material.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();}
  for(const image of gltf.images){expect(image.uri).toBeUndefined();expect(image.bufferView).toBeTypeOf('number');}
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){expect(primitive.attributes.TEXCOORD_0).toBeTypeOf('number');expect(primitive.attributes.NORMAL).toBeTypeOf('number');}
  expect(asset.sourceSha256).toMatch(/^[a-f0-9]{64}$/);expect(asset.triangles).toBeGreaterThan(0);expect(asset.triangles).toBeLessThan(15000);
 }
});
