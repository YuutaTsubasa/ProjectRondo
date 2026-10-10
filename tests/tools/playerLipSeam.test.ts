import {expect,it} from 'vitest';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
import {blendLipSeam} from '../../tools/player-model/lipSeam.mjs';

it('joins the legacy V20 seam and fades locally without depending on the active player',async()=>{
 const doc=new Document(),buffer=doc.createBuffer();
 const image=await sharp({create:{width:2,height:2,channels:3,background:{r:210,g:160,b:140}}}).png().toBuffer();
 const texture=doc.createTexture().setImage(image).setMimeType('image/png');
 const mesh=doc.createMesh();doc.createNode('Face').setMesh(mesh);
 const boundary=[0,0,0,.003,0,0,0,.003,0];
 const primitive=(name:string,extra:number[])=>{
  const positions=[...boundary,...extra];
  const p=doc.createPrimitive().setMaterial(doc.createMaterial(name).setBaseColorTexture(texture).setExtras({playerMaterial:{role:'head'}}));
  p.setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(positions)));
  p.setAttribute('TEXCOORD_0',doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array(positions.length/3*2).fill(.5)));
  mesh.addPrimitive(p);return p;
 };
 const skin=primitive('Repaired lower face skin',[.03,0,0]),lip=primitive('Rebuilt lip skin',[.001,.001,0]);
 const original=skin.getAttribute('POSITION')!.getArray()!.slice();
 expect(await blendLipSeam(doc)).toMatchObject({boundaryVertices:3});
 const a=skin.getAttribute('COLOR_0')!,b=lip.getAttribute('COLOR_0')!;
 for(let i=0;i<3;i++){expect(a.getElement(i,[])[3]).toBe(1);expect(a.getElement(i,[])).toEqual(b.getElement(i,[]));}
 expect(a.getElement(3,[])[3]).toBe(0);expect(b.getElement(3,[])[3]).toBeGreaterThan(0);
 expect(skin.getAttribute('POSITION')!.getArray()).toEqual(original);
 for(const p of [skin,lip]){
  expect(p.getMaterial()!.getBaseColorTexture()).toBe(texture);
  expect(p.getMaterial()!.getExtras()).toMatchObject({playerMaterial:{surfaceColorBlend:true}});
  expect(Array.from(p.getAttribute('COLOR_0')!.getArray()!).every(n=>Number.isFinite(n)&&n>=0&&n<=1)).toBe(true);
 }
 await expect(blendLipSeam(doc)).rejects.toThrow('unmodified source');
});
it('leaves the V33 authored face textures untouched by the legacy correction',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/player-v20.glb');
 expect(doc.getRoot().listMaterials().some(m=>m.getName().includes('soft cheek V33'))).toBe(true);
 expect(await blendLipSeam(doc)).toBeNull();
 expect(doc.getRoot().listMaterials().some(m=>(m.getExtras() as any).playerMaterial?.surfaceColorBlend)).toBe(false);
});
