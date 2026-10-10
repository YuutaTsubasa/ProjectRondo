import {expect,it} from 'vitest';
import {scoreStage, PALACE_RANK_TIMES, COURSE_RANK_TIMES} from '../../src/domain/course/stageScore';
const perfect={elapsed:30,times:PALACE_RANK_TIMES,coins:25,coinTarget:25,enemies:8,enemyTarget:8,checkpoints:3,checkpointTarget:3,damage:0,falls:0};
it('preserves ProjectAlmost scoring and rank thresholds',()=>{
 expect(scoreStage(perfect)).toMatchObject({total:1000,rank:'S'});
 expect(scoreStage({...perfect,damage:1,falls:1})).toMatchObject({total:740,rank:'A'});
 expect(scoreStage({...perfect,damage:3,falls:1}).rank).toBe('B');
 expect(scoreStage({...perfect,damage:5,falls:1}).rank).toBe('C');
 expect(scoreStage({...perfect,damage:6,falls:1}).rank).toBe('D');
});
it('preserves time tiers, decay and zero-target optional categories',()=>{
 for(const [elapsed,time] of [[30,300],[42,240],[58,170],[78,100],[80,94],[120,0]])expect(scoreStage({...perfect,elapsed}).time).toBe(time);
 expect(scoreStage({...perfect,coins:0,coinTarget:0,enemies:0,enemyTarget:0}).total).toBe(1000);
 expect(scoreStage({...perfect,coins:0,enemies:0,checkpoints:0}).total).toBe(600);
 expect(scoreStage({...perfect,times:COURSE_RANK_TIMES,elapsed:45}).rank).toBe('S');
});
