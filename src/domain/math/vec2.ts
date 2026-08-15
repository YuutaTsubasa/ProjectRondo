export interface Vec2 { readonly x: number; readonly y: number }

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const ZERO: Vec2 = vec2(0, 0);

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec2(a.x * k, a.y * k);
export const lengthSquared = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const length = (a: Vec2): number => Math.sqrt(lengthSquared(a));

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  // Intentional: return ZERO (not NaN) for a zero vector. All domain call sites guard
  // against zero before normalizing, so this only trades C#'s NaN for a safer default.
  return len === 0 ? ZERO : scale(a, 1 / len);
};

export const moveToward = (current: Vec2, target: Vec2, maxDelta: number): Vec2 => {
  const offset = sub(target, current);
  const distance = length(offset);
  return distance <= maxDelta || distance === 0
    ? target
    : add(current, scale(offset, maxDelta / distance));
};
