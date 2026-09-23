import type { Vec2 } from '../../math/vec2';
import type { Vec3 } from '../../math/vec3';

export const SWORD_DURATION = 0.5;
export const SWORD_ACTIVE_START = 0.14;
export const SWORD_ACTIVE_END = 0.30;
const REACH = 2.2;
const VERTICAL_REACH = 1.2;
const ARC_COSINE = Math.cos(Math.PI / 3);
export interface SwordAttack { readonly seconds: number | null; readonly hitTargets: readonly number[] }
export const NO_SWORD_ATTACK: SwordAttack = { seconds: null, hitTargets: [] };
interface SwordFrame {
  pressed: boolean; homing: boolean; from: Vec3; facing: Vec2;
  targets: readonly Vec3[]; delta: number;
}
/** A short single slash. Targets receive one hit per swing, only in the forward blade volume. */
export function stepSwordAttack(attack: SwordAttack, frame: SwordFrame): { state: SwordAttack; hits: number[] } {
  if (frame.homing) return { state: NO_SWORD_ATTACK, hits: [] };
  const dt = Number.isFinite(frame.delta) ? Math.max(0, Math.min(.1, frame.delta)) : 0;
  const seconds = attack.seconds === null ? (frame.pressed ? 0 : null) : attack.seconds + dt;
  if (seconds === null || seconds >= SWORD_DURATION) return { state: NO_SWORD_ATTACK, hits: [] };
  const hits: number[] = [];
  const hitTargets = attack.seconds === null ? [] : [...attack.hitTargets];
  if (seconds >= SWORD_ACTIVE_START && (attack.seconds ?? 0) <= SWORD_ACTIVE_END) {
    frame.targets.forEach((target, index) => {
      if (hitTargets.includes(index)) return;
      const dx = target.x - frame.from.x, dz = target.z - frame.from.z;
      const distance = Math.hypot(dx, dz);
      if (distance > REACH || Math.abs(target.y - frame.from.y) > VERTICAL_REACH) return;
      if (distance > .01 && (dx * frame.facing.x + dz * frame.facing.y) / distance < ARC_COSINE) return;
      hitTargets.push(index); hits.push(index);
    });
  }
  return { state: { seconds, hitTargets }, hits };
}
