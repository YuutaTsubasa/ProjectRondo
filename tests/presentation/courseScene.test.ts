// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {createCourseScene} from '../../src/presentation/babylon/courseScene';
import {getCourseStage} from '../../src/domain/course/courseStages';
import {createCourseRun} from '../../src/domain/course/courseProgress';
const state=vi.hoisted(()=>({rig:vi.fn(),guardUpdate:vi.fn(),coinUpdate:vi.fn()}));
vi.mock('../../src/presentation/babylon/havokModule',()=>({loadHavok:async()=>({})}));
vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin',()=>({HavokPlugin:class{}}));
vi.mock('../../src/presentation/babylon/environment',()=>({createEnvironment:(scene:Scene)=>{scene.getLightByName=vi.fn().mockReturnValue({intensity:0});return{sun:{intensity:0}};}}));
vi.mock('../../src/presentation/babylon/characterRig',()=>({createCharacterRig:state.rig}));
vi.mock('../../src/presentation/babylon/courseScenery',()=>({createCourseScenery:()=>({casters:[],receivers:[],update:vi.fn()})}));
vi.mock('../../src/presentation/babylon/crystals',()=>({createCrystals:(_scene:Scene,positions:unknown[])=>({positions,flash:vi.fn()})}));
vi.mock('../../src/presentation/course/courseCoins',()=>({createCourseCoins:()=>({update:state.coinUpdate})}));
vi.mock('../../src/presentation/course/courseGuards',()=>({loadCourseGuards:async()=>({update:state.guardUpdate,dispose:vi.fn()})}));
vi.mock('../../src/presentation/audio/hubAudio',()=>({createHubAudio:()=>({dispose:vi.fn()})}));
vi.mock('../../src/presentation/course/courseAudio',()=>({createCourseAudio:()=>({prepare:()=>Promise.resolve(),dispose:vi.fn(),updateCombat:vi.fn(),updateProgress:vi.fn(),reset:vi.fn(),pause:vi.fn()})}));
vi.mock('../../src/presentation/babylon/wind',()=>({createWind:vi.fn()}));
vi.mock('../../src/presentation/babylon/clouds',()=>({createClouds:vi.fn()}));
vi.mock('../../src/presentation/babylon/postProcessing',()=>({createAtmosphere:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
it('keeps selected-course combat and collectibles when restarting the scene',async()=>{
 const engine=new NullEngine();vi.spyOn(Scene.prototype,'enablePhysics').mockReturnValue(true);
 state.rig.mockResolvedValue({player:{motion:{},root:{rotation:Vector3.Zero(),getChildMeshes:()=>[]},capsulePosition:()=>Vector3.Zero()},follow:{camera:{}},shadows:{generator:{},cast:vi.fn(),receive:vi.fn()},suspendInput:vi.fn(),dispose:vi.fn()});
 try{
  const stage=getCourseStage('course-4'),course=await createCourseScene(engine,document.createElement('canvas'),stage);
  expect(course.combat.guards).toHaveLength(stage.guards.length);
  const before=createCourseRun(),after={...before,collected:[0,2],elapsed:2};course.updateAudio(before,after);
  expect(state.coinUpdate).toHaveBeenLastCalledWith([0,2],2);
  course.resetCombat(true);
  expect(course.combat.guards.map(g=>({x:g.x,y:g.y,z:g.z}))).toEqual(stage.guards.map(g=>({x:g.x,y:g.y,z:g.z})));
  expect(state.coinUpdate).toHaveBeenLastCalledWith([],0);
  course.dispose();expect(engine.scenes).toHaveLength(0);
 }finally{engine.dispose();}
});
