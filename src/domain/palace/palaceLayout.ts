import source from '../../../public/palace/stage-1-1.json';
export interface PalacePoint { x: number; y: number }
export interface PalacePlatform extends PalacePoint { id: string; width: number; height: number }
export interface PalaceGuardSpawn extends PalacePoint { id: string; minX: number; maxX: number }
export interface PalaceCheckpoint extends PalacePoint { id: string; spawnX: number; spawnY: number }
export interface PalaceLayout {
  width: number;
  platforms: readonly PalacePlatform[];
  guards: readonly PalaceGuardSpawn[];
  coins: readonly PalacePoint[];
  checkpoints: readonly PalaceCheckpoint[];
  goal: PalacePoint;
  spawn: PalacePoint;
}
const scale = 50;
const y = (sourceY: number) => (512 - sourceY) / scale;
/** Original White Palace geometry; x is left edge and y is the solid top. */
export const PALACE_LAYOUT: PalaceLayout = {
  width: source.world.width / scale,
  platforms: source.platforms.map((p, i) => ({ id: `platform-${i}`, x: p.col * source.world.tileSize / scale,
    y: y(p.row * source.world.tileSize), width: p.width * source.world.tileSize / scale,
    height: p.height * source.world.tileSize / scale })),
  guards: source.enemies.map(g => ({id:g.id,x:g.x/scale,y:y(g.surfaceY),minX:g.patrolMinX/scale,maxX:g.patrolMaxX/scale})),
  coins: source.coins.map(c => ({x:c.x/scale,y:y(c.y)})),
  checkpoints: source.checkpoints.map(c => ({id:c.id,x:c.x/scale,y:y(c.surfaceY),spawnX:c.spawnX/scale,spawnY:y(c.spawnSurfaceY)})),
  goal: {x:source.goal.x/scale,y:y(source.goal.surfaceY)},
  spawn: {x:source.playerSpawn.x/scale,y:y(source.playerSpawn.surfaceY)},
};
