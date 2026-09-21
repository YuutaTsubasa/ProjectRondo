import { describe, expect, it } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { applyRelaxedPose } from '../../tools/player-model/relaxedPose.mjs';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const load = () => io.read('public/models/player-v20.glb');
// Channels omit different redundant keys: sample by time, never by a shared array index.
function sample(doc: Document, name: string, time: number) {
  const clip = doc.getRoot().listAnimations().find(a => a.getName() === name)!;
  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler()!, out = sampler.getOutput()!;
    const times = sampler.getInput()!.getArray()!;
    let lower = 0;
    while (lower + 1 < times.length && times[lower + 1]! <= time) lower++;
    const upper = Math.min(lower + 1, times.length - 1);
    const factor = lower === upper || sampler.getInterpolation() === 'STEP' ? 0
      : Math.max(0, Math.min(1, (time - times[lower]!) / (times[upper]! - times[lower]!)));
    const from = out.getElement(lower, [] as number[]), to = out.getElement(upper, [] as number[]);
    if (channel.getTargetPath() === 'rotation') {
      const value = Quaternion.Slerp(Quaternion.FromArray(from), Quaternion.FromArray(to), factor);
      channel.getTargetNode()!.setRotation([value.x, value.y, value.z, value.w]);
    } else {
      channel.getTargetNode()!.setTranslation([0, 1, 2].map(i => from[i]! + (to[i]! - from[i]!) * factor) as [number, number, number]);
    }
  }
}
describe('player relaxed pose', () => {
  it('keeps a visible ankle gap throughout idle rather than bringing the boots together', async () => {
    const doc = await load(), nodes = doc.getRoot().listNodes();
    const left = nodes.find(n => n.getName() === 'Foot.L')!;
    const right = nodes.find(n => n.getName() === 'Foot.R')!;
    for (const frame of [0, 30, 60, 90, 120, 180, 240, 290]) {
      sample(doc, 'Idle', frame / 30);
      expect(left.getWorldTranslation()[0] - right.getWorldTranslation()[0]).toBeGreaterThan(0.22);
    }
  });
  it('supplies a constant relaxed finger pose to every clip', async () => {
    const doc = await load(), root = doc.getRoot();
    for (const clip of root.listAnimations()) {
      for (const side of ['L', 'R']) {
        const fingers = clip.listChannels().filter(c => /^(Index|Middle|Ring|Little|Thumb)/.test(c.getTargetNode()!.getName()) && c.getTargetNode()!.getName().endsWith('.' + side));
        expect(fingers).toHaveLength(15);
        for (const c of fingers) {
          const out = c.getSampler()!.getOutput()!;
          expect(out.getElement(0, [])).toEqual(out.getElement(out.getCount() - 1, []));
          c.getTargetNode()!.setRotation(out.getElement(0, [0, 0, 0, 1] as [number, number, number, number]));
        }
        for (const name of ['Index', 'Middle', 'Ring', 'Little']) {
          const proximal = root.listNodes().find(n => n.getName() === `${name}Proximal.${side}`)!;
          const distal = root.listNodes().find(n => n.getName() === `${name}Distal.${side}`)!;
          expect(distal.getWorldTranslation()[1]).toBeLessThan(proximal.getWorldTranslation()[1] - 0.025);
        }
      }
    }
  });
});


it('preserves neutral transforms and motion outside the adjusted stance joints', async () => {
  const doc = await load(), root = doc.getRoot();
  const transforms = root.listNodes().map(n => n.getMatrix());
  const moving = root.listAnimations().flatMap(a => a.listChannels().filter(c =>
    !(['Idle', 'Walk', 'Run'].includes(a.getName()) && /^(UpperLeg|Foot)\./.test(c.getTargetNode()!.getName()))));
  const curves = moving.map(c => Array.from(c.getSampler()!.getOutput()!.getArray()!));
  applyRelaxedPose(doc, (root.getAsset().extras as any).playerModel.boneMap);
  expect(root.listNodes().map(n => n.getMatrix())).toEqual(transforms);
  expect(moving.map(c => Array.from(c.getSampler()!.getOutput()!.getArray()!))).toEqual(curves);
});


for (const clipName of ['Walk', 'Run']) {
  it(`${clipName} keeps separate foot paths and avoids inward toes while the sole points forward`, async () => {
    const doc = await load(), root = doc.getRoot();
    const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
    const clip = root.listAnimations().find(a => a.getName() === clipName)!;
    const keys = [...new Set(clip.listSamplers().flatMap(s => Array.from(s.getInput()!.getArray()!)))].sort((a, b) => a - b);
    const duration = keys[keys.length - 1]!;
    const sampleTimes = [...keys, ...Array.from({ length: 601 }, (_, i) => duration * i / 600)];
    for (const time of sampleTimes) {
      sample(doc, clipName, time);
      const left = byName.get('Foot.L')!.getWorldTranslation();
      const right = byName.get('Foot.R')!.getWorldTranslation();
      expect(left[0] - right[0], `${clipName} ankle gap at ${time.toFixed(4)}s`).toBeGreaterThan(0.08);
      for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
        const foot = byName.get(`Foot.${side}`)!.getWorldTranslation();
        const toes = byName.get(`Toes.${side}`)!.getWorldTranslation();
        const dx = toes[0] - foot[0], dy = toes[1] - foot[1], dz = toes[2] - foot[2];
        // Ignore the folded airborne foot, where projected yaw is undefined/points backward.
        if (dz > 0.04 && Math.abs(dy) < Math.hypot(dx, dz)) {
          const outward = sign * Math.atan2(dx, dz) * 180 / Math.PI;
          expect(outward, `${clipName} ${side} toe direction at ${time.toFixed(4)}s`).toBeGreaterThan(-2);
          expect(outward).toBeLessThan(26);
        }
      }
    }
  });
}
