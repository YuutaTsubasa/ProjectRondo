import {expect,it} from 'vitest';
import {projectStagePoint,stageHeading} from '../../src/presentation/hud/stageNavigation';
it('projects relative to player with positive map y upward and clamps distant targets',()=>{
 expect(projectStagePoint({x:10,y:30},{x:10,y:10})).toEqual({x:100,y:50});
 expect(projectStagePoint({x:110,y:10},{x:10,y:10},true)).toEqual({x:172,y:100});
 expect(projectStagePoint({x:10,y:10},{x:10,y:10},true)).toEqual({x:100,y:100});
});
it('turns the arrow with player facing, including side-view left/right',()=>{
 expect(stageHeading({x:0,y:1})).toBe(0);
 expect(stageHeading({x:1,y:0})).toBe(90);
 expect(stageHeading({x:-1,y:0})).toBe(-90);
});
