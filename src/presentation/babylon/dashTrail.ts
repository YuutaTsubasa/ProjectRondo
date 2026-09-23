import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TrailHistory, type TrailSample } from './trailHistory';

export interface DashTrail {
  /** Starts a fresh streak at the generator, dropping any previous dash's tail. */
  start(): void;
  /** Stops emission; existing light fades over its remaining lifetime. */
  stop(): void;
  reset(): void;
  dispose(): void;
}

const SECTIONS = 27;
const COLUMNS = 5;
const EDGE_ALPHA = [0, 0.55, 1, 0.55, 0];

/** Two camera-facing, soft-edged ribbons. Widths are world-space and independent of model scale. */
export function createDashTrail(scene: Scene, generator: TransformNode, radius = 0.16): DashTrail {
  const history = new TrailHistory();
  const layers = [
    { name: 'Sheath', width: radius, color: new Color3(0.055, 0.25, 1), opacity: 0.48 },
    { name: 'Core', width: radius * 0.24, color: new Color3(0.65, 0.88, 1), opacity: 0.92 },
  ].map((style) => {
    const mesh = new Mesh(`knightTrail${style.name}`, scene);
    const material = new StandardMaterial(`knightTrail${style.name}Mat`, scene);
    material.disableLighting = true;
    material.emissiveColor = style.color;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.alphaMode = Constants.ALPHA_ADD;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.hasVertexAlpha = true;
    mesh.useVertexColors = true;
    const positions = new Float32Array(SECTIONS * COLUMNS * 3);
    const colors = new Float32Array(SECTIONS * COLUMNS * 4);
    const indices: number[] = [];
    for (let row = 0; row < SECTIONS - 1; row++) {
      for (let column = 0; column < COLUMNS - 1; column++) {
        const a = row * COLUMNS + column, b = a + COLUMNS;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    mesh.setVerticesData(VertexBuffer.PositionKind, positions, true);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
    mesh.setIndices(indices);
    mesh.setEnabled(false);
    return { ...style, mesh, material, positions, colors };
  });
  const tangent = new Vector3(), view = new Vector3(), side = new Vector3();
  const position = new Vector3();
  let disposed = false;
  let lastFrame = -1;
  const hide = () => { for (const { mesh } of layers) mesh.setEnabled(false); };

  function draw(samples: readonly TrailSample[]): void {
    if (samples.length < 2) { hide(); return; }
    const camera = scene.activeCamera;
    for (const layer of layers) {
      for (let row = 0; row < SECTIONS; row++) {
        const index = Math.min(row, samples.length - 1);
        const sample = samples[index];
        const previous = samples[Math.max(0, index - 1)].position;
        const next = samples[Math.min(samples.length - 1, index + 1)].position;
        tangent.set(next.x - previous.x, next.y - previous.y, next.z - previous.z);
        position.set(sample.position.x, sample.position.y, sample.position.z);
        if (camera) camera.globalPosition.subtractToRef(position, view);
        else view.set(0, 0, -1);
        Vector3.CrossToRef(tangent, view, side);
        if (side.lengthSquared() < 1e-10) side.set(0, 1, 0);
        else side.normalize();
        // Taper both the old tail and the birth of a new streak to a point.
        const taper = Math.pow(sample.strength, 0.7) * Math.min(1, index / 3);
        for (let column = 0; column < COLUMNS; column++) {
          const vertex = row * COLUMNS + column;
          const width = (column / (COLUMNS - 1) * 2 - 1) * layer.width * taper;
          layer.positions[vertex * 3] = position.x + side.x * width;
          layer.positions[vertex * 3 + 1] = position.y + side.y * width;
          layer.positions[vertex * 3 + 2] = position.z + side.z * width;
          layer.colors[vertex * 4] = 1;
          layer.colors[vertex * 4 + 1] = 1;
          layer.colors[vertex * 4 + 2] = 1;
          layer.colors[vertex * 4 + 3] = EDGE_ALPHA[column] * layer.opacity * sample.strength ** 1.4;
        }
      }
      layer.mesh.updateVerticesData(VertexBuffer.PositionKind, layer.positions);
      layer.mesh.updateVerticesData(VertexBuffer.ColorKind, layer.colors);
      layer.mesh.setEnabled(true);
    }
  }

  // After the animation/foot-plant observers have applied the current dash edge and visual root.
  const observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    if (lastFrame === scene.getFrameId()) return;
    lastFrame = scene.getFrameId();
    generator.computeWorldMatrix(true);
    history.advance(scene.getEngine().getDeltaTime() / 1000, generator.getAbsolutePosition());
    draw(history.samples());
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onBeforeActiveMeshesEvaluationObservable.remove(observer);
    scene.onDisposeObservable.remove(onDispose);
    history.reset();
    for (const { mesh, material } of layers) { mesh.dispose(); material.dispose(); }
  };
  const onDispose = scene.onDisposeObservable.add(dispose);
  return {
    start() {
      if (disposed) return;
      generator.computeWorldMatrix(true);
      history.start(generator.getAbsolutePosition());
      hide();
    },
    stop() { history.stop(); },
    reset() { history.reset(); hide(); },
    dispose,
  };
}
