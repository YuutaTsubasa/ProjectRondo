import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports —
// without it this mesh renders nothing at all, silently (the same note `homingReticle.ts`,
// `crystals.ts` and `scatter.ts` each carry).
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import { terrainHeight } from './terrainHeight';
import { PLAZA_X, PLAZA_Z, PEDESTAL_RADIUS, RING_RADIUS } from './landmark';

/**
 * Radius of the band's centreline, in world units.
 *
 * Derived, not picked: midway between the pedestal's edge ({@link PEDESTAL_RADIUS}, 1.6) and the
 * pillar ring ({@link RING_RADIUS}, 8), i.e. (1.6 + 8) / 2 = 4.8 — so the ring crowds neither the
 * thing it points at nor the pillars it sits inside, and it moves with either if either moves.
 *
 * **Untuned** all the same: the derivation fixes it relative to the colonnade, but nobody has stood
 * in the plaza and judged whether a 9.6-unit circle reads as "this ground leads somewhere" or as a
 * decal too big to take in. Retune by eye, in the plaza, not from the numbers.
 */
const BAND_CENTRE_RADIUS = (PEDESTAL_RADIUS + RING_RADIUS) / 2;

/**
 * How wide the band of light is, radially, in world units — the ink spans
 * `BAND_CENTRE_RADIUS ± BAND_WIDTH / 2`, and {@link ringGradientTexture} fades it to nothing at both
 * of those edges, so the *visible* band is narrower than this and has no hard rim anywhere.
 *
 * **Untuned, and a first guess**: 0.6 is roughly a stride, chosen so the ring reads as a painted line
 * rather than a lit floor. Nothing was measured and nothing was compared against it.
 */
const BAND_WIDTH = 0.6;

/**
 * How far above the terrain the band floats, in world units.
 *
 * Not tuning — this is the smallest lift that reliably beats z-fighting, and it is derived from the
 * terrain's own resolution: `terrain.ts` subdivides the 100-unit ground 200 ways, so the rendered
 * surface is planar across 0.5-unit spans while this band samples the *analytic* `terrainHeight` at
 * its own vertices. Over a 0.5-unit span of a field whose noise wavelength is ~13 units that
 * disagreement is well under a centimetre, so 5 cm clears it with an order of magnitude in hand and
 * is still far too small to read as floating.
 */
const BAND_LIFT = 0.05;

/**
 * How many quads go round the ring. Not tuning: at {@link BAND_CENTRE_RADIUS} this puts a vertex
 * every ~0.31 units, which is finer than both the terrain mesh's own 0.5-unit spacing and anything
 * the height field varies over, so the band follows the ground rather than bridging it. Higher would
 * buy nothing; much lower would let the band cut into a rise.
 */
const SEGMENTS = 96;

/**
 * The ring's colour: a pale cyan.
 *
 * **Untuned, and an outright guess** — nobody has seen it. The reasoning behind the guess is only
 * that it should not be any colour the hub already uses to mean something else: the homing red
 * (`HOMING_RED_RGB` in `homingColors.ts`) means "aim", and the plaza's own stone reuses
 * `scatter.ts`'s rock grade, so a cool light is the nearest unclaimed slot. Retune by eye.
 */
const RING_EMISSIVE = new Color3(0.45, 0.85, 1);

/**
 * Overall opacity, multiplied on top of the texture's own falloff and applied additively (see
 * {@link createPortalRing}). **Untuned**: 0.9 is a guess at "clearly a light, not a spotlight", made
 * without seeing it against the plaza's daylight — which is the one thing that decides it, since an
 * additive band competes with whatever the sun has already put on the grass.
 */
const RING_ALPHA = 0.9;

/**
 * Texture resolution. Arbitrary, not tuning: the texture is a gradient that varies only across the
 * band, so it is 4 texels wide (constant around the circumference) and 64 tall — enough steps that
 * the falloff does not band visibly at this size on screen.
 */
const TEXTURE_WIDTH = 4;
const TEXTURE_HEIGHT = 64;

/**
 * A soft-edged stripe on a transparent background — the whole of the ring's look, drawn at runtime so
 * no image file enters the repo (the `DynamicTexture` house pattern `homingReticle.ts` and
 * `scatter.ts` already use).
 *
 * The stripe runs across the band, not around it: the mesh's v runs 0 at the inner edge to 1 at the
 * outer, and u runs round the circumference, so this gradient is what gives the ring a bright core
 * and a fade to nothing at both rims. Painted white — the material's emissive colour supplies the
 * tint, so all this has to carry is *where* the light is and how much of it.
 */
function ringGradientTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture(
    'portalRingTex',
    { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
    scene,
    false,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT);
  // Symmetric about the middle, so which way round the texture's v axis runs cannot matter. The
  // shoulders at 0.35/0.65 are what stop this reading as a fuzzy blur: a narrow bright core with a
  // low, wide skirt is the shape a line of light on the ground has.
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

/**
 * The band's geometry: a flat annulus around the pedestal that **follows the terrain**, one vertex
 * ring at the inner edge and one at the outer, each vertex seated on its own `terrainHeight` sample.
 *
 * It has to follow rather than lie flat, and the number says why: the plaza floor spreads 0.85 units
 * across a circle of this radius (sampled from `terrainHeight`), so a flat disc at the plaza centre's
 * height would bury a third of the ring and float the rest by up to 0.34 units. This is the same call
 * `createLandmark` makes for its pillars — seat each piece on the ground under it, rather than
 * flatten the ground.
 */
function bandGeometry(): VertexData {
  const inner = BAND_CENTRE_RADIUS - BAND_WIDTH / 2;
  const outer = BAND_CENTRE_RADIUS + BAND_WIDTH / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // `<=` and a duplicated seam vertex pair rather than wrapping the last quad onto vertex 0: the seam
  // pair carries u = 1 where vertex 0 carries u = 0, and a shared vertex could only hold one of them.
  for (let i = 0; i <= SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const u = i / SEGMENTS;
    for (const [radius, v] of [[inner, 0], [outer, 1]] as const) {
      const x = PLAZA_X + radius * cos;
      const z = PLAZA_Z + radius * sin;
      positions.push(x, terrainHeight(x, z) + BAND_LIFT, z);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const innerA = 2 * i;
    const outerA = 2 * i + 1;
    const innerB = 2 * i + 2;
    const outerB = 2 * i + 3;
    indices.push(innerA, outerA, outerB, innerA, outerB, innerB);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // Skyward, the same fix `terrain.ts` applies to its own ground for the same reason — `ComputeNormals`
  // orients from the winding, and this band's winding is whichever way the loop above happened to go.
  // Only tidiness here, since the material below disables lighting outright, but a mesh whose normals
  // point into the floor is a trap for anything that later reads them.
  let sumY = 0;
  for (let i = 1; i < normals.length; i += 3) sumY += normals[i];
  if (sumY < 0) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;
  return data;
}

/**
 * The glowing ring on the colonnade floor — the portal's whole affordance (spec §5). It says "this
 * leads somewhere" and does nothing else: it detects nothing, it is lit at all times, and the thing
 * that actually sends the player to the tower is the pedestal it encircles, whose trigger lives in
 * `hubScene.ts`.
 *
 * Deliberately *not* a marker on the pedestal itself. The colonnade is built to carry three modes one
 * day (`landmark.ts`: eight pillars, "each pillar can later carry one mode-entrance"), and spec §5
 * says the ring and the pedestal are the *shared* affordance and the *shared* trigger — so this
 * circles the plaza rather than labelling one destination, and needs no change when the pillars
 * become a selector.
 *
 * Procedural geometry plus a runtime-drawn texture, no model and no image file, the same house
 * pattern as `crystals.ts` and `homingReticle.ts`. Not pickable, no physics body, and never
 * registered with `shadows` — the reasoning `crystals.ts` gives for its own crystals: a thing that is
 * itself light has nothing to cast, and a 96-segment band would be a real cost in four cascades for
 * a shadow that would be invisible under it.
 */
export function createPortalRing(scene: Scene): void {
  const mat = new StandardMaterial('portalRingMat', scene);
  mat.diffuseTexture = ringGradientTexture(scene);
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  // Black diffuse so the tint is the emissive colour alone. With `disableLighting` the shader still
  // sums `diffuseColor * diffuseTexture + emissive`, and the texture above is painted white — left at
  // the default white diffuse, that white would wash the tint out to near-grey and the ring would
  // read as chalk rather than as light. What survives from the texture is its *alpha*, which is all
  // it was drawn to carry.
  mat.diffuseColor = new Color3(0, 0, 0);
  // A `.clone()`, never the module-level instance: a `Color3` is more often mutated in place than
  // reassigned — `crystals.ts` does exactly that to its own material's colour for the hit flash — so
  // handing the material this instance would leave the ring's colour reachable and writable through
  // `scene.materials`, which is the drift PR #39 found and `homingReticle.ts` guards against the same
  // way.
  mat.emissiveColor = RING_EMISSIVE.clone();
  mat.specularColor = new Color3(0, 0, 0);
  mat.alpha = RING_ALPHA;
  // Additive, so the band *adds* light to the grass under it instead of replacing it — the difference
  // between a lamp and a sticker, and the reading spec §5 asks for ("it is lit at all times").
  mat.alphaMode = Constants.ALPHA_ADD;
  // An additive layer contributes the same colour whatever is drawn after it, so writing depth would
  // only let it wrongly occlude the transparent things that share this ground — `scatter.ts`'s grass
  // and flower cards stand in exactly this circle.
  mat.disableDepthWrite = true;
  // The band is a two-sided surface as far as the player is concerned (they can stand inside it and
  // look across, and the camera dips below the ground plane on a slope), and its winding is whichever
  // way `bandGeometry`'s loop happened to run. Culling nothing removes the question.
  mat.backFaceCulling = false;

  const mesh = new Mesh('portalRing', scene);
  bandGeometry().applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  // Static: it is seated on a height field that never changes, so its world matrix never will either.
  mesh.freezeWorldMatrix();
}
