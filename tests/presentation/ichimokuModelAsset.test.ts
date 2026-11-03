import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ICHIMOKU_MODEL} from '../../src/presentation/parlor/ichimokuGen';

const modelPath=fileURLToPath(new URL('../../public/models/ichimoku-gen.glb',import.meta.url));
const receiptPath=fileURLToPath(new URL('../../public/models/ichimoku-gen.json',import.meta.url));
let bytes:Buffer,gltf:any,receipt:any;
beforeAll(()=>{
 bytes=readFileSync(modelPath);
 expect(bytes.toString('ascii',0,4)).toBe('glTF');
 gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
});
describe('一目元 NPC asset contract',()=>{
 it('ties the runtime URL to the generated binary and its receipt',()=>{
  const sha=createHash('sha256').update(bytes).digest('hex');
  expect(receipt.outputSha256).toBe(sha);expect(receipt.outputBytes).toBe(bytes.length);
  expect(ICHIMOKU_MODEL.url).toContain(sha.slice(0,12));
  expect(gltf.asset.extras.npcModel.sourceSha256).toBe(receipt.sourceSha256);
 });
 it('drops authoring-only VRM extensions but keeps the skeleton the scene animates',()=>{
  expect(gltf.extensionsUsed.filter((name:string)=>name.startsWith('VRMC_'))).toEqual([]);
  expect(gltf.extensions?.VRMC_vrm).toBeUndefined();
  const names=gltf.nodes.map((n:any)=>n.name);
  expect(names).toContain(ICHIMOKU_MODEL.eyeNode);
  expect(names.filter((n:string)=>/^tentacle_\w+?_\d+_\d+$/.test(n)).length).toBeGreaterThan(40);
  expect(gltf.skins).toHaveLength(1);
 });
 it('keeps the eyelid blink and caps embedded textures',()=>{
  const eyelid=gltf.meshes.find((m:any)=>m.name==='Eyelid');
  expect(eyelid.extras.targetNames).toContain('blink');
  expect(eyelid.primitives[0].targets.length).toBe(eyelid.extras.targetNames.length);
  for(const texture of receipt.textures)expect(Math.max(texture.width,texture.height)).toBeLessThanOrEqual(1024);
  expect(gltf.images.every((i:any)=>i.mimeType==='image/webp')).toBe(true);
 });
});
