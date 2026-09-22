import receipt from '../../../public/models/player-v20.json';

/** Runtime contract written by tools/player-model/import.mjs into each material's glTF extras. */
export interface PlayerMaterialSettings {
  readonly role: 'head' | 'body';
  readonly shadeColorFactor: readonly [number, number, number];
  readonly shadingShiftFactor: number;
  readonly shadingToonyFactor: number;
  readonly giEqualizationFactor: number;
  readonly outlineWidthFactor: number;
  readonly outlineColorFactor: readonly [number, number, number];
}

/** Shared by both levels. Content hash changes the fetch URL on every successful re-import. */
export const PLAYER_MODEL = {
  url: `/models/player-v20.glb?v=${receipt.outputSha256.slice(0, 12)}`,
  height: 1.9,
  boneMap: receipt.boneMap,
  facingYaw: Math.PI,
  /** Half-width of the soft blue dash sheath, in world units. */
  trailRadius: 0.16,
  /** Animated chest joint from this derivative's import receipt. */
  trailTorsoNode: receipt.boneMap.chest,
} as const;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Fail before adapting any material if the generated asset has lost its role or shader parameters. */
export function readPlayerMaterial(metadata: unknown): PlayerMaterialSettings {
  const value = record(record(record(metadata).gltf).extras).playerMaterial;
  const data = record(value);
  if (data.role !== 'head' && data.role !== 'body') throw new Error('Missing or invalid playerMaterial.role');
  const scalar = (name: string, min: number, max: number) => {
    const number = data[name];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
      throw new Error(`Invalid playerMaterial.${name}`);
    }
    return number;
  };
  const color = (name: string): readonly [number, number, number] => {
    const rgb = data[name];
    if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some((n: unknown) =>
      typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) {
      throw new Error(`Invalid playerMaterial.${name}`);
    }
    return [rgb[0], rgb[1], rgb[2]];
  };
  return {
    role: data.role,
    shadeColorFactor: color('shadeColorFactor'),
    shadingShiftFactor: scalar('shadingShiftFactor', -1, 1),
    shadingToonyFactor: scalar('shadingToonyFactor', 0, 1),
    giEqualizationFactor: scalar('giEqualizationFactor', 0, 1),
    outlineWidthFactor: scalar('outlineWidthFactor', 0, 1),
    outlineColorFactor: color('outlineColorFactor'),
  };
}
