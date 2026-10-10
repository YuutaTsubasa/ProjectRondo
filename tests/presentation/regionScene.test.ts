// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRegionScene } from '../../src/presentation/region/regionScene';
import { REGION_SPAWN } from '../../src/domain/region/regionLayout';
const state = vi.hoisted(() => ({ havok: vi.fn(), rig: vi.fn(), audio: vi.fn(), events: [] as string[] }));
vi.mock('../../src/presentation/babylon/havokModule', () => ({ loadHavok: state.havok }));
vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin', () => ({ HavokPlugin: class {} }));
vi.mock('../../src/presentation/babylon/environment', () => ({ createEnvironment: (scene: Scene) => {
  scene.getLightByName = vi.fn().mockReturnValue({ intensity: 0 }); return { sun: { intensity: 0 } };
} }));
vi.mock('../../src/presentation/babylon/characterRig', () => ({ createCharacterRig: state.rig }));
vi.mock('../../src/presentation/audio/hubAudio', () => ({ createHubAudio: state.audio }));
vi.mock('../../src/presentation/town/townAssets', () => ({ createTownAssets: async () => [] }));
vi.mock('../../src/presentation/town/townScenery', () => ({ createTownScenery: () => ({ casters: [], receivers: [], cameraSolids: [] }) }));
vi.mock('../../src/presentation/region/regionTerrain', () => ({ createRegionTerrain: () => ({ ground: {} }) }));
vi.mock('../../src/presentation/region/regionScenery', () => ({ createRegionScenery: () => ({ casters: [], receivers: [], cameraSolids: [], setWaterRestored: vi.fn() }) }));
vi.mock('../../src/presentation/babylon/wind', () => ({ createWind: vi.fn() }));
vi.mock('../../src/presentation/babylon/clouds', () => ({ createClouds: vi.fn() }));
vi.mock('../../src/presentation/babylon/postProcessing', () => ({ createAtmosphere: vi.fn() }));
vi.mock('../../src/presentation/babylon/crystals', () => ({ createCrystals: () => ({}) }));

beforeEach(() => {
  state.events.length = 0;
  state.havok.mockReset().mockResolvedValue({});
  state.rig.mockReset(); state.audio.mockReset();
  vi.spyOn(Scene.prototype, 'enablePhysics').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

it('disposes the partial region when physics loading fails', async () => {
  const engine = new NullEngine();
  try {
    state.havok.mockRejectedValue(new Error('physics unavailable'));
    await expect(createRegionScene(engine, document.createElement('canvas'))).rejects.toThrow('physics unavailable');
    expect(engine.scenes).toHaveLength(0);
    expect(state.rig).not.toHaveBeenCalled();
  } finally { engine.dispose(); }
});
it('disposes the terrain world when avatar construction rejects', async () => {
  const engine = new NullEngine();
  try {
    state.rig.mockRejectedValue(new Error('avatar unavailable'));
    await expect(createRegionScene(engine, document.createElement('canvas'))).rejects.toThrow('avatar unavailable');
    expect(engine.scenes).toHaveLength(0);
  } finally { engine.dispose(); }
});
it('releases the completed rig before its scene if later setup fails', async () => {
  const engine = new NullEngine();
  try {
    state.rig.mockImplementation(async (scene: Scene) => {
      scene.onDisposeObservable.add(() => state.events.push('scene'));
      return {
        player: { motion: {}, root: { position: Vector3.Zero(), rotation: Vector3.Zero() } },
        follow: { camera: {} }, shadows: { cast: vi.fn(), receive: vi.fn() },
        dispose: () => state.events.push('rig'),
      };
    });
    state.audio.mockImplementation(() => { throw new Error('audio setup failed'); });
    await expect(createRegionScene(engine, document.createElement('canvas'))).rejects.toThrow('audio setup failed');
    expect(state.events).toEqual(['rig', 'scene']);
    expect(engine.scenes).toHaveLength(0);
  } finally { engine.dispose(); }
});
it('resets to the town gate even when the region was loaded at an expedition return', async () => {
  const engine = new NullEngine(), teleport = vi.fn();
  try {
    state.rig.mockResolvedValue({
      player: { motion: {}, root: { position: Vector3.Zero(), rotation: Vector3.Zero() }, teleport },
      follow: { camera: {}, snap: vi.fn() }, shadows: { cast: vi.fn(), receive: vi.fn() },
      dispose: vi.fn(), suspendInput: vi.fn(),
    });
    state.audio.mockReturnValue({ whenReady:vi.fn().mockResolvedValue(undefined), setMusicScene: vi.fn(), dispose: vi.fn() });
    const region = await createRegionScene(engine, document.createElement('canvas'), { x: 0, y: 1.3, z: -110 });
    region.reset();
    expect(teleport.mock.calls[0][0].asArray()).toEqual([REGION_SPAWN.x, REGION_SPAWN.y, REGION_SPAWN.z]);
    region.dispose();
  } finally { engine.dispose(); }
});

it('switches town and meadow music at the gate without restarting inside a zone', async () => {
  const engine = new NullEngine(), position = new Vector3(0, 1.3, -35);
  const setMusicScene = vi.fn();
  try {
    state.rig.mockResolvedValue({
      player: { motion: {}, root: { position, rotation: Vector3.Zero() }, capsulePosition: () => position },
      follow: { camera: { position: new Vector3(0, 4, -40), getTarget: () => position, setTarget: vi.fn() } },
      shadows: { cast: vi.fn(), receive: vi.fn() }, dispose: vi.fn(), suspendInput: vi.fn(),
    });
    state.audio.mockReturnValue({ whenReady:vi.fn().mockResolvedValue(undefined), setMusicScene, dispose: vi.fn() });
    const region = await createRegionScene(engine, document.createElement('canvas'));
    const step = (z: number) => { position.z = z; region.scene.onBeforeRenderObservable.notifyObservers(region.scene); };
    expect(setMusicScene.mock.calls).toEqual([['town']]);
    step(-40); step(-64);
    expect(setMusicScene).toHaveBeenCalledTimes(1);
    step(-66); step(-62); step(-100); step(-60);
    expect(setMusicScene.mock.calls).toEqual([['town'], ['meadow'], ['town']]);
    region.dispose();
  } finally { engine.dispose(); }
});

it('keeps the region builder pending until the required music is decoded',async()=>{
 const engine=new NullEngine();let ready!:()=>void;
 const whenReady=vi.fn(()=>new Promise<void>(resolve=>ready=resolve));
 try {
  state.rig.mockResolvedValue({player:{motion:{},root:{position:Vector3.Zero(),rotation:Vector3.Zero()}},follow:{camera:{}},shadows:{cast:vi.fn(),receive:vi.fn()},dispose:vi.fn(),suspendInput:vi.fn()});
  state.audio.mockReturnValue({whenReady,setMusicScene:vi.fn(),dispose:vi.fn()});
  const shown=vi.fn();const building=createRegionScene(engine,document.createElement('canvas')).then(region=>{shown();return region;});
  await vi.waitFor(()=>expect(whenReady).toHaveBeenCalledOnce());expect(shown).not.toHaveBeenCalled();
  expect(state.audio.mock.calls.at(-1)?.[3]).toEqual({musicCues:['music.town','music.meadow']});
  ready();const region=await building;expect(shown).toHaveBeenCalledOnce();region.dispose();
 }finally{engine.dispose();}
});
