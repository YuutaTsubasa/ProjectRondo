import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PLAYER_MODEL, readPlayerMaterial } from '../../src/presentation/babylon/playerModel';

const modelPath=fileURLToPath(new URL('../../public/models/player-v20.glb',import.meta.url));
const receiptPath=fileURLToPath(new URL('../../public/models/player-v20.json',import.meta.url));
let bytes: Buffer;
let gltf: any;
let receipt: any;
beforeAll(()=>{
 bytes=readFileSync(modelPath);
 expect(bytes.toString('ascii',0,4)).toBe('glTF');
 gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
});

describe('active player asset contract',()=>{
 it('ties the runtime URL to the actual generated binary and receipt',()=>{
  const sha=createHash('sha256').update(bytes).digest('hex');
  expect(receipt.outputSha256).toBe(sha);
  expect(PLAYER_MODEL.url).toContain(sha.slice(0,12));
  expect(receipt.outputBytes).toBe(bytes.length);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
 });
 it('contains all required animations targeting the new skeleton',()=>{
  expect(gltf.animations.map((a:any)=>a.name).sort()).toEqual(['FlyingKick','Idle','Jump','Run','Walk']);
  const joints=new Set(gltf.skins.flatMap((s:any)=>s.joints));
  for(const animation of gltf.animations){
   expect(animation.channels.length).toBeGreaterThan(20);
   for(const channel of animation.channels) expect(joints.has(channel.target.node)).toBe(true);
  }
 });
 it('classifies every rendered primitive by material and protects the face from body lighting',()=>{
  const roles=gltf.materials.map((m:any)=>readPlayerMaterial({gltf:{extras:m.extras}}));
  const headMaterials=gltf.materials.filter((m:any,i:number)=>roles[i].role==='head').map((m:any)=>m.name);
  expect(headMaterials.sort()).toEqual([...receipt.headMaterialNames].sort());
  expect(roles.some((r:any)=>r.role==='body')).toBe(true);
  for(const mesh of gltf.meshes) for(const primitive of mesh.primitives) expect(roles[primitive.material]).toBeDefined();
 });
 it('embeds its textures and omits inactive expression payloads from the game derivative',()=>{
  for(const image of gltf.images){expect(image.uri).toBeUndefined();expect(gltf.bufferViews[image.bufferView]).toBeDefined();}
  let blinkPrimitives=0;
  for(const mesh of gltf.meshes) for(const primitive of mesh.primitives) {
   if(!primitive.targets) continue;
   expect(primitive.targets).toHaveLength(1);
   expect(mesh.extras.targetNames).toEqual(['playerBlink']);
   expect(mesh.weights??[0]).toEqual([0]);
   blinkPrimitives++;
  }
  expect(blinkPrimitives).toBeGreaterThan(0);
  expect(blinkPrimitives).toBe(receipt.blink.primitiveCount);
  expect(receipt.blink.targetName).toBe('playerBlink');
  expect(receipt.settings.morphTargets).toBe('preset-blink-only');
  expect(gltf.extensionsUsed??[]).not.toContain('VRMC_vrm');
 });
});
