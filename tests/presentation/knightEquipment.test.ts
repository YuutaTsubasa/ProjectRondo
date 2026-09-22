// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { driveKnightAnimation, type Knight } from '../../src/presentation/babylon/knight';
import { createDashTrail } from '../../src/presentation/babylon/dashTrail';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createKnightEquipment } from '../../src/presentation/babylon/knightEquipment';
import { PLAYER_MODEL } from '../../src/presentation/babylon/playerModel';

const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach(release => release()));
function rig() {
  const engine = new NullEngine(); const scene = new Scene(engine);
  releases.push(() => { scene.dispose(); engine.dispose(); });
  const root = new TransformNode('model', scene); root.scaling.setAll(.7);
  const nodes = Object.values(PLAYER_MODEL.boneMap).map(name => {
    const node = new TransformNode(name, scene); node.parent = root;
    node.rotationQuaternion = Quaternion.Identity(); return node;
  });
  const node = (name: string) => nodes.find(n => n.name === name)!;
  node('UpperArm.L').parent = node('Chest'); node('UpperArm.R').parent = node('Chest');
  node('LowerArm.L').parent = node('UpperArm.L'); node('Hand.L').parent = node('LowerArm.L');
  node('LowerArm.R').parent = node('UpperArm.R'); node('Hand.R').parent = node('LowerArm.R');
  const equipment = createKnightEquipment(scene, root, nodes);
  return { scene, root, node, equipment };
}
it('attaches to the receipt hands at world size and follows the animated hand', () => {
  const { equipment, node } = rig();
  expect(equipment.sword.parent).toBe(node('Hand.R'));
  expect(equipment.shield.parent).toBe(node('Hand.L'));
  const before = equipment.sword.getAbsolutePosition().clone();
  node('Hand.R').position.x = 2;
  equipment.sword.computeWorldMatrix(true);
  expect(equipment.sword.getAbsolutePosition().x - before.x).toBeCloseTo(1.4);
  expect(equipment.sword.absoluteScaling.x).toBeCloseTo(1);
  expect(equipment.sword.getChildMeshes().every(m => !m.isPickable && m.receiveShadows)).toBe(true);
});
it('restores the animation baseline without accumulating swing rotations or changing legs', () => {
  const { equipment, node, scene } = rig();
  const arm = node('UpperArm.R'), leg = node('UpperLeg.R');
  const baseline = Quaternion.FromEulerAngles(.1,.2,.3); arm.rotationQuaternion = baseline.clone();
  equipment.apply({ swordSeconds: .22, homing: false });
  const swing = arm.rotationQuaternion!.clone();
  expect(swing.equalsWithEpsilon(baseline)).toBe(false);
  equipment.apply({ swordSeconds: .22, homing: false });
  expect(arm.rotationQuaternion!.equalsWithEpsilon(swing)).toBe(true);
  expect(leg.rotationQuaternion!.equals(Quaternion.Identity())).toBe(true);
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  expect(arm.rotationQuaternion!.equalsWithEpsilon(baseline)).toBe(true);
  const nextBaseline = Quaternion.FromEulerAngles(.4, .1, 0);
  arm.rotationQuaternion!.copyFrom(nextBaseline);
  equipment.apply({ swordSeconds: null, homing: false });
  equipment.restore();
  expect(arm.rotationQuaternion!.equalsWithEpsilon(nextBaseline)).toBe(true);
});
it('leads Homing with the shield face and limits the slash arc to active frames', () => {
  const { equipment, root } = rig();
  equipment.apply({ swordSeconds: .2, homing: false });
  expect(equipment.arc.isEnabled()).toBe(true);
  equipment.apply({ swordSeconds: .45, homing: false });
  expect(equipment.arc.isEnabled()).toBe(false);
  equipment.apply({ swordSeconds: .2, homing: true });
  const face = Vector3.TransformNormal(Vector3.Forward(), equipment.shield.computeWorldMatrix(true)).normalize();
  const forward = Vector3.TransformNormal(Vector3.Forward(), root.computeWorldMatrix(true)).normalize();
  expect(Vector3.Dot(face, forward)).toBeGreaterThan(.98);
  expect(equipment.arc.isEnabled()).toBe(false);
});
it('releases geometry, materials and its observer and restores the current baseline', () => {
  const { equipment, scene, node } = rig();
  equipment.apply({ swordSeconds: .2, homing: true });
  equipment.dispose(); equipment.dispose();
  expect(equipment.sword.isDisposed()).toBe(true);
  expect(equipment.shield.isDisposed()).toBe(true);
  expect(scene.meshes).toHaveLength(0);
  expect(scene.materials.filter(material => material.name !== 'default material')).toHaveLength(0);
  expect(scene.onBeforeAnimationsObservable.hasObservers()).toBe(false);
  expect(node('UpperArm.R').rotationQuaternion!.equalsWithEpsilon(Quaternion.Identity())).toBe(true);
});


it('keeps the airborne clip and trail but suppresses Flying Kick for an equipped dash', () => {
  const { equipment, scene, node, root } = rig();
  const clip = (name: string) => {
    const group = new AnimationGroup(name, scene);
    const track = new Animation(name, 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT);
    track.setKeys([{ frame: 0, value: 0 },{ frame: 150, value: 1 }]);
    group.addTargetedAnimation(track,node('UpperLeg.R')); return group;
  };
  const knight: Knight = { animations: { idle: clip('Idle'), walk: clip('Walk'), run: clip('Run'),
    jump: clip('Jump'), kick: clip('FlyingKick') }, planted: 1, equipment,
    trail: createDashTrail(scene,root), release: () => {} };
  const release = driveKnightAnimation(scene,knight,() => ({ planarSpeed: 10,airborne: true,
    homing: true,homingEntrySeconds: .3,bounced: false,swordSeconds: null }),
    () => ({ walk: 3,run: 8,airtime: .75 }));
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(knight.animations.kick.isPlaying).toBeFalsy();
  expect(knight.animations.jump.isPlaying).toBe(true);
  expect(node('UpperArm.L').rotationQuaternion!.equalsWithEpsilon(Quaternion.Identity())).toBe(false);
  release(); equipment.dispose(); knight.trail.dispose();
});

it('lights the raised shield crest from the front rather than the inside', () => {
  const { equipment } = rig();
  for (const name of ['shieldFace','shieldCrest','swordBlade']) {
    const mesh = [...equipment.shield.getChildMeshes(), ...equipment.sword.getChildMeshes()].find(mesh => mesh.name === name)!;
    const positions = mesh.getVerticesData('position')!, normals = mesh.getVerticesData('normal')!;
    const maxZ = Math.max(...positions.filter((_, index) => index % 3 === 2));
    for (let index=2;index<positions.length;index+=3) {
      if (positions[index] === maxZ) expect(normals[index]).toBeGreaterThan(0);
    }
  }
});


function assetRig(clipName: string, seconds = 0) {
  const bytes = readFileSync('public/models/player-v20.glb');
  const length = bytes.readUInt32LE(12), binary = bytes.subarray(28+length);
  const gltf = JSON.parse(bytes.subarray(20,20+length).toString());
  const engine = new NullEngine(), scene = new Scene(engine);
  releases.push(() => { scene.dispose(); engine.dispose(); });
  const root = new TransformNode('importRoot',scene); root.scaling.setAll(.7);
  const nodes: TransformNode[] = gltf.nodes.map((source: { name: string; translation?: number[]; rotation?: number[]; scale?: number[] }) => {
    const node = new TransformNode(source.name,scene); node.parent=root;
    node.position = Vector3.FromArray(source.translation ?? [0,0,0]);
    node.rotationQuaternion = Quaternion.FromArray(source.rotation ?? [0,0,0,1]);
    node.scaling = Vector3.FromArray(source.scale ?? [1,1,1]); return node;
  });
  gltf.nodes.forEach((source: { children?: number[] },index: number) => {
    source.children?.forEach(child => { nodes[child].parent=nodes[index]; });
  });
  const clip = gltf.animations.find((animation: { name: string }) => animation.name===clipName);
  for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler];
    const times = gltf.accessors[sampler.input], timeView = gltf.bufferViews[times.bufferView];
    let frame = 0;
    while (frame+1 < times.count && binary.readFloatLE((timeView.byteOffset??0)+(times.byteOffset??0)+(frame+1)*4) <= seconds) frame++;
    const accessor=gltf.accessors[sampler.output], view=gltf.bufferViews[accessor.bufferView];
    const values = Array.from({length: accessor.type==='VEC4'?4:3}, (_,index) =>
      binary.readFloatLE((view.byteOffset??0)+(accessor.byteOffset??0)+(frame*(accessor.type==='VEC4'?4:3)+index)*4));
    const node=nodes[channel.target.node];
    if(channel.target.path==='rotation') node.rotationQuaternion=Quaternion.FromArray(values);
    if(channel.target.path==='translation') node.position=Vector3.FromArray(values);
  }
  const equipment=createKnightEquipment(scene,root,nodes);
  return { equipment, nodes, root };
}
it.each(['Idle','Run'])('carries the blade away from the real %s forearm, with a visible outward idle silhouette', (clipName) => {
  const { equipment, nodes } = assetRig(clipName);
  const hand=nodes.find(node=>node.name==='Hand.R')!, elbow=nodes.find(node=>node.name==='LowerArm.R')!;
  const blade=Vector3.TransformNormal(Vector3.Up(),equipment.sword.computeWorldMatrix(true)).normalize();
  const toElbow=elbow.getAbsolutePosition().subtract(hand.getAbsolutePosition()).normalize();
  expect(Vector3.Dot(blade,toElbow)).toBeLessThan(-.3);
  if(clipName==='Idle') {
    expect(blade.y).toBeLessThan(-.4);
    expect(blade.x).toBeLessThan(-.18);
    const face=Vector3.TransformNormal(Vector3.Forward(),equipment.sword.getWorldMatrix()).normalize();
    expect(Math.abs(face.z)).toBeGreaterThan(.3);
  }
  equipment.dispose();
});


it.each([.8,1,1.3])('places the shield ahead of the real jumping chest at %ss and tucks the sword', (seconds) => {
  const { equipment,nodes } = assetRig('Jump',seconds);
  equipment.apply({homing:true,swordSeconds:null});
  const at = (name: string) => nodes.find(node=>node.name===name)!.getAbsolutePosition();
  const chest=at('Chest'), shield=equipment.shield.getAbsolutePosition();
  expect(shield.z-chest.z).toBeGreaterThan(.2);
  expect(Math.abs(shield.y-chest.y)).toBeLessThan(.22);
  expect(Vector3.Distance(shield,at('Hand.L'))).toBeLessThan(.08);
  const tip=Vector3.TransformCoordinates(new Vector3(0,.95,0),equipment.sword.computeWorldMatrix(true));
  expect(tip.y).toBeLessThan(at('Head').y);
  expect(tip.z).toBeLessThan(chest.z-.25);
  equipment.dispose();
});
