/** Moves `current` toward `target` by at most `maxDelta`, stopping exactly on it rather than overshooting. */
export const moveToward = (current: number, target: number, maxDelta: number): number => {
  const offset = target - current;
  return Math.abs(offset) <= maxDelta ? target : current + Math.sign(offset) * maxDelta;
};
