import {expect,it,vi} from 'vitest';
import {createCourseAudio} from '../../src/presentation/course/courseAudio';
import {createStageAudio} from '../../src/presentation/audio/stageAudio';
import {createCourseRun} from '../../src/domain/course/courseProgress';
import {createCourseCombat} from '../../src/domain/course/courseCombat';
vi.mock('../../src/presentation/audio/stageAudio',()=>({createStageAudio:vi.fn()}));
it('announces new checkpoints, respawns and clear without repeating steady progress',()=>{
 const player={play:vi.fn(),finish:vi.fn()};vi.mocked(createStageAudio).mockReturnValue(player as any);
 const audio=createCourseAudio();const a=createCourseRun(),b={...a,checkpoint:1};audio.updateProgress(a,b);audio.updateProgress(b,b);
 expect(player.play).toHaveBeenCalledExactlyOnceWith('checkpoint');
 const c={...b,falls:1};audio.updateProgress(b,c);expect(player.play).toHaveBeenLastCalledWith('death');
 const d={...c,finished:true,checkpoint:3};audio.updateProgress(c,d);audio.updateProgress(d,d);expect(player.finish).toHaveBeenCalledOnce();
});
it('announces real enemy impacts and damage, not unchanged combat',()=>{
 const player={play:vi.fn(),finish:vi.fn()};vi.mocked(createStageAudio).mockReturnValue(player as any);
 const audio=createCourseAudio(),a=createCourseCombat(),b={...a,defeated:1};audio.updateCombat(a,b);audio.updateCombat(b,b);expect(player.play).toHaveBeenCalledExactlyOnceWith('hit');
 audio.updateCombat(b,{...b,health:2,damage:1});expect(player.play).toHaveBeenCalledTimes(2);
});

it('plays a coin cue once when the collected count increases',()=>{
 const player={play:vi.fn(),finish:vi.fn()};vi.mocked(createStageAudio).mockReturnValue(player as any);
 const audio=createCourseAudio(),before=createCourseRun(),after={...before,collected:[0]};
 audio.updateProgress(before,after);audio.updateProgress(after,after);expect(player.play).toHaveBeenCalledExactlyOnceWith('coin');
});
