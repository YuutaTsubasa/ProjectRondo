import { REGION_TOWN_EDGE_Z } from './regionLayout';

/** The town ends at the southern gate. A small dead band avoids repeated fades. */
const DEAD_BAND = 2;
export function regionMusicScene(z: number, current?: 'town' | 'meadow'): 'town' | 'meadow' {
  if (!current) return z >= REGION_TOWN_EDGE_Z ? 'town' : 'meadow';
  if (current === 'town') return z < REGION_TOWN_EDGE_Z - DEAD_BAND ? 'meadow' : 'town';
  return z > REGION_TOWN_EDGE_Z + DEAD_BAND ? 'town' : 'meadow';
}
