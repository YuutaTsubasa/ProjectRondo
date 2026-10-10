import { TOWN_BOUNDS, townLocation } from '../town/townLayout';

/** The town's southern gate: north of it is flat town, south of it is the meadow. */
export const REGION_TOWN_EDGE_Z = TOWN_BOUNDS.minZ;

export type RegionPlaceId = 'signal' | 'course' | 'palace' | 'homecoming' | 'ridge' | 'cove' | 'watch';
export interface RegionPlace {
  readonly id: RegionPlaceId;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly kind: 'story' | 'expedition' | 'vista';
  readonly description: string;
}
export const REGION_BOUNDS = { minX: -130, maxX: 85, minZ: -290, maxZ: 57 } as const;
export const REGION_SPAWN = { x: 0, y: 1.3, z: -35 } as const;
export const COURSE_ENTRANCE = { x: -20, z: 43 } as const;
/** South of the arch, inside the interaction radius and clear of its piers. */
export const COURSE_RETURN = { x: COURSE_ENTRANCE.x, y: 1.3, z: COURSE_ENTRANCE.z - 3 } as const;
export const REGION_PLACES: readonly RegionPlace[] = [
  { id: 'signal', name: '風原訊標', x: 0, z: -118, kind: 'story', description: '南門外的古老訊標，連結草原與海岸的道路。' },
  { id: 'course', name: '白宮天廊', ...COURSE_ENTRANCE, kind: 'expedition', description: '白塔廣場西北側的白石拱門，通往王宮高塔間的空中迴廊。' },
  { id: 'palace', name: '白宮引水道', x: 33, z: -20, kind: 'expedition', description: '海風步道下方，通向白色宮殿的古代引水道。' },
  { id: 'homecoming', name: '白塔廣場', x: -6, z: 33, kind: 'story', description: '白塔下的約定之地，也是旅程歸來的方向。' },
  { id: 'ridge', name: '西風山脊', x: -105, z: -85, kind: 'vista', description: '循著緩坡登高，眺望城牆、草海與遠洋。' },
  { id: 'cove', name: '潮音海灣', x: 65, z: -180, kind: 'vista', description: '石岸環抱的小灣，遠方帆影沿著海面行進。' },
  { id: 'watch', name: '南境瞭望台', x: -50, z: -250, kind: 'vista', description: '草原南端的舊哨站，守望群山間的道路。' },
];
/** Keep the narrow beacon beside the path; rendering, guidance and interaction share this anchor. */
export const REGION_INTERACTION_PLACES: readonly RegionPlace[] = REGION_PLACES.map(place => ({
  ...place,
  x: place.x + (place.id === 'ridge' ? 0 : place.id === 'course' ? -1.4 : 1.4),
  z: place.z + (place.id === 'ridge' || place.id === 'signal' ? 1.4 : 0),
}));
/** Every branch connects to the main southern road. Town routes follow existing streets. */
export const REGION_TRAILS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, -35], [0, REGION_TOWN_EDGE_Z], [0, -82], [0, -118], [-18, -145], [-64, -170], [-62, -208], [-50, -250]],
  [[0, -82], [-30, -85], [-65, -92], [-105, -85]],
  [[0, -118], [28, -145], [45, -170], [65, -180]],
];
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const hill = (x: number, z: number, cx: number, cz: number, width: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));
function relief(x: number, z: number): number {
  const inland = 14 * hill(x, z, -110, -95, 47) + 10 * hill(x, z, -55, -257, 49);
  const roll = .6 * Math.sin(x * .045 + z * .022) * Math.sin(z * .05);
  const shore = 2 * smooth((x - 38) / 40) + 5 * smooth((x - 76) / 9);
  const rim = 12 * smooth((-x - 116) / 14) + 13 * smooth((-z - 274) / 16);
  return (inland + roll - shore + rim) * smooth((REGION_TOWN_EDGE_Z - z) / 24);
}
/** Single source for rendered ground, Havok support, camera probes and scenery placement. */
export function regionHeight(x: number, z: number): number {
  if (z >= REGION_TOWN_EDGE_Z) return 0;
  let y = relief(x, z);
  for (const place of REGION_PLACES) {
    if (place.z >= REGION_TOWN_EDGE_Z) continue;
    const distance = Math.hypot(x - place.x, z - place.z);
    if (distance < 9) y += (relief(place.x, place.z) - y) * (1 - smooth((distance - 3) / 6));
  }
  return y;
}
export function regionPathDistance(x: number, z: number): number {
  let closest = Infinity;
  for (const trail of REGION_TRAILS) for (let i = 1; i < trail.length; i++) {
    const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    closest = Math.min(closest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return closest;
}
export function isRegionPositionSafe(point: { x: number; y: number; z: number }): boolean {
  const { x, y, z } = point;
  return [x, y, z].every(Number.isFinite) && y >= -3 && y <= 120
    && x >= REGION_BOUNDS.minX && x <= REGION_BOUNDS.maxX && z >= REGION_BOUNDS.minZ && z <= REGION_BOUNDS.maxZ
    && (z <= REGION_TOWN_EDGE_Z || x >= TOWN_BOUNDS.minX && x <= TOWN_BOUNDS.maxX);
}
export function regionLocation(x: number, z: number): string {
  if (z >= REGION_TOWN_EDGE_Z) return townLocation(x, z);
  if (x > 38) return '潮音海岸 · TIDAL COAST';
  if (x < -82 && z > -140) return '西風山脊 · WESTWIND RIDGE';
  if (z < -218) return '南境丘陵 · SOUTHERN WATCH';
  if (x < -38 && z < -145) return '裂谷遺跡 · RIFT RUINS';
  return '白宮草原 · PALACE MEADOW';
}
