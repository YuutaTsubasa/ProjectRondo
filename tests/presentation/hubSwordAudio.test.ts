// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {Observable} from '@babylonjs/core/Misc/observable';
import type {Scene} from '@babylonjs/core/scene';
import type {Knight,KnightMotionSample} from '../../src/presentation/babylon/knight';
import {createHubAudio} from '../../src/presentation/audio/hubAudio';
const fake=vi.hoisted(()=>({play:vi.fn(),dispose:vi.fn()}));
vi.mock('../../src/presentation/audio/audioEngine',()=>({createGameAudio:async()=>({engine:{unlockAsync:async()=>{}},dispose:vi.fn()})}));
vi.mock('../../src/presentation/audio/soundBank',()=>({loadSoundBank:async()=>fake}));
it('world and 3D stage audio observe actual swings, rotate takes and stop observing on disposal',async()=>{
 const frames=new Observable<Scene>();
 const scene={onBeforeRenderObservable:frames,getEngine:()=>({getDeltaTime:()=>16})} as unknown as Scene;
 const stopped={isPlaying:false,from:0,to:1,animatables:[]};
 const knight={animations:{walk:stopped,run:stopped}} as unknown as Knight;
 let sample={planarSpeed:0,airborne:false,homing:false,homingEntrySeconds:null,bounced:false,swordSeconds:null} as KnightMotionSample;
 const audio=createHubAudio(scene,()=>sample,knight,{music:false});
 await vi.waitFor(()=>expect(frames.observers.length).toBe(1));
 const frame=(seconds:number|null)=>{sample={...sample,swordSeconds:seconds};frames.notifyObservers(scene);};
 frame(0);frame(.06);expect(fake.play).not.toHaveBeenCalled();
 frame(.10);frame(.10);frame(.2);
 expect(fake.play).toHaveBeenCalledTimes(1);expect(fake.play).toHaveBeenLastCalledWith('sword.swing',{variant:0});
 frame(null);frame(.1);expect(fake.play).toHaveBeenLastCalledWith('sword.swing',{variant:1});
 sample={...sample,homing:true,swordSeconds:null};frames.notifyObservers(scene);
 expect(fake.play.mock.calls.filter(c=>c[0]==='sword.swing')).toHaveLength(2);
 audio.dispose();await vi.waitFor(()=>expect(frames.observers).toHaveLength(0));expect(fake.dispose).toHaveBeenCalledOnce();
});
