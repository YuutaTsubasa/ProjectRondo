import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';

export interface FoliagePatch {
  center: readonly [number, number, number];
  radius: readonly [number, number, number];
  sprays: number;
}

/** Small folded leaves, clustered along sprays rather than a closed crown surface.
 * Geometry is opaque: leaf-sized gaps remain real from every angle, without alpha mip fringes.
 * Patch dimensions and the resulting mesh are in the caller's local space.
 */
export function createNaturalFoliage(
  scene: Scene, name: string, patches: readonly FoliagePatch[], seed = 2718,
): Mesh {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  for (const patch of patches) {
    const center = Vector3.FromArray(patch.center);
    const radius = Vector3.FromArray(patch.radius);
    const leafSize = Math.min(radius.x, radius.y, radius.z) * 0.19;
    for (let spray = 0; spray < patch.sprays; spray++) {
      const azimuth = random() * Math.PI * 2;
      const elevation = random() * 1.8 - 0.8;
      const horizontal = Math.sqrt(1 - elevation * elevation);
      const outward = new Vector3(Math.cos(azimuth) * horizontal, elevation, Math.sin(azimuth) * horizontal);
      // Filled volume with unequal patches leaves openings between each limb's foliage.
      const distance = Math.cbrt(random()) * 0.96;
      const anchor = center.add(outward.multiply(radius).scale(distance));
      const direction = new Vector3(outward.x, 0.3 + random() * 0.65, outward.z).normalize();
      const side = Vector3.Cross(direction, Vector3.Up()).normalize();
      const length = leafSize * (3.2 + random() * 1.8);
      const tint = random();
      for (let leaf = 0; leaf < 9; leaf++) {
        const along = leaf / 8;
        const handedness = leaf % 2 === 0 ? 1 : -1;
        const leafAxis = direction.scale(0.3 + random() * 0.35)
          .add(side.scale(handedness * (0.6 + random() * 0.4)))
          .add(new Vector3(0, random() * 0.7 - 0.35, 0)).normalize();
        const flatWidth = Vector3.Cross(leafAxis, new Vector3(0.1, 1, 0.12)).normalize();
        // Leaves need varied pitch around their stem: a canopy of horizontal blades becomes
        // almost invisible from the low gameplay camera despite containing thousands of leaves.
        const roll = (random() - 0.5) * 2.3;
        const widthAxis = flatWidth.scale(Math.cos(roll))
          .add(Vector3.Cross(leafAxis, flatWidth).scale(Math.sin(roll)));
        // Enlarge the blades without spreading the spray anchors: dense leafy boughs still
        // leave irregular sky gaps between branches, at the original geometry budget.
        const leafLength = leafSize * 1.9 * (0.7 + random() * 0.65);
        const halfWidth = leafLength * (0.27 + random() * 0.075);
        const base = anchor.add(direction.scale((along - 0.45) * length));
        const mid = base.add(leafAxis.scale(leafLength * 0.48));
        const tip = base.add(leafAxis.scale(leafLength));
        // A shallow ridge catches a restrained highlight; pointed tips break the outline.
        const vertices = [base, mid.add(widthAxis.scale(halfWidth)), tip,
          mid.subtract(widthAxis.scale(halfWidth)), mid.add(new Vector3(0, leafLength * 0.12, 0))];
        const start = positions.length / 3;
        const lightNormal = new Vector3(outward.x * 0.28, 0.92, outward.z * 0.28).normalize();
        const tone = tint * 0.065 + random() * 0.035;
        for (let vertex = 0; vertex < vertices.length; vertex++) {
          const p = vertices[vertex];
          positions.push(p.x, p.y, p.z);
          normals.push(lightNormal.x, lightNormal.y, lightNormal.z);
          const ridge = vertex === 4 ? 0.018 : 0;
          colors.push(0.255 + tone + ridge, 0.385 + tone + ridge, 0.16 + tone * 0.8 + ridge, 1);
        }
        indices.push(start, start + 1, start + 4, start + 1, start + 2, start + 4,
          start + 2, start + 3, start + 4, start + 3, start, start + 4);
      }
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.colors = colors;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  const material = new StandardMaterial(`${name}_leaves`, scene);
  material.diffuseColor = Color3.White();
  material.specularColor = new Color3(0.015, 0.02, 0.01);
  material.specularPower = 12;
  material.emissiveColor = new Color3(0.065, 0.082, 0.048);
  material.backFaceCulling = false;
  // Keep both sides on the same upward-biased normal: flipping gives black underside cards.
  material.twoSidedLighting = false;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}
