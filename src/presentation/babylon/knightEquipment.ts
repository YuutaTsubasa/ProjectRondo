import { SWORD_DURATION, SWORD_ACTIVE_START, SWORD_ACTIVE_END } from '../../domain/hub/character/swordAttack';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { createSwordSlashTrail } from './swordSlashTrail';
import { createSwordSlashWave } from './swordSlashWave';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PLAYER_MODEL } from './playerModel';
import type { Shadows } from './shadows';

export interface EquipmentPose {
  readonly swordSeconds?: number | null;
  readonly homing: boolean;
  readonly deltaSeconds?: number;
}
export interface KnightEquipment {
  readonly sword: TransformNode;
  readonly shield: TransformNode;
  readonly arc: Mesh;
  apply(pose: EquipmentPose): void;
  restore(): void;
  dispose(): void;
}

/** Equipment dimensions are world units; sockets compensate for the import's uniform scale. */
export function createKnightEquipment(
  scene: Scene, root: TransformNode, nodes: readonly TransformNode[], shadows?: Shadows,
): KnightEquipment {
  const joint = (key: keyof typeof PLAYER_MODEL.boneMap): TransformNode => {
    const name = PLAYER_MODEL.boneMap[key];
    const found = nodes.find(node => node.name === name && node.isDescendantOf(root));
    if (!found) throw new Error(`Equipment requires imported joint ${name}`);
    return found;
  };
  const rightHand = joint('rightHand'), leftHand = joint('leftHand');
  const rightUpper = joint('rightUpperArm'), rightLower = joint('rightLowerArm');
  const leftUpper = joint('leftUpperArm'), leftLower = joint('leftLowerArm');
  const chest = joint('chest');
  root.computeWorldMatrix(true);
  const unit = 1 / Math.abs(root.absoluteScaling.y);
  const socket = (name: string, hand: TransformNode) => {
    const node = new TransformNode(name, scene); node.parent = hand;
    node.scaling.setAll(unit); return node;
  };
  const sword = socket('knightSword', rightHand);
  sword.position.set(0, .055, .025);
  // Carry down and out from the right hip, with the broad face visible to the trailing camera.
  sword.rotationQuaternion = Quaternion.FromEulerAngles(.3, 0, .49)
    .multiply(Quaternion.RotationAxis(Vector3.Up(), -.55));
  const shield = socket('knightShield', leftHand);
  shield.position.set(0, .045, .08); shield.rotation.z = Math.PI;
  const metal = (name: string, color: string, metallic: number, roughness: number) => {
    const mat = new PBRMaterial(name, scene); mat.albedoColor = Color3.FromHexString(color);
    mat.metallic = metallic; mat.roughness = roughness; return mat;
  };
  const silver = metal('equipmentSilver', '#cedee7', .75, .3);
  const navy = metal('equipmentNavy', '#142b4a', .45, .38);
  const leather = metal('equipmentGrip', '#19202a', .05, .8);
  const cyan = metal('equipmentCyan', '#5be4ff', .4, .25);
  cyan.emissiveColor = Color3.FromHexString('#19738b');
  const meshes: Mesh[] = [];
  const finish = (mesh: Mesh, parent: TransformNode, material: PBRMaterial) => {
    mesh.parent = parent; mesh.material = material; mesh.isPickable = false;
    mesh.receiveShadows = true; meshes.push(mesh); return mesh;
  };
  const box = (name: string, parent: TransformNode, material: PBRMaterial,
    width: number, height: number, depth: number, x = 0, y = 0, z = 0) => {
    const mesh = finish(CreateBox(name, { width, height, depth }, scene), parent, material);
    mesh.position.set(x, y, z); return mesh;
  };
  // Convex bevelled plate: perimeter at the back, inset raised face and a central ridge.
  const plate = (name: string, parent: TransformNode, material: PBRMaterial,
    outline: readonly (readonly [number, number])[], depth: number, bevel: number) => {
    const area = outline.reduce((sum, [x,y], i) => {
      const next = outline[(i+1)%outline.length]; return sum + x*next[1]-y*next[0];
    },0);
    const perimeter = area > 0 ? [...outline].reverse() : outline;
    const positions: number[] = [], indices: number[] = [];
    for (const z of [-depth / 2, depth / 2]) for (const [x,y] of perimeter) {
      const s = z > 0 ? bevel : 1; positions.push(x * s, y * s, z);
    }
    positions.push(0, 0, depth * .75); const n = outline.length;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      indices.push(i,k,n+i,k,n+k,n+i,n+i,n+k,2*n);
      if (i > 0 && i < n-1) indices.push(0,i+1,i);
    }
    const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals;
    const mesh = finish(new Mesh(name, scene), parent, material); data.applyToMesh(mesh); mesh.convertToFlatShadedMesh();
    material.backFaceCulling = false;
    return mesh;
  };
  const blade = plate('swordBlade', sword, silver,
    [[-.049,-.35],[.049,-.35],[.046,.29],[0,.44],[-.046,.29]], .032, .72);
  blade.position.y = .51;
  box('swordFuller', sword, navy, .014, .57, .006, 0, .49, .025);
  box('swordGrip', sword, leather, .052, .2, .047, 0, -.015);
  box('swordGuard', sword, silver, .29, .045, .07, 0, .105);
  for (const side of [-1,1]) {
    const tip = box(`swordGuardTip${side}`, sword, navy, .05,.08,.073,side*.132,.09);
    tip.rotation.z = side * .25;
  }
  for (let i=0;i<4;i++) box(`swordGripBand${i}`, sword, navy,.057,.013,.053,0,-.085+i*.042);
  const pommel = finish(CreateSphere('swordPommel', { diameter: .09, segments: 8 }, scene), sword, silver);
  pommel.position.y = -.155;
  const gem = finish(CreateSphere('swordGem', { diameter: .045, segments: 8 }, scene), sword, cyan);
  gem.position.set(0,.11,.05);
  const outline: readonly (readonly [number, number])[] = [[-.29,.3],[0,.39],[.29,.3],[.31,-.08],[.2,-.27],[0,-.43],[-.2,-.27],[-.31,-.08]];
  plate('shieldRim', shield, silver, outline, .065, .93);
  const face = plate('shieldFace', shield, navy, outline.map(([x,y]) => [x*.87,y*.87]), .035,.93);
  face.position.z = .045;
  box('shieldSpine',shield,silver,.035,.52,.018,0,.015,.089);
  box('shieldCross',shield,silver,.33,.035,.018,0,.1,.09);
  const crest = plate('shieldCrest',shield,cyan,[[0,.11],[.062,0],[0,-.11],[-.062,0]],.035,.65);
  crest.position.set(0,.085,.11);
  box('shieldHandle',shield,leather,.15,.04,.045,0,0,-.055);
  shadows?.cast(...meshes); shadows?.receive(...meshes);

  const slashTrail = createSwordSlashTrail(scene);
  const arc = slashTrail.mesh;
  const slashWave = createSwordSlashWave(scene);
  const bladeHeel = new Vector3(), bladeTip = new Vector3(), waveOrigin = new Vector3(), waveForward = new Vector3();

  const baseline = new Map<TransformNode, Quaternion>();
  let disposed = false;
  const restore = () => {
    for (const [node, rotation] of baseline) node.rotationQuaternion!.copyFrom(rotation);
    baseline.clear();
  };
  const remember = (node: TransformNode) => {
    node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
    if (!baseline.has(node)) baseline.set(node,node.rotationQuaternion.clone());
  };
  const offset = (node: TransformNode,x: number,y: number,z: number) => {
    remember(node); node.rotationQuaternion!.multiplyInPlace(Quaternion.FromEulerAngles(x,y,z));
  };
  // Set model-space axes explicitly for a readable shield charge, independent of the fall clip.
  const orient = (node: TransformNode, modelRotation: Quaternion, weight = 1) => {
    remember(node); root.computeWorldMatrix(true); (node.parent as TransformNode).computeWorldMatrix(true);
    const worldRotation = root.absoluteRotationQuaternion.multiply(modelRotation);
    const parentRotation = (node.parent as TransformNode).absoluteRotationQuaternion;
    const target = parentRotation.conjugate().multiply(worldRotation);
    node.rotationQuaternion!.copyFrom(Quaternion.Slerp(node.rotationQuaternion!,target,weight));
    node.computeWorldMatrix(true);
  };
  const directionRotation = (direction: Vector3) => {
    const y = direction.normalize(), x = Vector3.Cross(y,Vector3.Right()).normalize();
    const z = Vector3.Cross(x,y).normalize();
    return Quaternion.RotationQuaternionFromAxis(x,y,z);
  };
  const aim = (node: TransformNode, direction: Vector3) => orient(node, directionRotation(direction));
  const fingers = nodes.filter(node => /^(Index|Middle|Ring|Little)(Proximal|Intermediate|Distal)\.[LR]$/.test(node.name));
  // Restore before Babylon reads originals for a new blend; save the freshly evaluated pose below.
  // Reapplying an unchanged elapsed time is deterministic, including scene pause/resume.
  const before = scene.onBeforeAnimationsObservable.add(restore);
  return {
    sword, shield, arc, restore,
    apply: ({ swordSeconds, homing, deltaSeconds = 1/60 }) => {
      if (disposed) return;
      restore();
      for(const finger of fingers) offset(finger,.42,0,0);
      if (homing) {
        offset(chest,.12,-.12,0);
        aim(leftUpper,new Vector3(.15,-.45,.88));
        aim(leftLower,new Vector3(-.08,.12,.99));
        orient(leftHand,Quaternion.FromEulerAngles(0,0,Math.PI));
        aim(rightUpper,new Vector3(-.3,-.85,-.43));
        aim(rightLower,new Vector3(-.18,-.55,-.82));
        orient(rightHand,directionRotation(new Vector3(-.3,-.45,-.84))
          .multiply(sword.rotationQuaternion!.conjugate()));
      } else if (swordSeconds != null && swordSeconds >= 0 && swordSeconds < SWORD_DURATION) {
        const t = swordSeconds;
        const ease = (v: number) => { const x=Math.max(0,Math.min(1,v)); return x*x*(3-2*x); };
        const wind = ease(t/SWORD_ACTIVE_START), strike = ease((t-SWORD_ACTIVE_START)/(SWORD_ACTIVE_END-SWORD_ACTIVE_START)), recover = 1-ease((t-SWORD_ACTIVE_END)/(SWORD_DURATION-SWORD_ACTIVE_END));
        const weight = wind*recover;
        const angle = -1.05+2.1*strike;
        const across = Math.sin(angle), forward = Math.cos(angle);
        offset(chest,0,(-.18*wind+.36*strike)*recover,0);
        // Explicit model-space axes keep Idle, Run and airborne clips on the same horizontal plane.
        orient(rightUpper,directionRotation(new Vector3(across*.8,-.35,forward*.8)),weight);
        orient(rightLower,directionRotation(new Vector3(across,-.02,forward)),weight);
        orient(rightHand,directionRotation(new Vector3(across,0,forward))
          .multiply(sword.rotationQuaternion!.conjugate()),weight);
        offset(leftLower,0,0,-.2*weight);
      }
      // Pose edits happen after animation evaluation, which may have cached these world matrices.
      // Refresh sockets now so attached equipment follows the newly posed hands in this same frame.
      sword.computeWorldMatrix(true); shield.computeWorldMatrix(true);
      // Runs every frame; scratch vectors keep it allocation-free. The trail clones what it keeps.
      const bladeMatrix = sword.getWorldMatrix();
      Vector3.TransformCoordinatesFromFloatsToRef(0, .18, 0, bladeMatrix, bladeHeel);
      Vector3.TransformCoordinatesFromFloatsToRef(0, .95, 0, bladeMatrix, bladeTip);
      slashTrail.update(homing ? null : swordSeconds ?? null, bladeHeel, bladeTip);
      waveOrigin.copyFrom(root.getAbsolutePosition());
      waveOrigin.y = chest.getAbsolutePosition().y;
      Vector3.TransformNormalFromFloatsToRef(0, 0, 1, root.computeWorldMatrix(true), waveForward).normalize();
      slashWave.update(swordSeconds ?? null, waveOrigin, waveForward, deltaSeconds, homing);
    },
    dispose: () => {
      if(disposed) return; disposed=true; restore(); scene.onBeforeAnimationsObservable.remove(before);
      for(const mesh of meshes) shadows?.generator.removeShadowCaster(mesh,false);
      sword.dispose(); shield.dispose(); slashTrail.dispose(); slashWave.dispose();
      for(const material of [silver,navy,leather,cyan]) material.dispose();
    },
  };
}
