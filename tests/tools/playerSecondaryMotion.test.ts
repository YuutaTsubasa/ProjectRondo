import { describe, it, expect } from 'vitest';
import { retainSecondaryMotion } from '../../tools/player-model/secondary.mjs';

// The B01 side-plate (tasset) chain as authored in ProjectVtuber: Hips -> Hinge -> FrameYaw -> SplayYaw
// -> UnframeYaw -> Plate -> Tip, two roll constraints from UpperLeg and one spring on the plate.
const tassetFixture = () => ({
  nodes: [
    { name: 'UpperLeg.L', rotation: [0, 0, 1, 0] },
    { name: 'TassetHinge.L', children: [2], extensions: { VRMC_node_constraint: { specVersion: '1.0', constraint: { roll: { source: 0, rollAxis: 'Z', weight: 1 } } } } },
    { name: 'TassetSplayYaw.L', children: [3], extensions: { VRMC_node_constraint: { specVersion: '1.0', constraint: { roll: { source: 0, rollAxis: 'X', weight: 0.3 } } } } },
    { name: 'TassetPlate.L', children: [4] },
    { name: 'TassetTip.L', translation: [0.04, 0.34, 0.03] },
  ],
  extensions: { VRMC_springBone: {
    specVersion: '1.0',
    colliders: [{ node: 0, shape: { capsule: { offset: [0, 0, 0], radius: 0.078, tail: [0, 0.38, 0] } } }],
    colliderGroups: [{ name: 'Thigh.L', colliders: [0] }],
    springs: [{ name: 'Tasset.L', colliderGroups: [0], joints: [
      { node: 3, gravityDir: [0, -1, 0], stiffness: 2, gravityPower: 0.4, dragForce: 0.6, hitRadius: 0.025 },
      { node: 4, hitRadius: 0.025 },
    ] }],
  } },
});

describe('secondary motion retained from VRM extensions', () => {
  it('keeps roll constraints and spring chains by node name, with the tail offset in numbers', () => {
    expect(retainSecondaryMotion(tassetFixture())).toEqual({
      constraints: [
        { node: 'TassetHinge.L', source: 'UpperLeg.L', sourceRest: [0, 0, 1, 0], rollAxis: 'Z', weight: 1 },
        { node: 'TassetSplayYaw.L', source: 'UpperLeg.L', sourceRest: [0, 0, 1, 0], rollAxis: 'X', weight: 0.3 },
      ],
      springs: [{
        name: 'Tasset.L',
        joints: [{ node: 'TassetPlate.L', tail: [0.04, 0.34, 0.03], stiffness: 2, gravityPower: 0.4, gravityDir: [0, -1, 0], dragForce: 0.6, hitRadius: 0.025 }],
        colliders: [{ node: 'UpperLeg.L', offset: [0, 0, 0], tail: [0, 0.38, 0], radius: 0.078 }],
      }],
    });
  });
  it('lists constraints so a source is solved before anything that reads it', () => {
    const json = tassetFixture();
    json.nodes[0].extensions = { VRMC_node_constraint: { specVersion: '1.0', constraint: { roll: { source: 1, rollAxis: 'Y', weight: 1 } } } } as never;
    expect(() => retainSecondaryMotion(json)).toThrow(/cycle/i);
  });
  it('is empty for a model without secondary motion', () => {
    expect(retainSecondaryMotion({ nodes: [{ name: 'Hips' }] })).toEqual({ constraints: [], springs: [] });
  });
  it('rejects constraint and spring features the game does not drive', () => {
    const aim = tassetFixture();
    aim.nodes[1]!.extensions!.VRMC_node_constraint.constraint = { aim: { source: 0, aimAxis: 'PositiveY', weight: 1 } } as never;
    expect(() => retainSecondaryMotion(aim)).toThrow(/Unsupported node constraint/);
    const centered = tassetFixture();
    (centered.extensions.VRMC_springBone.springs[0] as Record<string, unknown>).center = 0;
    expect(() => retainSecondaryMotion(centered)).toThrow(/center/);
    const planar = tassetFixture();
    planar.extensions.VRMC_springBone.colliders[0].shape = { plane: { offset: [0, 0, 0], normal: [0, 1, 0] } } as never;
    expect(() => retainSecondaryMotion(planar)).toThrow(/collider/);
  });
});

