/** Play on blade release, not the input press; cancelled windups and frozen frames stay silent. */
export function swordSoundCrossed(before: number | null | undefined, after: number | null | undefined): boolean {
  return after != null && after >= .08 && (before == null || before < .08 || after < before);
}
