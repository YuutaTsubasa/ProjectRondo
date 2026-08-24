import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports.
import '@babylonjs/core/Materials/standardMaterial';
import { terrainHeight } from './terrainHeight';
import { ROCK_DIFFUSE_RGB } from './rockColors';

/**
 * Where the colonnade stands. Chosen by sampling `terrainHeight`: of the sites flat enough for a
 * radius-8 ring, this is the only one above y = 0 (1.17, with 1.26 m of spread across the ring and
 * 6.1° of slope), and it is 38 units from the pond so the two destinations do not crowd each other.
 *
 * Worth knowing before moving it: in this height field the flattest ground IS the lowest ground,
 * because the flat places are basin floors. The high ground runs 16–17° across a ring this wide.
 */
const PLAZA_X = -6;
const PLAZA_Z = 32;
const RING_RADIUS = 8;
/** Eight, so each pillar can later carry one mode-entrance with room to spare for three modes. */
const PILLAR_COUNT = 8;
const PILLAR_RADIUS = 0.45;
/** Height of the pillar crowns above the plaza centre's ground level. */
const CROWN_HEIGHT = 4.2;
const PEDESTAL_RADIUS = 1.6;
const PEDESTAL_HEIGHT = 0.55;

/** Reuses `scatter.ts`'s rock colour (via `rockColors.ts`) so the structure lands inside P2's grade
 *  rather than beside it. */
function stoneMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('stoneMat', scene);
  mat.diffuseColor = new Color3(...ROCK_DIFFUSE_RGB);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mat.ambientColor = new Color3(1, 1, 1); // pick up the hemispheric ambient so shaded faces aren't black
  return mat;
}

/**
 * A ring of stone pillars around a central pedestal — the hub's destination, and the site where NPCs
 * and the future mode-entrances attach. The shape is chosen for what plugs into it later: a colonnade
 * is inherently a *set* of positions, where an arch would have been one entrance for three modes.
 *
 * Each pillar seats on the terrain under its own base, like the trees, but they all reach the same
 * crown height — so the ring reads level across 6° of slope while the bases follow the ground.
 *
 * There is deliberately no plinth. One was designed to absorb the ring's 1.26 m spread and dropped:
 * a 1.3 m platform needs steps or it is an invisible wall, and seating the pillars individually
 * removes the problem instead of solving it.
 */
export function createLandmark(scene: Scene, shadowGenerator?: ShadowGenerator): void {
  const mat = stoneMaterial(scene);
  const crownY = terrainHeight(PLAZA_X, PLAZA_Z) + CROWN_HEIGHT;

  for (let i = 0; i < PILLAR_COUNT; i++) {
    const angle = (i / PILLAR_COUNT) * Math.PI * 2;
    const x = PLAZA_X + RING_RADIUS * Math.cos(angle);
    const z = PLAZA_Z + RING_RADIUS * Math.sin(angle);
    const baseY = terrainHeight(x, z);
    // Sink the base slightly so no pillar hovers over a dip between terrain samples.
    const height = crownY - baseY + 0.3;
    const pillar = CreateCylinder(
      `plazaPillar_${i}`,
      { diameter: PILLAR_RADIUS * 2, height, tessellation: 12 },
      scene,
    );
    pillar.position.set(x, baseY - 0.3 + height / 2, z);
    pillar.material = mat;
    pillar.isPickable = false;
    new PhysicsAggregate(pillar, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    if (shadowGenerator) shadowGenerator.addShadowCaster(pillar);
  }

  const pedestalY = terrainHeight(PLAZA_X, PLAZA_Z);
  const pedestal = CreateCylinder(
    'plazaPedestal',
    { diameter: PEDESTAL_RADIUS * 2, height: PEDESTAL_HEIGHT, tessellation: 24 },
    scene,
  );
  pedestal.position.set(PLAZA_X, pedestalY + PEDESTAL_HEIGHT / 2, PLAZA_Z);
  pedestal.material = mat;
  pedestal.isPickable = false;
  new PhysicsAggregate(pedestal, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
  if (shadowGenerator) shadowGenerator.addShadowCaster(pedestal);
}
