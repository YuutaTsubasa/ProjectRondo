/** The town ends at the southern gate (z = -63). A small dead band avoids repeated fades. */
export function regionMusicScene(z: number, current?: 'town' | 'meadow'): 'town' | 'meadow' {
  if (!current) return z >= -63 ? 'town' : 'meadow';
  if (current === 'town') return z < -65 ? 'meadow' : 'town';
  return z > -61 ? 'town' : 'meadow';
}
