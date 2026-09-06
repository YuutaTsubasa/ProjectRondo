import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkIntegrity } from '../../tools/knight-feet/integrity.mjs';
import { qm, norm, axis } from '../../tools/knight-feet/glb.mjs';

/**
 * `checkIntegrity` — the assertion that `calibrate.mjs` moved the two ankles and nothing else.
 *
 * This exists because that function regressed in six consecutive review rounds of this PR, each
 * time in a fix for the previous round's regression: the receipt exemption swallowing the whole
 * `asset` block, bounds compared at a precision the writer never uses, four JSON blocks compared
 * instead of all of them, an accounting guard satisfied by the very receipt it should have been
 * validating, both foot exemptions unconditional again on the already-calibrated branch. Every one
 * was caught by a reader, and every fix was verified by an ad-hoc run described in a commit message
 * that nothing re-runs.
 *
 * The reason given for having no test was that it needs the uncalibrated intermediate, which is
 * never committed. That is true of the shipped asset and false of the function: it takes any two
 * GLBs. So the fixtures here are a hand-built pair of about a dozen nodes — no binary from `public/`
 * is touched, and the whole file runs in milliseconds.
 */

/** glTF component type 5126 = FLOAT, and a VEC4 is four of them. */
const QUAT_BYTES = 16;

type Json = Record<string, unknown>;

/** A GLB from a JSON chunk and a BIN chunk, padded as the container requires. */
function writeGlb(json: Json, bin: Buffer): Buffer {
  const raw = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20);
  raw.copy(jsonChunk);
  const header = Buffer.alloc(12);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write('JSON', 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write('BIN\0', 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]);
}

const IDENTITY = [0, 0, 0, 1];
/** Two keys per clip, so the angular-motion assertion has a step to compare. */
const KEYS_PER_CLIP = 2;
const CLIPS = ['0_T-Pose', 'Idle'] as const;

/**
 * A minimal knight: two ankles and one unrelated bone, each with a rotation track per clip.
 *
 * `LeftFoot`/`RightFoot` are what `integrity.mjs` exempts; `Spine` is the control that must never be
 * allowed to move. Every quaternion starts at identity so the corrected file's values are exactly
 * the correction being applied, which keeps the expectations readable.
 */
function rawGlb(): { json: Json; bin: Buffer } {
  // Explicit identity rotations, as a real export carries: `calibrate.mjs` composes onto
  // `node.rotation` and would throw on a node that omits it, so a fixture without one would be
  // testing an input the tool cannot be handed.
  const nodes = [
    { name: 'LeftFoot', rotation: [...IDENTITY] },
    { name: 'RightFoot', rotation: [...IDENTITY] },
    { name: 'Spine', rotation: [...IDENTITY] },
  ];
  const accessors: Json[] = [];
  const bufferViews: Json[] = [];
  const animations: Json[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  const push = (values: number[][], size: number) => {
    const buf = Buffer.alloc(values.length * size * 4);
    values.forEach((v, i) => v.forEach((x, c) => buf.writeFloatLE(x, (i * size + c) * 4)));
    chunks.push(buf);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: values.length,
      type: size === 4 ? 'VEC4' : 'SCALAR',
    });
    offset += buf.length;
    return accessors.length - 1;
  };

  for (const clip of CLIPS) {
    const input = push([[0], [1]].slice(0, KEYS_PER_CLIP), 1);
    const samplers: Json[] = [];
    const channels: Json[] = [];
    nodes.forEach((_, node) => {
      const output = push(Array.from({ length: KEYS_PER_CLIP }, () => [...IDENTITY]), 4);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path: 'rotation' } });
    });
    animations.push({ name: clip, samplers, channels });
  }

  const bin = Buffer.concat(chunks);
  return {
    json: {
      asset: { version: '2.0', generator: 'test' },
      buffers: [{ byteLength: bin.length }],
      bufferViews,
      accessors,
      nodes,
      meshes: [],
      materials: [{ name: 'armour' }],
      animations,
    },
    bin,
  };
}

/** The rotations a calibration would fit. Distinct so a swap between them is visible. */
const REST = [axis([1, 0, 0], 0.11), axis([1, 0, 0], 0.13)];
const TPOSE = [axis([1, 0, 0], 0.02), axis([1, 0, 0], 0.03)];
const ANIMATION = [axis([1, 0, 0], 0.21), axis([1, 0, 0], 0.23)];
const PITCH_DEGREES = 20;

/** Applies what `calibrate.mjs` applies, so the corrected file is one a real run could have made. */
function calibrate(raw: { json: Json; bin: Buffer }): { json: Json; bin: Buffer } {
  const json = structuredClone(raw.json) as Json;
  const bin = Buffer.from(raw.bin);
  const pre = axis([1, 0, 0], (-PITCH_DEGREES * Math.PI) / 180);
  const nodes = json.nodes as Json[];
  const animations = json.animations as Json[];
  const accessors = json.accessors as Json[];
  const bufferViews = json.bufferViews as Json[];

  [0, 1].forEach((node) => {
    nodes[node].rotation = norm(qm(IDENTITY, REST[node]));
    for (const anim of animations) {
      const channel = (anim.channels as Json[]).find(
        (c) => (c.target as Json).node === node && (c.target as Json).path === 'rotation',
      )!;
      const sampler = (anim.samplers as Json[])[channel.sampler as number];
      const accessor = accessors[sampler.output as number];
      const view = bufferViews[accessor.bufferView as number];
      const motion = anim.name !== '0_T-Pose';
      const step = motion ? ANIMATION[node] : TPOSE[node];
      for (let k = 0; k < (accessor.count as number); k++) {
        const at = (view.byteOffset as number) + k * QUAT_BYTES;
        const q = [0, 1, 2, 3].map((c) => bin.readFloatLE(at + c * 4));
        const turned: number[] = norm(qm(motion ? qm(pre, q) : q, step));
        turned.forEach((x, c) => bin.writeFloatLE(x, at + c * 4));
      }
    }
  });

  (json.asset as Json).extras = {
    knightFootCalibration: {
      version: 1,
      undoParentPitchDegrees: PITCH_DEGREES,
      corrections: [0, 1].map((node) => ({
        name: (nodes[node] as Json).name,
        node,
        rest: { q: REST[node], deg: 1 },
        tpose: { q: TPOSE[node], deg: 1 },
        animation: { q: ANIMATION[node], deg: 1 },
      })),
    },
  };
  return { json, bin };
}

let dir: string;
let raw: { json: Json; bin: Buffer };
let corrected: { json: Json; bin: Buffer };

/** Writes a pair and runs the check, returning the thrown message or null on success. */
const check = (
  original: { json: Json; bin: Buffer },
  mutate: (json: Json, bin: Buffer) => void = () => {},
): string | null => {
  const json = structuredClone(corrected.json) as Json;
  const bin = Buffer.from(corrected.bin);
  mutate(json, bin);
  const a = join(dir, 'a.glb');
  const b = join(dir, 'b.glb');
  writeFileSync(a, writeGlb(original.json, original.bin));
  writeFileSync(b, writeGlb(json, bin));
  try {
    checkIntegrity(a, b);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const receiptOf = (json: Json) =>
  ((json.asset as Json).extras as Json).knightFootCalibration as {
    corrections: { node: number; rest: { q: number[] }; tpose: { q: number[] } }[];
    undoParentPitchDegrees: number;
  };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'knight-feet-'));
  raw = rawGlb();
  corrected = calibrate(raw);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('checkIntegrity accepts a real calibration', () => {
  it('passes the pair calibrate.mjs would produce', () => {
    expect(check(raw)).toBeNull();
  });

  it('passes two identical already-calibrated files', () => {
    expect(check(corrected)).toBeNull();
  });
});

describe('checkIntegrity rejects changes outside the ankles', () => {
  it('catches an unrelated bone moving', () => {
    expect(check(raw, (json) => ((json.nodes as Json[])[2].rotation = [0.1, 0, 0, 0.995]))).toMatch(
      /Unexpected node change Spine/,
    );
  });

  it('catches an unrelated track changing', () => {
    expect(
      check(raw, (json, bin) => {
        const anim = (json.animations as Json[])[1];
        const channel = (anim.channels as Json[])[2]; // Spine
        const sampler = (anim.samplers as Json[])[channel.sampler as number];
        const view = (json.bufferViews as Json[])[
          (json.accessors as Json[])[sampler.output as number].bufferView as number
        ];
        bin.writeFloatLE(0.5, view.byteOffset as number);
      }),
    ).toMatch(/non-foot-rotation track changed/);
  });

  it('catches a material edit', () => {
    expect(check(raw, (json) => ((json.materials as Json[])[0].name = 'TAMPERED'))).toMatch(
      /Something outside the ankles changed/,
    );
  });

  it('catches an asset field other than the receipt', () => {
    expect(check(raw, (json) => ((json.asset as Json).generator = 'TAMPERED'))).toMatch(
      /Something under asset changed besides the receipt/,
    );
  });
});

describe('checkIntegrity holds the receipt to what the file carries', () => {
  it('catches a deleted receipt, so the foot exemptions are not a blanket amnesty', () => {
    expect(check(raw, (json) => delete (json.asset as Json).extras)).toMatch(
      /Foot rotations changed with no receipt entry/,
    );
  });

  it('catches a correction dropped from the receipt', () => {
    expect(check(raw, (json) => receiptOf(json).corrections.pop())).toMatch(
      /Foot rotations changed with no receipt entry/,
    );
  });

  it('catches a rest correction that does not reproduce the node', () => {
    expect(check(raw, (json) => (receiptOf(json).corrections[0].rest.q = [...IDENTITY]))).toMatch(
      /rest does not reproduce/,
    );
  });

  it('catches a tpose correction that does not reproduce the reference clip', () => {
    expect(check(raw, (json) => (receiptOf(json).corrections[0].tpose.q = [...IDENTITY]))).toMatch(
      /tpose does not reproduce/,
    );
  });

  // The pre-rotation is composed into the motion identity, so a wrong pitch shows up there — which
  // is the only thing that checks this field at all.
  it('catches a wrong undoParentPitchDegrees', () => {
    expect(check(raw, (json) => (receiptOf(json).undoParentPitchDegrees = 999))).toMatch(
      /animation does not reproduce/,
    );
  });

  it('names a malformed corrections array instead of throwing a TypeError', () => {
    expect(
      check(raw, (json) => {
        (receiptOf(json) as unknown as Json).corrections = { LeftFoot: {} };
      }),
    ).toMatch(/Receipt has no corrections array/);
  });

  it('names an out-of-range node index instead of throwing a TypeError', () => {
    expect(check(raw, (json) => (receiptOf(json).corrections[0].node = 99))).toMatch(
      /Receipt node index out of range/,
    );
  });
});

describe('checkIntegrity refuses to treat a second pass as a calibration', () => {
  // The branch that was a blanket amnesty for five rounds: with the original already calibrated,
  // nothing was validating what the foot exemptions let through.
  it('catches an ankle moving between two already-calibrated files', () => {
    expect(
      check(corrected, (json, bin) => {
        const extra = axis([1, 0, 0], 0.05);
        const nodes = json.nodes as Json[];
        nodes[0].rotation = norm(qm(nodes[0].rotation as number[], extra));
        for (const anim of json.animations as Json[]) {
          const channel = (anim.channels as Json[])[0];
          const sampler = (anim.samplers as Json[])[channel.sampler as number];
          const accessor = (json.accessors as Json[])[sampler.output as number];
          const view = (json.bufferViews as Json[])[accessor.bufferView as number];
          for (let k = 0; k < (accessor.count as number); k++) {
            const at = (view.byteOffset as number) + k * QUAT_BYTES;
            const q = [0, 1, 2, 3].map((c) => bin.readFloatLE(at + c * 4));
            const turned: number[] = norm(qm(q, extra));
            turned.forEach((x, c) => bin.writeFloatLE(x, at + c * 4));
          }
        }
      }),
    ).toMatch(/Foot rotations changed between two already-calibrated files/);
  });
});
