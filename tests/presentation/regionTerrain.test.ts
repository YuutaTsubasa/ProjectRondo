// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { createRegionTerrain } from '../../src/presentation/region/regionTerrain';
import { REGION_PLACES, regionHeight } from '../../src/domain/region/regionLayout';
const aggregates = vi.hoisted(() => [] as { mesh: { name: string } }[]);
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({ PhysicsAggregate: class { constructor(mesh: { name: string }) { aggregates.push({ mesh }); } } }));
it('uses the same displaced mesh for visible ground and static support without covering town paving', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const { ground } = createRegionTerrain(scene);
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
    let seam = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = positions.slice(i, i + 3);
      expect(z).toBeLessThanOrEqual(-63);
      expect(y).toBeCloseTo(regionHeight(x, z), 4);
      if (z === -63) { seam++; expect(y).toBe(0); }
    }
    expect(seam).toBeGreaterThan(50);
    expect(aggregates.some(a => a.mesh === ground)).toBe(true);
    const box = ground.getBoundingInfo().boundingBox;
    for (const place of REGION_PLACES.filter(p => p.z < -63)) {
      expect(place.x).toBeGreaterThan(box.minimum.x);
      expect(place.x).toBeLessThan(box.maximum.x);
      expect(place.z).toBeGreaterThan(box.minimum.z);
      expect(place.z).toBeLessThan(box.maximum.z);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

it('keeps decorative headland triangles below walkable terrace edges',async()=>{
 const {Ray}=await import('@babylonjs/core/Culling/ray');const {Vector3}=await import('@babylonjs/core/Maths/math.vector');
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  createRegionTerrain(scene);const land=scene.getMeshByName('region-town-headland')!;land.computeWorldMatrix(true);
  for(const [x,z] of [[0,144],[0,170],[-80,90],[-80,116]]){
   const hit=new Ray(new Vector3(x,60,z),new Vector3(0,-1,0),80).intersectsMesh(land,false);
   expect(hit.hit).toBe(true);expect(hit.pickedPoint!.y).toBeLessThan(regionHeight(x,z)-.3);
  }
 }finally{scene.dispose();engine.dispose();}
});
